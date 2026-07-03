/**
 * T-24: E2E Reader Flow Tests
 * Covers: US-5, US-6, US-7, US-8, US-9
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@/features/quran-reader/api/quranApi', () => ({
  fetchQuranPage: jest.fn(),
  fetchTranslationPage: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn(),
    useMutation: jest.fn(() => ({ mutate: jest.fn() })),
    useQueryClient: jest.fn(() => ({
      cancelQueries: jest.fn(),
      getQueryData: jest.fn(() => []),
      setQueryData: jest.fn(),
      invalidateQueries: jest.fn(),
    })),
  };
});

jest.mock('@/features/auth/store', () => ({
  useAuthStore: jest.fn(() => ({
    session: { user: { id: 'user-123' } },
    profile: { id: 'user-123', display_name: 'Test User' },
    isLoading: false,
  })),
}));

jest.mock('@/features/khatm/store', () => ({
  useKhatmStore: jest.fn(() => null),
}));

jest.mock('@/features/khatm/hooks/useKhatmQueries', () => ({
  useKhatmScreen: jest.fn(() => ({ data: null })),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ page: '1' })),
}));

jest.mock('react-native-gesture-handler', () => {
  // require inside the factory — jest.mock factories cannot reference
  // out-of-scope variables like the top-level React import
  const mockReact = require('react');
  return {
    GestureDetector: ({ children }: { children: unknown }) =>
      mockReact.createElement(mockReact.Fragment, null, children),
    Gesture: {
      Pan: jest.fn(() => ({
        runOnJS: jest.fn().mockReturnThis(),
        onEnd: jest.fn().mockReturnThis(),
      })),
    },
  };
});

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn(() => ({
    getString: jest.fn(() => undefined),
    getBoolean: jest.fn(() => false),
    set: jest.fn(),
  })),
}));

const { fetchQuranPage, fetchTranslationPage } = require('@/features/quran-reader/api/quranApi');
const { useQuery } = require('@tanstack/react-query');

const mockPage1 = {
  pageNumber: 1,
  verses: [
    {
      number: 1,
      numberInSurah: 1,
      text: 'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ',
      surahNumber: 1,
      surahName: 'سُورَةُ ٱلْفَاتِحَةِ',
      surahEnglishName: 'Al-Faatiha',
    },
  ],
  surahName: 'سُورَةُ ٱلْفَاتِحَةِ',
  juzNumber: 1,
};

const getQuranPageRenderer = () =>
  require('@/features/quran-reader/components/QuranPageRenderer').QuranPageRenderer;
const getPageNavigationBar = () =>
  require('@/features/quran-reader/components/PageNavigationBar').PageNavigationBar;
const getReaderSettings = () =>
  require('@/features/quran-reader/hooks/useReaderSettings').useReaderSettings;
const getRouterModule = () => require('expo-router');

beforeEach(() => {
  jest.clearAllMocks();
  // Default useQuery shape so hooks that destructure its result don't crash
  // in tests that never set a per-test implementation
  (useQuery as jest.Mock).mockImplementation(() => ({
    isPending: true,
    isError: false,
    data: undefined,
    refetch: jest.fn(),
  }));
});

// Scenario 1: Page load success
test('QuranPageRenderer: renders Arabic text and juz header on success', async () => {
  (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
    if (queryKey[0] === 'quran-page') return { isPending: false, isError: false, data: mockPage1, refetch: jest.fn() };
    return { isPending: false, isError: false, data: undefined };
  });

  const QuranPageRenderer = getQuranPageRenderer();
  const { getByText } = render(
    React.createElement(QuranPageRenderer, {
      pageNumber: 1,
      fontSize: 'medium',
      theme: 'light',
      showTranslation: false,
    })
  );

  await waitFor(() => {
    expect(getByText(/Juz 1/)).toBeTruthy();
    expect(getByText('بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ')).toBeTruthy();
  });
});

// Scenario 2: Page load error → retry
test('QuranPageRenderer: shows retry button on error, re-fetches on tap', async () => {
  const mockRefetch = jest.fn();
  (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
    if (queryKey[0] === 'quran-page')
      return { isPending: false, isError: true, data: undefined, refetch: mockRefetch };
    return { isPending: false, isError: false, data: undefined };
  });

  const QuranPageRenderer = getQuranPageRenderer();
  const { getByText } = render(
    React.createElement(QuranPageRenderer, {
      pageNumber: 1,
      fontSize: 'medium',
      theme: 'light',
      showTranslation: false,
    })
  );

  await waitFor(() => {
    expect(getByText(/Could not load this page/)).toBeTruthy();
  });

  fireEvent.press(getByText(/Could not load this page/));
  expect(mockRefetch).toHaveBeenCalled();
});

// Scenario 3: Translation toggle
test('QuranPageRenderer: renders translation text when showTranslation=true', async () => {
  const translationData = [{ number: 1, numberInSurah: 1, text: 'In the name of Allah' }];
  (useQuery as jest.Mock).mockImplementation(({ queryKey }) => {
    if (queryKey[0] === 'quran-page') return { isPending: false, isError: false, data: mockPage1, refetch: jest.fn() };
    if (queryKey[0] === 'quran-translation') return { isPending: false, isError: false, data: translationData };
    return { isPending: false, isError: false, data: undefined };
  });

  const QuranPageRenderer = getQuranPageRenderer();
  const { getByText } = render(
    React.createElement(QuranPageRenderer, {
      pageNumber: 1,
      fontSize: 'medium',
      theme: 'light',
      showTranslation: true,
    })
  );

  await waitFor(() => {
    expect(getByText('In the name of Allah')).toBeTruthy();
  });
});

// Scenario 4: Navigation bounds — Previous disabled at page 1
test('PageNavigationBar: Previous button is disabled on page 1', () => {
  const PageNavigationBar = getPageNavigationBar();
  const { getByLabelText } = render(
    React.createElement(PageNavigationBar, {
      currentPage: 1,
      onPrevious: jest.fn(),
      onNext: jest.fn(),
      onJumpToJuz: jest.fn(),
    })
  );
  const prevBtn = getByLabelText('Previous page');
  expect(prevBtn.props.accessibilityState.disabled).toBe(true);
});

// Scenario 5: Navigation bounds — Next disabled at page 604
test('PageNavigationBar: Next button is disabled on page 604', () => {
  const PageNavigationBar = getPageNavigationBar();
  const { getByLabelText } = render(
    React.createElement(PageNavigationBar, {
      currentPage: 604,
      onPrevious: jest.fn(),
      onNext: jest.fn(),
      onJumpToJuz: jest.fn(),
    })
  );
  const nextBtn = getByLabelText('Next page');
  expect(nextBtn.props.accessibilityState.disabled).toBe(true);
});

// Scenario 6: Reader settings persistence (MMKV)
test('useReaderSettings: setFontSize stores value in MMKV', () => {
  const mockSet = jest.fn();
  const { MMKV } = require('react-native-mmkv');
  (MMKV as jest.Mock).mockReturnValue({
    getString: jest.fn(() => undefined),
    getBoolean: jest.fn(() => false),
    set: mockSet,
  });

  const { renderHook } = require('@testing-library/react-native');
  const { useReaderSettings } = require('@/features/quran-reader/hooks/useReaderSettings');
  const { result } = renderHook(() => useReaderSettings());

  result.current.setFontSize('large');
  expect(mockSet).toHaveBeenCalledWith('quran-reader-font-size', 'large');
});

// Scenario 7: Invalid page redirect
test('QuranReaderPage: redirects to page 1 when route param is invalid', () => {
  const { router, useLocalSearchParams } = getRouterModule();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ page: 'abc' });

  const QuranReaderPage = require('@/app/(quran-reader)/[page]').default;
  render(React.createElement(QuranReaderPage));

  expect(router.replace).toHaveBeenCalledWith('/(quran-reader)/1');
});
