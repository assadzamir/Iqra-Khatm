import { useEffect, useRef } from 'react';
import { mmkvStorage } from '@/lib/mmkv';
import { useUpdateProgress } from './useKhatmMutations';
import { useKhatmStore } from '../store';
import type { KhatmReadingContext } from '../types';

// MMKV key for queued failed progress updates
const PENDING_PROGRESS_KEY = 'khatm-pending-progress';

type PendingProgressItem = {
  assignment_id: string;
  group_id: string;
  participant_id: string;
  progress_percent: number;
  previous_percent: number;
  source: 'AUTO_TRACKING';
};

function readPendingQueue(): PendingProgressItem[] {
  try {
    const raw = mmkvStorage.getItem(PENDING_PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as PendingProgressItem[]) : [];
  } catch {
    return [];
  }
}

function writePendingQueue(items: PendingProgressItem[]): void {
  try {
    mmkvStorage.setItem(PENDING_PROGRESS_KEY, JSON.stringify(items));
  } catch {
    // Storage write failed — items remain in memory for this session only
  }
}

/**
 * useAutoTracking — tracks Quran reader page progress and writes to the
 * khatm_progress_updates ledger automatically.
 *
 * ## Usage
 * Call this hook from the Quran reader screen when a khatmContext navigation
 * param is present. Guard the call site:
 *
 * ```tsx
 * // In src/app/(quran-reader)/[page].tsx (or equivalent)
 * const khatmContext = route.params?.khatmContext;
 * if (khatmContext) {
 *   useAutoTracking({ khatmContext, currentPage, assignmentId });
 * }
 * ```
 *
 * ## assignment_id requirement
 * `UpdateProgressInput` requires an `assignment_id`. The caller must look up
 * the assignment ID before calling this hook — either by passing it as a param
 * or by fetching it from `useKhatmScreen` data. The `assignmentId` parameter
 * below is required for this reason.
 *
 * ## Throttle behaviour
 * Writes fire every 2+ page advance. Final write fires on unmount (reader exit).
 * All writes use `source: 'AUTO_TRACKING'`.
 *
 * ## Error behaviour
 * Failed writes are queued in MMKV under 'khatm-pending-progress' and retried
 * on the next successful write. This prevents silent data loss on network errors.
 *
 * @param params.khatmContext - Reading context set by JuzBottomSheet "Start Reading"
 * @param params.currentPage  - Current page number from the Quran reader
 * @param params.assignmentId - The khatm_juz_assignments.id for this Juz assignment
 */
export function useAutoTracking(params: {
  khatmContext: KhatmReadingContext;
  currentPage: number;
  assignmentId: string;
}): void {
  const { khatmContext, currentPage, assignmentId } = params;
  const updateProgress = useUpdateProgress();
  const setActiveReadingContext = useKhatmStore((s) => s.setActiveReadingContext);

  // Track the last page we wrote progress for
  const lastWrittenPage = useRef<number>(khatmContext.startPage - 1);
  // Track the last progress percent we wrote
  const lastProgressPercent = useRef<number>(0);

  /**
   * Compute progress percent from current page within the Juz page range.
   * Clamped to [0, 100].
   */
  const computeProgress = (page: number): number => {
    const totalPages = khatmContext.endPage - khatmContext.startPage + 1;
    const pagesRead = page - khatmContext.startPage + 1;
    return Math.min(100, Math.max(0, Math.round((pagesRead / totalPages) * 100)));
  };

  /**
   * Write progress to the server. On failure, queues the payload in MMKV
   * for retry on the next successful write.
   */
  const writeProgress = (page: number): void => {
    const progress_percent = computeProgress(page);
    const previous_percent = lastProgressPercent.current;

    // Flush any previously queued failed updates first
    flushPendingQueue();

    updateProgress.mutate(
      {
        assignment_id: assignmentId,
        group_id: khatmContext.groupId,
        participant_id: khatmContext.participantId,
        progress_percent,
        previous_percent,
        source: 'AUTO_TRACKING',
      },
      {
        onSuccess: () => {
          lastWrittenPage.current = page;
          lastProgressPercent.current = progress_percent;
        },
        onError: () => {
          const existing = readPendingQueue();
          writePendingQueue([
            ...existing,
            {
              assignment_id: assignmentId,
              group_id: khatmContext.groupId,
              participant_id: khatmContext.participantId,
              progress_percent,
              previous_percent,
              source: 'AUTO_TRACKING' as const,
            },
          ]);
        },
      }
    );
  };

  /**
   * Attempt to flush any queued failed progress updates.
   * Fire-and-forget — individual failures are re-queued by writeProgress.
   */
  const flushPendingQueue = (): void => {
    const pending = readPendingQueue();
    if (pending.length === 0) return;

    writePendingQueue([]);
    pending.forEach((payload) => {
      updateProgress.mutate(payload);
    });
  };

  // Main tracking effect — fires on every currentPage change
  useEffect(() => {
    const pageAdvance = currentPage - lastWrittenPage.current;
    const reachedEnd = currentPage >= khatmContext.endPage;

    // Write on 2+ page advance OR reaching the end of the Juz
    if (pageAdvance >= 2 || reachedEnd) {
      writeProgress(currentPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // Cleanup effect — fires on unmount (reader exit)
  useEffect(() => {
    return () => {
      // Write final progress if we have unwritten pages
      if (currentPage > lastWrittenPage.current) {
        writeProgress(currentPage);
      }
      // Clear the active reading context
      setActiveReadingContext(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
