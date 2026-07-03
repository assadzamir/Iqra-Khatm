import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import type { FontSize, ReaderTheme } from '@/features/quran-reader/types';
import { THEME_COLORS } from '@/features/quran-reader/types';

interface ReaderToolbarProps {
  fontSize: FontSize;
  theme: ReaderTheme;
  showTranslation: boolean;
  isBookmarked: boolean;
  onFontSizeChange: (size: FontSize) => void;
  onThemeChange: (theme: ReaderTheme) => void;
  onTranslationToggle: () => void;
  onBookmarkToggle: () => void;
  onOpenBookmarksList: () => void;
}

export function ReaderToolbar(props: ReaderToolbarProps) {
  const colors = THEME_COLORS[props.theme];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Font size picker */}
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.secondaryText }]}>Size</Text>
        {(['small', 'medium', 'large'] as FontSize[]).map((size) => (
          <TouchableOpacity
            key={size}
            style={[styles.btn, props.fontSize === size && styles.btnActive]}
            onPress={() => props.onFontSizeChange(size)}
            accessibilityLabel={`Font size ${size}`}
            accessibilityState={{ selected: props.fontSize === size }}
          >
            <Text style={{ color: props.fontSize === size ? '#FFFFFF' : colors.text }}>
              {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Theme picker */}
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.secondaryText }]}>Theme</Text>
        {(['light', 'dark', 'sepia'] as ReaderTheme[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.btn, props.theme === t && styles.btnActive]}
            onPress={() => props.onThemeChange(t)}
            accessibilityLabel={`Theme ${t}`}
            accessibilityState={{ selected: props.theme === t }}
          >
            <Text style={{ color: props.theme === t ? '#FFFFFF' : colors.text }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Translation toggle */}
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text }]}>Translation</Text>
        <Switch
          value={props.showTranslation}
          onValueChange={() => props.onTranslationToggle()}
          accessibilityLabel="Toggle translation"
        />
      </View>

      {/* Bookmark controls */}
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => props.onBookmarkToggle()}
          accessibilityLabel={props.isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        >
          <Text style={{ color: props.isBookmarked ? '#0D9488' : colors.secondaryText, fontSize: 22 }}>
            {props.isBookmarked ? '🔖' : '🏷'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => props.onOpenBookmarksList()}
          accessibilityLabel="View bookmarks"
        >
          <Text style={{ color: colors.text, fontSize: 14 }}>Bookmarks</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    flexWrap: 'wrap',
    gap: 6,
  },
  label: {
    fontSize: 13,
    marginRight: 6,
    minWidth: 52,
  },
  btn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: '#0D9488',
  },
  iconBtn: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
