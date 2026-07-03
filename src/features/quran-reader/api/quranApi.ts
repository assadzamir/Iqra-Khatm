import type { QuranPageData, TranslationVerse } from '@/features/quran-reader/types';
import { TOTAL_QURAN_PAGES } from '@/features/quran-reader/types';

export async function fetchQuranPage(pageNumber: number): Promise<QuranPageData> {
  if (pageNumber < 1 || pageNumber > TOTAL_QURAN_PAGES) {
    throw new RangeError(`pageNumber must be between 1 and ${TOTAL_QURAN_PAGES}`);
  }

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(
      `https://api.alquran.cloud/v1/page/${pageNumber}/quran-uthmani`,
      { signal: controller.signal }
    );
  } finally {
    clearTimeout(timerId);
  }

  if (response.status === 429) {
    throw Object.assign(new Error('Rate limited'), { type: 'RATE_LIMIT', status: 429 });
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.json();
  const ayahs = body.data.ayahs;

  return {
    pageNumber: body.data.number,
    verses: ayahs.map((a: Record<string, unknown>) => ({
      number:           a.number as number,
      numberInSurah:    a.numberInSurah as number,
      text:             a.text as string,
      surahNumber:      (a.surah as Record<string, unknown>).number as number,
      surahName:        (a.surah as Record<string, unknown>).name as string,
      surahEnglishName: (a.surah as Record<string, unknown>).englishName as string,
    })),
    surahName: (ayahs[0].surah as Record<string, unknown>).name as string,
    juzNumber: ayahs[0].juz as number,
  };
}

export async function fetchTranslationPage(
  pageNumber: number,
  edition: string = 'en.asad'
): Promise<TranslationVerse[]> {
  if (pageNumber < 1 || pageNumber > TOTAL_QURAN_PAGES) {
    throw new RangeError(`pageNumber must be between 1 and ${TOTAL_QURAN_PAGES}`);
  }

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(
      `https://api.alquran.cloud/v1/page/${pageNumber}/${edition}`,
      { signal: controller.signal }
    );
  } finally {
    clearTimeout(timerId);
  }

  if (response.status === 429) {
    throw Object.assign(new Error('Rate limited'), { type: 'RATE_LIMIT', status: 429 });
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.json();
  return body.data.ayahs.map((a: Record<string, unknown>) => ({
    number:        a.number as number,
    numberInSurah: a.numberInSurah as number,
    text:          a.text as string,
  }));
}
