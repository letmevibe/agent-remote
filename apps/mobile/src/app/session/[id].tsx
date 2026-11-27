import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChatSessionScreen } from '@/features/chat/ChatSessionScreen';

export default function SessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatSessionScreen sessionId={String(id ?? '')} />;
}
