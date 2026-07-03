import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useQuranPage } from '@/features/quran-reader/hooks/useQuranPage';
import { useTranslation } from '@/features/quran-reader/hooks/useTranslation';
import {
  FONT_SIZE_VALUES,
  THEME_COLORS,
  type FontSize,
  type ReaderTheme,
} from '@/features/quran-reader/types';

interface QuranPageRendererProps {
  pageNumber: number;
  fontSize: FontSize;
  theme: ReaderTheme;
  showTranslation: boolean;
}

export function QuranPageRenderer(props: QuranPageRendererProps): JSX.Element {
  const { pageNumber, fontSize, theme, showTranslation } = props;
  const quranQuery = useQuranPage(pageNumber);
  const translationQuery = useTranslation(pageNumber, showTranslation);

  const colors = THEME_COLORS[theme];

  if (quranQuery.isPending) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (quranQuery.isError) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <TouchableOpacity onPress={() => quranQuery.refetch()} style={styles.retryButton}>
          <Text style={{ color: colors.text }}>Could not load this page. Tap to retry.</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const data = quranQuery.data;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.header, { color: colors.text }]}>
        {data.surahName} — Juz {data.juzNumber}
      </Text>
      {showTranslation && translationQuery.isError ? (
        <Text style={[styles.translationUnavailable, { color: colors.secondaryText }]}>
          Translation unavailable
        </Text>
      ) : null}
      {data.verses.map((verse) => {
        // Match on the global verse number (1-6236) — numberInSurah is not
        // unique on pages spanning multiple surahs
        const translVerse =
          showTranslation && translationQuery.data
            ? translationQuery.data.find((t) => t.number === verse.number)
            : undefined;
        return (
          <View key={verse.number} style={styles.verseBlock}>
            <Text
              style={{
                fontSize: FONT_SIZE_VALUES[fontSize],
                color: colors.text,
                textAlign: 'right',
                writingDirection: 'rtl',
              }}
            >
              {verse.text}
            </Text>
            {translVerse ? (
              <Text style={{ color: colors.secondaryText }}>{translVerse.text}</Text>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButton: {
    padding: 16,
  },
  header: {
    fontSize: 16,
    fontWeight: '600',
    padding: 16,
    textAlign: 'center',
  },
  translationUnavailable: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  verseBlock: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
