import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {/* 主要的 Tabs 分頁 (包含紀錄與匯出功能) */}
        <Stack.Screen
          name="(tabs)"
          options={{}}
        />
        
        {/* 保留 Details 頁面設定 (如果有用到) */}
        <Stack.Screen
          name="details"
          options={{ title: "Details" }}
        />
      </Stack>
    </>
  );
}