import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, Animated, StyleSheet, useColorScheme } from 'react-native';
import { KHATM_COLORS } from '../constants';

interface BismillahOverlayProps {
  visible: boolean;
  onDismiss: () => void;
}

export function BismillahOverlay({ visible, onDismiss }: BismillahOverlayProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (visible) {
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

      timerRef.current = setTimeout(onDismiss, 2000);
    }

    return () => {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
    };
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View style={[styles.container, { opacity, backgroundColor: isDark ? KHATM_COLORS.darkBg : '#FFFFFF' }]}>
        <Text style={styles.bismillah}>
          {'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ'}
        </Text>
        <Text style={styles.subtitle}>Your Khatm has been created</Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bismillah: {
    fontFamily: 'Amiri',
    fontSize: 36,
    color: KHATM_COLORS.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 16,
    color: '#888888',
  },
});
