import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useKhatmStore } from '@/features/khatm/store';
import { useKhatmScreen } from '@/features/khatm/hooks/useKhatmQueries';
import { useAutoTracking } from '@/features/khatm/hooks/useAutoTracking';
import type { KhatmReadingContext } from '@/features/khatm/types';
import { JUZ_PAGE_RANGES } from '@/features/khatm/constants';
import { QuranPageRenderer } from '@/features/quran-reader/components/QuranPageRenderer';
import { ReaderToolbar } from '@/features/quran-reader/components/ReaderToolbar';
import { PageNavigationBar } from '@/features/quran-reader/components/PageNavigationBar';
import { BookmarkSheet } from '@/features/quran-reader/components/BookmarkSheet';
import { useReaderSettings } from '@/features/quran-reader/hooks/useReaderSettings';
import { useBookmarks } from '@/features/quran-reader/hooks/useBookmarks';
import { TOTAL_QURAN_PAGES, isValidQuranPage } from '@/features/quran-reader/types';

// ---------------------------------------------------------------------------
// KhatmAutoTracker — isolated component so useAutoTracking is called
// unconditionally within it (satisfies React hooks rules).
// Rendered only when a khatm reading context is active.
// ---------------------------------------------------------------------------
interface KhatmAutoTrackerProps {
  khatmContext: KhatmReadingContext;
  currentPage: number;
  assignmentId: string;
}

function KhatmAutoTracker({ khatmContext, currentPage, assignmentId }: KhatmAutoTrackerProps) {
  useAutoTracking({ khatmContext, currentPage, assignmentId });
  return null;
}

// ---------------------------------------------------------------------------
// QuranReaderPage — dynamic route [page].tsx
// ---------------------------------------------------------------------------
export default function QuranReaderPage() {
  const { page } = useLocalSearchParams<{ page: string }>();

  // [threat-model] US-5 AC-8: validate page param is integer 1-604.
  // No early return here — all hooks below must run on every render (Rules of
  // Hooks); the redirect for an invalid param happens in the effect below.
  const parsed = parseInt(page ?? '1', 10);
  const isValidPage = isValidQuranPage(parsed);
  const currentPage = isValidPage ? parsed : 1;

  const { fontSize, theme, showTranslation, setFontSize, setTheme, setShowTranslation } =
    useReaderSettings();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const khatmContext = useKhatmStore((s) => s.activeReadingContext);

  // Always call useKhatmScreen — guarded internally by enabled: Boolean(groupId)
  const { data: screenData } = useKhatmScreen(khatmContext?.groupId ?? '');

  // Resolve assignmentId: find the assignment for the active participant + juz
  const assignmentId = useMemo(() => {
    if (!khatmContext || !screenData) return null;
    const tile = screenData.juz_tiles.find(
      (t) => t.juz_number === khatmContext.juzNumber
    );
    const assignment = tile?.assignments.find(
      (a) => a.participant_id === khatmContext.participantId
    );
    return assignment?.assignment_id ?? null;
  }, [khatmContext, screenData]);

  const [bookmarkSheetVisible, setBookmarkSheetVisible] = useState(false);

  // Redirect invalid page params (deep links, out-of-range navigation)
  useEffect(() => {
    if (!isValidPage) router.replace('/(quran-reader)/1');
  }, [isValidPage]);

  // Out-of-range toast (US-10 AC-4)
  const [showOutOfRangeBanner, setShowOutOfRangeBanner] = useState(false);
  useEffect(() => {
    if (
      khatmContext &&
      (currentPage < khatmContext.startPage || currentPage > khatmContext.endPage)
    ) {
      setShowOutOfRangeBanner(true);
      const timer = setTimeout(() => setShowOutOfRangeBanner(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [currentPage, khatmContext]);

  // Navigation handlers — clamped to valid pages (the nav-bar buttons disable
  // at the bounds, but the swipe gesture also routes through these)
  const onPrevious = () => {
    if (currentPage > 1) router.replace(`/(quran-reader)/${currentPage - 1}`);
  };
  const onNext = () => {
    if (currentPage < TOTAL_QURAN_PAGES) router.replace(`/(quran-reader)/${currentPage + 1}`);
  };
  const onJumpToJuz = (juzNumber: number) =>
    router.replace(`/(quran-reader)/${JUZ_PAGE_RANGES[juzNumber].startPage}`);

  // Swipe gesture (US-6 AC-6, AC-7). runOnJS(true): the callbacks call
  // router.replace, which must run on the JS thread, not as a UI-thread worklet.
  const swipeGesture = Gesture.Pan()
    .runOnJS(true)
    .onEnd((e) => {
      if (e.translationX < -50) onNext();
      else if (e.translationX > 50) onPrevious();
    });

  if (!isValidPage) return null; // after all hooks — redirect effect is in flight

  return (
    <View style={styles.container}>
      {/* Khatm banner (US-10 AC-3) */}
      {khatmContext && (
        <View style={styles.khatmBanner}>
          <Text style={styles.khatmBannerText}>
            Reading Juz {khatmContext.juzNumber} for {screenData?.group?.title ?? ''}
          </Text>
        </View>
      )}

      {/* Out-of-range toast */}
      {showOutOfRangeBanner && (
        <View style={styles.outOfRangeBanner}>
          <Text style={styles.outOfRangeBannerText}>
            You've left your assigned Juz range
          </Text>
        </View>
      )}

      <ReaderToolbar
        fontSize={fontSize}
        theme={theme}
        showTranslation={showTranslation}
        isBookmarked={isBookmarked(currentPage)}
        onFontSizeChange={setFontSize}
        onThemeChange={setTheme}
        onTranslationToggle={() => setShowTranslation(!showTranslation)}
        onBookmarkToggle={() => toggleBookmark(currentPage)}
        onOpenBookmarksList={() => setBookmarkSheetVisible(true)}
      />

      <GestureDetector gesture={swipeGesture}>
        <View style={styles.readerArea}>
          <QuranPageRenderer
            pageNumber={currentPage}
            fontSize={fontSize}
            theme={theme}
            showTranslation={showTranslation}
          />
        </View>
      </GestureDetector>

      <PageNavigationBar
        currentPage={currentPage}
        onPrevious={onPrevious}
        onNext={onNext}
        onJumpToJuz={onJumpToJuz}
      />

      {/* Khatm auto-tracking — null-rendering, only when context + assignmentId ready */}
      {khatmContext && assignmentId && (
        <KhatmAutoTracker
          khatmContext={khatmContext}
          currentPage={currentPage}
          assignmentId={assignmentId}
        />
      )}

      <BookmarkSheet
        isVisible={bookmarkSheetVisible}
        onClose={() => setBookmarkSheetVisible(false)}
        onNavigateToPage={(p) => router.replace(`/(quran-reader)/${p}`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  khatmBanner: {
    backgroundColor: '#0D9488',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  khatmBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  outOfRangeBanner: {
    backgroundColor: '#F59E0B',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  outOfRangeBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  readerArea: { flex: 1 },
});
