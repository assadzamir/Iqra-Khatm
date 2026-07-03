import { useRef, useEffect, useCallback, type JSX } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useBookmarks } from '@/features/quran-reader/hooks/useBookmarks';
import { JUZ_PAGE_RANGES } from '@/features/khatm/constants';
import type { Bookmark } from '@/features/quran-reader/types';

interface BookmarkSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onNavigateToPage: (page: number) => void;
}

function getJuzForPage(page: number): number {
  for (let juz = 1; juz <= 30; juz++) {
    const range = JUZ_PAGE_RANGES[juz];
    if (range && page >= range.startPage && page <= range.endPage) {
      return juz;
    }
  }
  return 1;
}

export function BookmarkSheet({ isVisible, onClose, onNavigateToPage }: BookmarkSheetProps): JSX.Element {
  const bottomSheetRef = useRef<BottomSheet | null>(null);
  const { bookmarks, isLoading } = useBookmarks();

  useEffect(() => {
    if (isVisible) {
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
    }
  }, [isVisible]);

  const handleChange = useCallback((index: number) => {
    if (index === -1) {
      onClose();
    }
  }, [onClose]);

  const renderItem = useCallback(({ item }: { item: Bookmark }) => {
    const juz = getJuzForPage(item.page_number);
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => {
          onNavigateToPage(item.page_number);
          onClose();
        }}
      >
        <Text style={styles.rowText}>{`Page ${item.page_number} — Juz ${juz}`}</Text>
      </TouchableOpacity>
    );
  }, [onNavigateToPage, onClose]);

  const renderContent = () => {
    if (isLoading) {
      return <ActivityIndicator style={styles.centered} />;
    }
    if (bookmarks.length === 0) {
      return <Text style={styles.empty}>No bookmarks yet.</Text>;
    }
    return null;
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={['50%', '90%']}
      enablePanDownToClose
      onChange={handleChange}
    >
      <View style={styles.container}>
        {renderContent() ?? (
          <BottomSheetFlatList
            data={bookmarks}
            keyExtractor={(item: Bookmark) => item.id}
            renderItem={renderItem}
          />
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  rowText: { fontSize: 16, color: '#1F2937' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 16, color: '#6B7280' },
  centered: { marginTop: 40 },
});
