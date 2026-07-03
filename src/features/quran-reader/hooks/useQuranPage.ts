import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { fetchQuranPage } from '@/features/quran-reader/api/quranApi';
import type { QuranPageData } from '@/features/quran-reader/types';

export function useQuranPage(pageNumber: number): UseQueryResult<QuranPageData> {
  return useQuery({
    queryKey: ['quran-page', pageNumber],
    queryFn: () => fetchQuranPage(pageNumber),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: (failureCount, error) => {
      const isRateLimit = (error as { type?: string })?.type === 'RATE_LIMIT';
      return isRateLimit && failureCount < 1;
    },
    retryDelay: 2000,
  });
}
