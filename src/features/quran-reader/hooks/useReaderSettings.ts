import { useState } from 'react';
import { useColorScheme } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import type { FontSize, ReaderTheme } from '@/features/quran-reader/types';
import { READER_MMKV_KEYS } from '@/features/quran-reader/types';

const storage = new MMKV({ id: 'quran-reader-settings' });

export function useReaderSettings() {
  const colorScheme = useColorScheme();
  const defaultTheme: ReaderTheme = colorScheme === 'dark' ? 'dark' : 'light';

  const [fontSize, setFontSizeState] = useState<FontSize>(
    () => (storage.getString(READER_MMKV_KEYS.fontSize) as FontSize | undefined) ?? 'medium'
  );
  const [theme, setThemeState] = useState<ReaderTheme>(
    () => (storage.getString(READER_MMKV_KEYS.theme) as ReaderTheme | undefined) ?? defaultTheme
  );
  const [showTranslation, setShowTranslationState] = useState<boolean>(
    () => storage.getBoolean(READER_MMKV_KEYS.translationOn) ?? false
  );

  return {
    fontSize,
    theme,
    showTranslation,
    setFontSize: (size: FontSize) => {
      storage.set(READER_MMKV_KEYS.fontSize, size);
      setFontSizeState(size);
    },
    setTheme: (t: ReaderTheme) => {
      storage.set(READER_MMKV_KEYS.theme, t);
      setThemeState(t);
    },
    setShowTranslation: (show: boolean) => {
      storage.set(READER_MMKV_KEYS.translationOn, show);
      setShowTranslationState(show);
    },
  };
}
