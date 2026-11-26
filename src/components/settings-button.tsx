import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useFocus } from '@/context/focus-context';
import { useTheme } from '@/hooks/use-theme';

export function SettingsButton() {
  const theme = useTheme();
  const { t, openSettingsModal, hasMissingPermissions } = useFocus();

  return (
    <Pressable
      onPress={openSettingsModal}
      accessibilityRole="button"
      accessibilityLabel={t.schedule.settingsTitle}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <SymbolView
        name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
        size={20}
        tintColor={theme.text}
      />
      {hasMissingPermissions && <View style={styles.badgeDot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  badgeDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
});
