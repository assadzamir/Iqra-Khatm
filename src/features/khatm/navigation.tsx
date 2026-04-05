import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GroupKhatmScreen } from './screens/GroupKhatmScreen';
import { CompletionScreen } from './screens/CompletionScreen';

export type KhatmStackParamList = {
  GroupKhatm: { groupId?: string; joinCode?: string };
  Completion: { groupId: string };
};

const Stack = createNativeStackNavigator<KhatmStackParamList>();

export function KhatmStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GroupKhatm" component={GroupKhatmScreen} />
      <Stack.Screen name="Completion" component={CompletionScreen} />
    </Stack.Navigator>
  );
}
