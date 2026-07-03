// ---------------------------------------------------------------------------
// T-14 Tests: QuranPageRenderer
// ---------------------------------------------------------------------------
// Run with: npx jest tests/QuranPageRenderer.test.tsx
// ---------------------------------------------------------------------------

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRefetch = jest.fn();
let mockQuranQuery: any = { isPending: false, isError: false, data: null };
let mockTranslationQuery: any = { isPending: false, isError: false, data: null };

jest.mock('../src/features/quran-reader/hooks/useQuranPage', () => ({
  useQuranPage: () => mockQuranQuery,
}));

jest.mock('../src/features/quran-reader/hooks/useTranslation', () => ({
  useTranslation: () => mockTranslationQuery,
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { QuranPageRenderer } from '../src/features/quran-reader/components/QuranPageRenderer';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultProps = {
  pageNumber: 1,
  fontSize: 'medium' as const,
  theme: 'light' as const,
  showTranslation: false,
};

const sampleVerses = [
  { number: 1, numberInSurah: 1, text: 'بِسْمِ اللَّهِ', surahNumber: 1, surahName: 'الفاتحة', surahEnglishName: 'Al-Fatiha' },
  { number: 2, numberInSurah: 2, text: 'الْحَمْدُ لِلَّهِ', surahNumber: 1, surahName: 'الفاتحة', surahEnglishName: 'Al-Fatiha' },
];

const samplePageData = {
  pageNumber: 1,
  verses: sampleVerses,
  surahName: 'الفاتحة',
  juzNumber: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuranPageRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefetch.mockReset();
    mockQuranQuery = { isPending: false, isError: false, data: null, refetch: mockRefetch };
    mockTranslationQuery = { isPending: false, isError: false, data: null };
  });

  it('renders ActivityIndicator when quranQuery.isPending', () => {
    mockQuranQuery = { isPending: true, isError: false, data: null, refetch: mockRefetch };
    const { UNSAFE_getByType } = render(<QuranPageRenderer {...defaultProps} />);
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('renders retry message and calls refetch on tap when isError', () => {
    mockQuranQuery = { isPending: false, isError: true, data: null, refetch: mockRefetch };
    const { getByText } = render(<QuranPageRenderer {...defaultProps} />);
    expect(getByText('Could not load this page. Tap to retry.')).toBeTruthy();
    fireEvent.press(getByText('Could not load this page. Tap to retry.'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('renders surah header with juz number on success', () => {
    mockQuranQuery = { isPending: false, isError: false, data: samplePageData, refetch: mockRefetch };
    const { getByText } = render(<QuranPageRenderer {...defaultProps} />);
    expect(getByText('الفاتحة — Juz 1')).toBeTruthy();
  });

  it('renders Arabic verse text for each verse', () => {
    mockQuranQuery = { isPending: false, isError: false, data: samplePageData, refetch: mockRefetch };
    const { getByText } = render(<QuranPageRenderer {...defaultProps} />);
    expect(getByText('بِسْمِ اللَّهِ')).toBeTruthy();
    expect(getByText('الْحَمْدُ لِلَّهِ')).toBeTruthy();
  });

  it('renders translation text when showTranslation=true and translation data is available', () => {
    mockQuranQuery = { isPending: false, isError: false, data: samplePageData, refetch: mockRefetch };
    mockTranslationQuery = {
      isPending: false,
      isError: false,
      data: [
        { number: 1, numberInSurah: 1, text: 'In the name of Allah' },
        { number: 2, numberInSurah: 2, text: 'All praise is for Allah' },
      ],
    };
    const { getByText } = render(
      <QuranPageRenderer {...defaultProps} showTranslation={true} />
    );
    expect(getByText('In the name of Allah')).toBeTruthy();
    expect(getByText('All praise is for Allah')).toBeTruthy();
  });

  it('does NOT render translation when showTranslation=false', () => {
    mockQuranQuery = { isPending: false, isError: false, data: samplePageData, refetch: mockRefetch };
    mockTranslationQuery = {
      isPending: false,
      isError: false,
      data: [{ number: 1, numberInSurah: 1, text: 'In the name of Allah' }],
    };
    const { queryByText } = render(
      <QuranPageRenderer {...defaultProps} showTranslation={false} />
    );
    expect(queryByText('In the name of Allah')).toBeNull();
  });

  it('shows "Translation unavailable" once when showTranslation=true and translationQuery.isError', () => {
    mockQuranQuery = { isPending: false, isError: false, data: samplePageData, refetch: mockRefetch };
    mockTranslationQuery = { isPending: false, isError: true, data: null };
    const { getAllByText } = render(
      <QuranPageRenderer {...defaultProps} showTranslation={true} />
    );
    const instances = getAllByText('Translation unavailable');
    expect(instances).toHaveLength(1);
  });
});
