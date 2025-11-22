import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Button, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { CameraView, useCameraPermissions, Camera } from 'expo-camera';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import Sentiment1 from '../../material/1.svg';
import Sentiment2 from '../../material/2.svg';
import Sentiment3 from '../../material/3.svg';
import Sentiment4 from '../../material/4.svg';
import Sentiment5 from '../../material/5.svg';

// ----------------------------------------------------
// I. 資料庫操作 (SQLite) - 使用新的 expo-sqlite API (SDK 51+)
// ----------------------------------------------------
let dbInstance = null;

const getDB = async () => {
  if (dbInstance) return dbInstance;
  
  try {
    // 使用新的 API: openDatabaseAsync
    dbInstance = await SQLite.openDatabaseAsync('esm_app.db');
    console.log('SQLite 資料庫已成功開啟');
    return dbInstance;
  } catch (error) {
    console.error('SQLite 初始化失敗:', error);
    return null;
  }
};

/**
 * 初始化資料庫：建立紀錄表格
 * 使用新的 expo-sqlite API (SDK 51+)
 */
let dbInitialized = false;
const initDB = async () => {
  if (dbInitialized) return;
  
  try {
    const db = await getDB();
    if (!db) return;
    
    dbInitialized = true;
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sentiment INTEGER NOT NULL,
        videoUri TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        timestamp INTEGER NOT NULL
      );
    `);
    console.log('資料庫初始化成功');
  } catch (error) {
    console.error('資料庫初始化失敗:', error);
  }
};

/**
 * 寫入一筆新的紀錄到資料庫
 * 使用新的 expo-sqlite API (SDK 51+)
 */
const insertRecord = async (sentiment, videoUri, lat, long) => {
  try {
    const db = await getDB();
    if (!db) {
      Alert.alert('錯誤', '資料庫不可用');
      return;
    }
    
    await db.runAsync(
      'INSERT INTO records (sentiment, videoUri, latitude, longitude, timestamp) VALUES (?, ?, ?, ?, ?)',
      [sentiment, videoUri, lat, long, Date.now()]
    );
    
    console.log(`紀錄已儲存: Sentiment=${sentiment}, Video=${videoUri}`);
    Alert.alert('成功', '紀錄已儲存！');
  } catch (error) {
    console.error('資料儲存失敗:', error);
    Alert.alert('錯誤', '資料儲存失敗。');
  }
};

// ----------------------------------------------------
// II. 通知設定 (Notification)
// ----------------------------------------------------

// 處理通知 (當 App 開啟時收到通知的行為)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * 設定每天固定時間的提醒通知 (09:00, 12:00, 15:00, 18:00)
 */
const scheduleDailyNotifications = async () => {
  // 1. 清除所有現有的通知
  await Notifications.cancelAllScheduledNotificationsAsync();

  // 2. 請求通知權限
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  // ⚠️ 警告: Expo Go 在 Android 上已移除遠端推播功能，但本地通知仍可運作。
  if (finalStatus !== 'granted') {
    Alert.alert('通知權限被拒絕', '請在系統設定中開啟權限以接收提醒。');
    return;
  }

  // 3. 設定每天固定時間的通知 (09:00, 12:00, 15:00, 18:00)
  const notificationTimes = [
    { hour: 9, minute: 0 },   // 09:00
    { hour: 12, minute: 0 },  // 12:00
    { hour: 15, minute: 0 },  // 15:00
    { hour: 18, minute: 0 },  // 18:00
  ];

  for (const time of notificationTimes) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "經驗抽樣提醒！",
        body: "請立即紀錄您的心情與環境。",
        sound: true,
        data: { time: `${time.hour}:${String(time.minute).padStart(2, '0')}` },
      },
      trigger: {
        hour: time.hour,
        minute: time.minute,
        repeats: true,
      },
    });
  }

  console.log('Notifications scheduled at 09:00, 12:00, 15:00, 18:00 daily.');
};


// ----------------------------------------------------
// III. 主元件
// ----------------------------------------------------
export default function HomeScreen() {
  // 狀態管理
  const [sentiment, setSentiment] = useState(null); // 心情分數 (1-5)
  const [isRecording, setIsRecording] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [facing, setFacing] = useState('back'); // 鏡頭方向: 'back' 或 'front'

  // 權限與 Refs
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  // --- 啟動初始化 ---
  useEffect(() => {
    (async () => {
      // 1. 初始化資料庫
      await initDB();
      
      // 2. 設定通知排程
      await scheduleDailyNotifications();

      // 3. 請求位置權限
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('警告', '位置權限被拒絕，將無法記錄 GPS 座標。');
      }
      
      setIsReady(true);
    })();
  }, []);

  // 分離的相機權限請求
  useEffect(() => {
    (async () => {
      if (cameraPermission === null) return; // 等待 hook 初始化
      
      if (!cameraPermission.granted) {
        console.log('正在請求相機權限...');
        const result = await requestCameraPermission();
        console.log('相機權限結果:', result.granted);
      }
    })();
  }, [cameraPermission]);

  // 如果沒有相機權限，顯示載入中
  if (!cameraPermission?.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.text}>正在請求相機權限...</Text>
      </View>
    );
  }
  
  // --- 核心操作 ---

  /**
   * 執行錄影、定位與儲存資料的流程
   */
  const handleRecordAndSave = async () => {
    if (!sentiment) {
      Alert.alert('警告', '請先選擇您的心情分數 (1-5)。');
      return;
    }

    if (!isReady || isRecording) return;

    if (!isCameraReady) {
      Alert.alert('提示', '相機正在準備中，請稍候再試。');
      return;
    }

    // 1. 執行錄影 (1 秒)
    setIsRecording(true);
    let videoData = null;
    try {
      if (!cameraRef.current) {
        throw new Error("相機尚未初始化");
      }
      
      videoData = await cameraRef.current.recordAsync({ maxDuration: 1 });
      console.log('錄影成功:', videoData.uri);
    } catch (e) {
      console.error('Video recording failed:', e);
      const errorMsg = e.message.includes('not ready') 
        ? '相機還在準備中,請稍後再試。' 
        : '錄影失敗,請確認相機權限並重試。';
      Alert.alert('錯誤', errorMsg);
      setIsRecording(false);
      return;
    }

    // 2. 取得 GPS 座標
    let location = { lat: null, long: null };
    try {
      let locationResult = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      location.lat = locationResult.coords.latitude;
      location.long = locationResult.coords.longitude;
      console.log(`Location obtained: ${location.lat}, ${location.long}`);
    } catch (e) {
      console.warn('Location data retrieval failed (may be denied):', e);
      // 即使定位失敗，仍允許儲存 (只紀錄為 null)
    }

    // 3. 將影片存到 app 本地資料夾
    let savedVideoUri = null;
    if (videoData?.uri) {
      try {
        // 產生檔名: timestamp_sentiment.mp4
        const timestamp = Date.now();
        const fileName = `${timestamp}_sentiment${sentiment}.mp4`;
        
        // 建立 app 專用的影片資料夾 (使用新的 API)
        const videosDir = FileSystem.documentDirectory + 'videos/';
        const newVideoUri = videosDir + fileName;
        
        // 確保資料夾存在,如果不存在就建立
        try {
          await FileSystem.makeDirectoryAsync(videosDir, { intermediates: true });
        } catch (e) {
          // 資料夾可能已存在,忽略錯誤
          if (!e.message.includes('already exists')) {
            throw e;
          }
        }

        // 移動影片到 app 資料夾
        await FileSystem.moveAsync({
          from: videoData.uri,
          to: newVideoUri
        });

        savedVideoUri = newVideoUri;
        console.log(`影片已儲存: ${savedVideoUri}`);
      } catch (error) {
        console.error('儲存影片失敗:', error);
        Alert.alert('錯誤', '影片儲存失敗: ' + error.message);
        setIsRecording(false);
        return;
      }
    }

    // 4. 寫入資料庫
    if (savedVideoUri) {
      try {
        await insertRecord(sentiment, savedVideoUri, location.lat, location.long);
        setSentiment(null); // 重設心情分數
        setIsRecording(false);
      } catch (error) {
        console.error('儲存紀錄時發生錯誤:', error);
        setIsRecording(false);
      }
    } else {
      setIsRecording(false);
    }
  };
  
  // --- UI 渲染 ---
  return (
    <View style={styles.container}>
      {/* 相機預覽區域 */}
      <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            mode="video"
            facing={facing}
            enableZoomGesture={false}
            onCameraReady={() => {
              console.log('相機硬體已準備就緒');
              setIsCameraReady(true);
            }}
          />
          {/* 鏡頭切換按鈕 */}
          <TouchableOpacity 
            style={styles.flipButton}
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFacing(current => (current === 'back' ? 'front' : 'back'));
            }}
            disabled={isRecording}
          >
            <Text style={styles.flipButtonText}>🔄</Text>
          </TouchableOpacity>
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>
              {!isCameraReady ? '相機準備中...' : isRecording ? '錄影中... (1秒)' : '請選擇心情再點擊錄影'}
            </Text>
          </View>
      </View>

      {/* 心情選單 */}
      <View style={styles.sentimentContainer}>
        {[1, 2, 3, 4, 5].map((score) => {
          const SentimentComponents = {
            1: Sentiment1,
            2: Sentiment2,
            3: Sentiment3,
            4: Sentiment4,
            5: Sentiment5,
          };
          const SentimentIcon = SentimentComponents[score];
          
          return (
            <TouchableOpacity
              key={score}
              onPress={async () => {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); // 觸覺回饋
                setSentiment(score);
              }}
              style={[
                styles.sentimentButton,
                sentiment === score && styles.selectedSentiment,
              ]}
              disabled={isRecording}
            >
              <SentimentIcon width="100%" height="100%" />
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.currentSentiment}>
        心情分數: {sentiment !== null ? sentiment : '未選擇'}
      </Text>


      {/* 錄影按鈕 */}
      <TouchableOpacity 
        onPress={async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); // 觸覺回饋
          handleRecordAndSave();
        }} 
        style={[styles.recordButton, (isRecording || !isCameraReady) && styles.recordingButton]}
        disabled={isRecording || !sentiment || !isCameraReady}
      >
        <Text style={styles.recordButtonText}>
          {!isCameraReady ? '相機準備中...' : isRecording ? '處理中...' : '紀錄 1 秒 Vlog'}
        </Text>
      </TouchableOpacity>
      
      {/* 底部導航/匯出連結 */}
       <TouchableOpacity 
         onPress={async () => {
           await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
         }}
       >
         <Link href="/settings" style={styles.exportLink} asChild>
           <Button 
             title="前往資料匯出頁面" 
             color="#333" 
           />
         </Link>
       </TouchableOpacity>
    </View>
  );
}

// ----------------------------------------------------
// IV. 樣式表 (黑白簡約風)
// ----------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    color: '#000',
    marginBottom: 10,
  },
  cameraContainer: {
    height: 300,
    width: '100%',
    marginTop: 60,
    marginBottom: 20,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000',
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  flipButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  flipButtonText: {
    fontSize: 24,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 10,
    alignItems: 'center',
  },
  overlayText: {
    color: '#fff',
    fontSize: 14,
  },
  sentimentContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  sentimentButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  selectedSentiment: {
    borderColor: '#000',
    borderWidth: 3,
  },
  sentimentImage: {
    width: '100%',
    height: '100%',
  },
  sentimentText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  currentSentiment: {
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 18,
    color: '#333',
  },
  recordButton: {
    backgroundColor: '#000',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  recordingButton: {
    backgroundColor: '#888', // 錄影中變灰色
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  exportLink: {
    textAlign: 'center',
    marginTop: 10,
    color: '#333',
    textDecorationLine: 'underline',
  }
});