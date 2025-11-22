import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';

// 使用新的 SQLite API (SDK 51+)
let dbInstance = null;
const getDB = async () => {
  if (dbInstance) return dbInstance;
  
  try {
    dbInstance = await SQLite.openDatabaseAsync('esm_app.db');
    return dbInstance;
  } catch (error) {
    console.error('SQLite 初始化失敗:', error);
    return null;
  }
};

export default function SettingsScreen() {
  const [count, setCount] = useState(0);

  // 讀取目前資料庫有幾筆資料
  const loadCount = async () => {
    try {
      const db = await getDB();
      if (!db) return;
      
      const result = await db.getFirstAsync('SELECT count(*) as count FROM records');
      setCount(result?.count || 0);
    } catch (error) {
      console.error('讀取記錄數量失敗:', error);
    }
  };

  // 進入頁面時自動讀取，並且每2秒更新一次
  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, 2000);
    return () => clearInterval(interval);
  }, []);

  // 為按鈕加入觸覺回饋的包裝函數
  const withHapticFeedback = (callback) => {
    return async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await callback();
    };
  };

  // ★ 核心功能：匯出資料 (作業要求)
  const exportData = async () => {
    try {
      const db = await getDB();
      if (!db) return;
      
      const data = await db.getAllAsync('SELECT * FROM records');
      
      if (data.length === 0) {
        Alert.alert('沒有資料', '請先去首頁 (Home) 錄製一些資料再匯出。');
        return;
      }

      // 轉成 CSV 檔案
      // CSV 標題行
      const headers = ['id', 'sentiment', 'videoUri', 'latitude', 'longitude', 'timestamp', 'datetime'];
      const csvHeader = headers.join(',');
      
      // 將時間戳記轉換為日期時間字串的函數
      const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      };
      
      // CSV 資料行
      const csvRows = data.map(row => {
        return headers.map(header => {
          let value = row[header];
          
          // 如果是 datetime 欄位，轉換時間戳記為日期時間
          if (header === 'datetime') {
            value = formatTimestamp(row.timestamp);
          }
          
          // 如果值包含逗號或換行，用雙引號包起來
          if (value && (String(value).includes(',') || String(value).includes('\n'))) {
            return `"${String(value).replace(/"/g, '""')}"`;
          }
          return value ?? '';
        }).join(',');
      });
      
      const csvString = [csvHeader, ...csvRows].join('\n');
      const fileUri = FileSystem.documentDirectory + 'esm_data.csv';

      await FileSystem.writeAsStringAsync(fileUri, csvString);
      
      // 呼叫手機的原生分享選單
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('錯誤', '此裝置不支援分享功能');
      }
    } catch (error) {
      console.error('匯出資料失敗:', error);
      Alert.alert('匯出失敗');
    }
  };

  // ★ 匯出影片功能
  const exportVideos = async () => {
    try {
      const db = await getDB();
      if (!db) return;
      
      // 從資料庫取得所有影片路徑
      const records = await db.getAllAsync('SELECT videoUri FROM records');
      
      if (records.length === 0) {
        Alert.alert('沒有影片', '請先去首頁 (Home) 錄製一些影片再匯出。');
        return;
      }

      // 取得所有影片檔案
      const videosDir = FileSystem.documentDirectory + 'videos/';
      
      // 檢查資料夾是否存在
      const dirInfo = await FileSystem.getInfoAsync(videosDir);
      if (!dirInfo.exists) {
        Alert.alert('沒有影片', '影片資料夾不存在。');
        return;
      }

      // 讀取資料夾中的所有檔案
      const files = await FileSystem.readDirectoryAsync(videosDir);
      const videoFiles = files.filter(file => file.endsWith('.mp4'));
      
      if (videoFiles.length === 0) {
        Alert.alert('沒有影片', '找不到任何影片檔案。');
        return;
      }

      // 顯示選擇對話框讓用戶選擇要匯出哪個影片
      Alert.alert(
        '選擇匯出方式',
        `共有 ${videoFiles.length} 個影片檔案`,
        [
          {
            text: '匯出最新影片',
            onPress: async () => {
              // 按照檔名排序（檔名包含時間戳記）
              const sortedFiles = videoFiles.sort().reverse();
              const latestVideo = videosDir + sortedFiles[0];
              
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(latestVideo, {
                  mimeType: 'video/mp4',
                  dialogTitle: '儲存或分享影片',
                });
              } else {
                Alert.alert('錯誤', '此裝置不支援分享功能');
              }
            }
          },
          {
            text: '匯出所有影片',
            onPress: async () => {
              // 逐一分享所有影片
              for (const file of videoFiles) {
                const videoPath = videosDir + file;
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(videoPath, {
                    mimeType: 'video/mp4',
                    dialogTitle: '儲存或分享影片',
                  });
                }
                // 給用戶時間處理每個影片
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          },
          {
            text: '取消',
            style: 'cancel'
          }
        ]
      );
      
    } catch (error) {
      console.error('匯出影片失敗:', error);
      Alert.alert('匯出失敗', error.message);
    }
  };

  // 清除資料 (方便測試用)
  const clearData = () => {
    Alert.alert('確認清除', '確定要刪除所有資料嗎？', [
      { text: '取消', style: 'cancel' },
      { 
        text: '刪除', 
        style: 'destructive', 
        onPress: async () => {
          try {
            const db = await getDB();
            if (!db) return;
            
            // 1. 刪除資料庫記錄
            await db.runAsync('DELETE FROM records');
            
            // 2. 刪除所有影片檔案
            const videosDir = FileSystem.documentDirectory + 'videos/';
            const dirInfo = await FileSystem.getInfoAsync(videosDir);
            
            if (dirInfo.exists) {
              // 讀取資料夾中的所有檔案
              const files = await FileSystem.readDirectoryAsync(videosDir);
              
              // 逐一刪除所有影片檔案
              for (const file of files) {
                const filePath = videosDir + file;
                await FileSystem.deleteAsync(filePath, { idempotent: true });
              }
              
              console.log(`已刪除 ${files.length} 個影片檔案`);
            }
            
            Alert.alert('已清除', '所有資料與影片已刪除');
            loadCount();
          } catch (error) {
            console.error('清除資料失敗:', error);
            Alert.alert('清除失敗', error.message);
          }
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>資料管理</Text>
      
      <View style={styles.card}>
        <Text style={styles.label}>目前已蒐集資料筆數：</Text>
        <Text style={styles.count}>{count}</Text>
      </View>

      <View style={styles.buttonGroup}>
        <Button title="匯出資料 (CSV)" onPress={withHapticFeedback(exportData)} />
        <View style={{ height: 20 }} />
        <Button title="匯出影片 (MP4)" onPress={withHapticFeedback(exportVideos)} color="#007AFF" />
        <View style={{ height: 20 }} />
        <Button title="清除所有資料 (RESET)" onPress={withHapticFeedback(clearData)} color="red" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 10, marginBottom: 30, alignItems: 'center', shadowOpacity: 0.1, shadowRadius: 5 },
  label: { fontSize: 16, color: '#666' },
  count: { fontSize: 48, fontWeight: 'bold', color: '#000', marginTop: 10 },
  buttonGroup: { gap: 10 }
});