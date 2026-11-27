import React from 'react';
import { Tabs } from 'expo-router';
import { GitCompare, Settings, Terminal } from 'lucide-react-native';
import { colors } from '@/theme/colors';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color, size }) => <Terminal color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="diff"
        options={{
          title: 'Diff',
          tabBarIcon: ({ color, size }) => <GitCompare color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Host',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
