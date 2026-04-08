import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, useColorScheme } from 'react-native';

export default function HomeScreen() {
  const isDark = useColorScheme() === 'dark';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? '#1C1C1E' : '#FAF8F2' }]}>
      <View style={styles.container}>
        <Text style={[styles.bismillah, { color: isDark ? '#E5E7EB' : '#1F2937' }]}>
          {'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ'}
        </Text>
        <Text style={[styles.welcome, { color: isDark ? '#F9FAFB' : '#111827' }]}>
          Welcome to Iqra
        </Text>
        <Text style={[styles.subtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
          Read, reflect, and complete the Quran together.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  bismillah: {
    fontSize: 28,
    fontFamily: 'System',
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 8,
  },
  welcome: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
