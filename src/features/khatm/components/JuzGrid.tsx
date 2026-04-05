import React from 'react';
import { Dimensions, FlatList, StyleSheet, View } from 'react-native';
import { JuzTile } from './JuzTile';
import type { AssignmentMode, JuzTileData } from '../types';

// ── Layout constants ─────────────────────────────────────────────────────────

const NUM_COLUMNS = 5;
const HORIZONTAL_PADDING = 16; // total left+right padding from parent
const TILE_MARGIN = 2;         // margin on each side of each tile

function getTileWidth(): number {
  const screenWidth = Dimensions.get('window').width;
  const availableWidth = screenWidth - HORIZONTAL_PADDING - NUM_COLUMNS * TILE_MARGIN * 2;
  return Math.floor(availableWidth / NUM_COLUMNS);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface JuzGridProps {
  /** Always 30 items, one per Juz */
  tiles: JuzTileData[];
  myParticipantId: string | null;
  assignmentMode: AssignmentMode;
  onTileTap: (juzNumber: number) => void;
}

// ── JuzGrid ──────────────────────────────────────────────────────────────────

export function JuzGrid({ tiles, onTileTap }: JuzGridProps) {
  const tileWidth = getTileWidth();
  const tileHeight = tileWidth; // square tiles
  const renderStart = React.useRef<number>(Date.now());

  return (
    <View style={styles.container}>
      <View
        onLayout={() => {
          if (__DEV__) {
            console.log('[JuzGrid] render time:', Date.now() - renderStart.current, 'ms');
            renderStart.current = Date.now(); // reset for next render
          }
        }}
      >
      <FlatList
        data={tiles}
        numColumns={NUM_COLUMNS}
        keyExtractor={(item) => item.juz_number.toString()}
        renderItem={({ item }) => (
          <JuzTile
            tile={item}
            tileWidth={tileWidth}
            onPress={() => onTileTap(item.juz_number)}
          />
        )}
        // Performance: fixed-height items eliminate layout measurement
        getItemLayout={(_, index) => ({
          length: tileHeight + TILE_MARGIN * 2,
          offset: (tileHeight + TILE_MARGIN * 2) * Math.floor(index / NUM_COLUMNS),
          index,
        })}
        // Parent ScrollView handles scrolling — disable FlatList internal scroll
        scrollEnabled={false}
        // Keep all 30 tiles mounted for instant Realtime state updates
        removeClippedSubviews={false}
        contentContainerStyle={styles.grid}
      />
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: HORIZONTAL_PADDING / 2,
  },
  grid: {
    alignItems: 'flex-start',
  },
});
