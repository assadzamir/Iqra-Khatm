import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useKhatmStore } from '@/features/khatm/store';
import { useKhatmScreen } from '@/features/khatm/hooks/useKhatmQueries';
import { useAutoTracking } from '@/features/khatm/hooks/useAutoTracking';
import type { KhatmReadingContext } from '@/features/khatm/types';

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
//
// khatm auto-tracking wiring:
//   1. Read activeReadingContext from khatm store (set by JuzBottomSheet "Start Reading")
//   2. Fetch screen data to resolve assignmentId for the active juz
//   3. Render <KhatmAutoTracker> which calls useAutoTracking
//
// The reader UI itself (Quran page rendering) lives in the existing Iqra
// reader — this file wires the khatm layer on top of it.
// ---------------------------------------------------------------------------

export default function QuranReaderPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const currentPage = parseInt(page ?? '1', 10);

  const khatmContext = useKhatmStore((s) => s.activeReadingContext);

  // Always call useKhatmScreen — guarded internally by enabled: Boolean(groupId)
  const { data: screenData } = useKhatmScreen(khatmContext?.groupId ?? '');

  // Resolve assignmentId: find the assignment for the active participant + juz
  const assignmentId = React.useMemo(() => {
    if (!khatmContext || !screenData) return null;
    const tile = screenData.juz_tiles.find(
      (t) => t.juz_number === khatmContext.juzNumber
    );
    const assignment = tile?.assignments.find(
      (a) => a.participant_id === khatmContext.participantId
    );
    return assignment?.assignment_id ?? null;
  }, [khatmContext, screenData]);

  return (
    <View style={styles.container}>
      {/* Khatm auto-tracking — rendered only when context + assignmentId are ready */}
      {khatmContext && assignmentId && (
        <KhatmAutoTracker
          khatmContext={khatmContext}
          currentPage={currentPage}
          assignmentId={assignmentId}
        />
      )}

      {/*
        Quran page content goes here.
        Replace this placeholder with the actual Iqra reader component,
        passing currentPage as a prop.
      */}
      <Text style={styles.placeholder}>Page {currentPage}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
});
