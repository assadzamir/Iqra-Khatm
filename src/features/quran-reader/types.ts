// Quran Reader feature shared types and constants
// QuranVerse shape derived from alquran.cloud API response ayah object
// Bookmark shape derived from user_bookmarks table in migration 005

// Madani mushaf page count — the single source of truth for page bounds
export const TOTAL_QURAN_PAGES = 604;

export function isValidQuranPage(page: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= TOTAL_QURAN_PAGES;
}

export type FontSize = 'small' | 'medium' | 'large';
export type ReaderTheme = 'light' | 'dark' | 'sepia';

export type QuranVerse = {
  number: number;           // global verse number (1-6236)
  numberInSurah: number;    // verse number within the surah
  text: string;             // Arabic text (Uthmani script)
  surahNumber: number;
  surahName: string;        // Arabic surah name
  surahEnglishName: string; // English surah name
};

export type QuranPageData = {
  pageNumber: number;
  verses: QuranVerse[];
  surahName: string;   // primary surah on this page
  juzNumber: number;
};

export type TranslationVerse = {
  number: number;
  numberInSurah: number;
  text: string;        // English translation text
};

export type Bookmark = {
  id: string;
  user_id: string;
  page_number: number;
  created_at: string;
};

export const FONT_SIZE_VALUES: Record<FontSize, number> = {
  small: 18,
  medium: 24,
  large: 32,
};

export const THEME_COLORS: Record<ReaderTheme, { bg: string; text: string; secondaryText: string }> = {
  light: { bg: '#FFFFFF', text: '#1F2937', secondaryText: '#6B7280' },
  dark:  { bg: '#121212', text: '#E5E7EB', secondaryText: '#9CA3AF' },
  sepia: { bg: '#F5E6C8', text: '#3E2723', secondaryText: '#5D4037' },
};

export const READER_MMKV_KEYS = {
  fontSize:            'quran-reader-font-size',
  theme:               'quran-reader-theme',
  translationOn:       'quran-reader-translation-on',
  pendingBookmarkOps:  'pending-bookmark-ops',
} as const;
