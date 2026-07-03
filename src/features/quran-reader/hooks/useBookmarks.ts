import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Bookmark } from '@/features/quran-reader/types';
import { READER_MMKV_KEYS } from '@/features/quran-reader/types';
import { useAuthStore } from '@/features/auth/store';
import { mmkvStorage } from '@/lib/mmkv';

type PendingBookmarkOp = {
  type: 'insert' | 'delete';
  page_number: number;
  user_id: string;
  queued_at: string; // ISO timestamp
};

function readPendingOps(): PendingBookmarkOp[] {
  try {
    const raw = mmkvStorage.getItem(READER_MMKV_KEYS.pendingBookmarkOps);
    return raw ? (JSON.parse(raw) as PendingBookmarkOp[]) : [];
  } catch { return []; }
}

function writePendingOps(ops: PendingBookmarkOp[]): void {
  mmkvStorage.setItem(READER_MMKV_KEYS.pendingBookmarkOps, JSON.stringify(ops));
}

export function useBookmarks() {
  const { session } = useAuthStore();
  const queryClient = useQueryClient();
  const userId = session?.user?.id ?? null;

  const queryKey = ['bookmarks', userId];

  const { data: bookmarks = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_bookmarks')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(200); // [threat-model] max 200 to prevent unbounded memory
      if (error) throw error;
      return data as Bookmark[];
    },
    enabled: !!userId,
  });

  const { mutate: toggleBookmark } = useMutation({
    mutationFn: async (page: number) => {
      if (!userId) throw new Error('Not authenticated');

      const existing = (bookmarks as Bookmark[]).find((b) => b.page_number === page);

      if (existing) {
        const { error } = await supabase
          .from('user_bookmarks')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_bookmarks')
          .insert({ user_id: userId, page_number: page });
        if (error) throw error;
      }

      // Flush any pending ops (with user_id security check)
      const pending = readPendingOps();
      const validOps = pending.filter((op) => op.user_id === userId);
      const invalidCount = pending.length - validOps.length;
      if (invalidCount > 0) {
        console.warn(`[useBookmarks] discarding ${invalidCount} mismatched pending ops`);
      }

      // Supabase calls resolve with { error } rather than throwing — check it
      // per op and requeue failures so offline changes are never lost.
      const stillPending: PendingBookmarkOp[] = [];
      for (const op of validOps) {
        let opFailed = false;
        try {
          if (op.type === 'insert') {
            const { error } = await supabase
              .from('user_bookmarks')
              .insert({ user_id: op.user_id, page_number: op.page_number });
            // 23505 (unique violation) means the bookmark already exists —
            // the op is effectively applied, don't requeue it
            if (error && error.code !== '23505') opFailed = true;
          } else {
            const { error } = await supabase
              .from('user_bookmarks')
              .delete()
              .eq('user_id', op.user_id)
              .eq('page_number', op.page_number);
            if (error) opFailed = true;
          }
        } catch (_e) {
          opFailed = true;
        }
        if (opFailed) stillPending.push(op);
      }
      writePendingOps(stillPending);
    },
    onMutate: async (page: number) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Bookmark[]>(queryKey) ?? [];

      // Optimistic update
      const existing = previous.find((b) => b.page_number === page);
      if (existing) {
        queryClient.setQueryData<Bookmark[]>(queryKey, previous.filter((b) => b.page_number !== page));
      } else {
        const optimistic: Bookmark = {
          id: `optimistic-${page}`,
          user_id: userId!,
          page_number: page,
          created_at: new Date().toISOString(),
        };
        queryClient.setQueryData<Bookmark[]>(queryKey, [optimistic, ...previous]);
      }

      return { previous };
    },
    onError: (_err, page, context) => {
      // Rollback optimistic update
      if (context?.previous) {
        queryClient.setQueryData<Bookmark[]>(queryKey, context.previous);
      }

      // Enqueue to MMKV offline queue
      if (userId) {
        const existing = (context?.previous ?? []).find((b) => b.page_number === page);
        const ops = readPendingOps();
        ops.push({
          type: existing ? 'delete' : 'insert',
          page_number: page,
          user_id: userId,
          queued_at: new Date().toISOString(),
        });
        writePendingOps(ops);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const isBookmarked = (page: number): boolean =>
    (bookmarks as Bookmark[]).some((b) => b.page_number === page);

  return {
    bookmarks: bookmarks as Bookmark[],
    isBookmarked,
    toggleBookmark,
    isLoading,
  };
}
