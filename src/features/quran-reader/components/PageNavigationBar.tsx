import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList, useColorScheme } from 'react-native';
import { useState } from 'react';
import { JUZ_ARABIC_NAMES, KHATM_COLORS } from '@/features/khatm/constants';
import { TOTAL_QURAN_PAGES } from '@/features/quran-reader/types';

interface PageNavigationBarProps {
  currentPage: number;
  onPrevious: () => void;
  onNext: () => void;
  onJumpToJuz: (juzNumber: number) => void;
}

export function PageNavigationBar(props: PageNavigationBarProps) {
  const [juzPickerVisible, setJuzPickerVisible] = useState(false);
  const isDark = useColorScheme() === 'dark';
  const navBg = isDark ? KHATM_COLORS.darkBg : '#FFFFFF';
  const textColor = isDark ? '#E5E7EB' : '#1F2937';

  const juzEntries = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <View style={[styles.container, { backgroundColor: navBg, borderTopColor: isDark ? '#374151' : '#E5E7EB' }]}>
      <TouchableOpacity
        style={[styles.btn, props.currentPage <= 1 && styles.btnDisabled]}
        onPress={props.onPrevious}
        disabled={props.currentPage <= 1}
        accessibilityLabel="Previous page"
        accessibilityState={{ disabled: props.currentPage <= 1 }}
      >
        <Text style={[styles.btnText, props.currentPage <= 1 && styles.btnTextDisabled]}>‹ Prev</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.pageCounter}
        onPress={() => setJuzPickerVisible(true)}
        accessibilityLabel={`Page ${props.currentPage}, tap to jump to juz`}
      >
        <Text style={[styles.pageText, { color: textColor }]}>Page {props.currentPage}</Text>
        <Text style={styles.juzHint}>Jump to Juz ▾</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, props.currentPage >= TOTAL_QURAN_PAGES && styles.btnDisabled]}
        onPress={props.onNext}
        disabled={props.currentPage >= TOTAL_QURAN_PAGES}
        accessibilityLabel="Next page"
        accessibilityState={{ disabled: props.currentPage >= TOTAL_QURAN_PAGES }}
      >
        <Text style={[styles.btnText, props.currentPage >= TOTAL_QURAN_PAGES && styles.btnTextDisabled]}>Next ›</Text>
      </TouchableOpacity>

      {/* Juz jump modal */}
      <Modal
        visible={juzPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setJuzPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setJuzPickerVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Jump to Juz</Text>
            <FlatList
              data={juzEntries}
              keyExtractor={(item) => String(item)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.juzRow}
                  onPress={() => {
                    props.onJumpToJuz(item);
                    setJuzPickerVisible(false);
                  }}
                  accessibilityLabel={`Juz ${item}`}
                >
                  <Text style={styles.juzRowText}>
                    Juz {item} — {JUZ_ARABIC_NAMES[item]}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  btn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.3 },
  btnText: { color: '#0D9488', fontSize: 16, fontWeight: '600' },
  btnTextDisabled: { color: '#9CA3AF' },
  pageCounter: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  pageText: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  juzHint: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
    paddingTop: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    color: '#1F2937',
  },
  juzRow: {
    minHeight: 44,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  juzRowText: { fontSize: 15, color: '#1F2937' },
});
