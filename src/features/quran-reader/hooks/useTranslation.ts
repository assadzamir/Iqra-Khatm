import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { fetchTranslationPage } from '@/features/quran-reader/api/quranApi';
import type { TranslationVerse } from '@/features/quran-reader/types';

export function useTranslation(pageNumber: number, enabled: boolean): UseQueryResult<TranslationVerse[]> {
  return useQuery({
    queryKey: ['quran-translation', pageNumber],
    queryFn: () => fetchTranslationPage(pageNumber),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled,
    retry: 0,
  });
}
