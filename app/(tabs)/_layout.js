import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons'; // 使用 Expo 內建圖標庫

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: 'black', headerShown: false }}>
      {/* 第一個分頁：對應 app/(tabs)/index.js */}
      <Tabs.Screen
        name="index"
        options={{
          title: '紀錄 (Home)',
          tabBarIcon: ({ color }) => <Ionicons name="camera" size={24} color={color} />,
        }}
      />
      
      {/* 第二個分頁：對應 app/(tabs)/settings.js */}
      <Tabs.Screen
        name="settings"
        options={{
          title: '匯出 (Export)',
          tabBarIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}