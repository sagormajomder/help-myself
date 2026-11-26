import { SymbolView } from 'expo-symbols';
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PermissionsCard } from '@/components/permissions-card';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useFocus } from '@/context/focus-context';
import { useTheme } from '@/hooks/use-theme';

export function SettingsModal() {
  const safeInsets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    settings,
    t,
    settingsModalVisible,
    closeSettingsModal,
    updateSettings,
  } = useFocus();

  return (
    <Modal
      visible={settingsModalVisible}
      transparent
      animationType="slide"
      onRequestClose={closeSettingsModal}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={closeSettingsModal} />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.background,
              paddingBottom: Math.max(safeInsets.bottom, Spacing.three) + Spacing.two,
            },
          ]}>
          <View style={[styles.handle, { backgroundColor: theme.backgroundSelected }]} />

          <View style={styles.sheetHeader}>
            <ThemedText type="subtitle">{t.schedule.settingsTitle}</ThemedText>
            <Pressable
              onPress={closeSettingsModal}
              accessibilityRole="button"
              accessibilityLabel={t.today.alarmModal.dismiss}
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                size={16}
                tintColor={theme.text}
              />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            {/* App Settings Card */}
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              {/* Language Switch */}
              <View style={styles.settingRow}>
                <ThemedText>{t.schedule.languageLabel}</ThemedText>
                <View style={styles.langToggle}>
                  <Pressable
                    onPress={() => void updateSettings({ language: 'bn' })}
                    style={[
                      styles.langBtn,
                      {
                        backgroundColor:
                          settings.language === 'bn' ? '#2563EB' : theme.backgroundSelected,
                      },
                    ]}>
                    <ThemedText
                      style={{
                        color: settings.language === 'bn' ? '#FFFFFF' : theme.text,
                        fontWeight: '700',
                      }}>
                      বাংলা
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => void updateSettings({ language: 'en' })}
                    style={[
                      styles.langBtn,
                      {
                        backgroundColor:
                          settings.language === 'en' ? '#2563EB' : theme.backgroundSelected,
                      },
                    ]}>
                    <ThemedText
                      style={{
                        color: settings.language === 'en' ? '#FFFFFF' : theme.text,
                        fontWeight: '700',
                      }}>
                      English
                    </ThemedText>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingTextWrap}>
                  <ThemedText>{t.schedule.autoContinueLabel}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t.schedule.autoContinueDesc}
                  </ThemedText>
                </View>
                <Switch
                  value={settings.autoContinue}
                  onValueChange={(v) => void updateSettings({ autoContinue: v })}
                />
              </View>

              <View style={styles.settingRow}>
                <ThemedText>{t.schedule.soundLabel}</ThemedText>
                <Switch
                  value={settings.soundEnabled}
                  onValueChange={(v) => void updateSettings({ soundEnabled: v })}
                />
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingTextWrap}>
                  <ThemedText>{t.schedule.voiceLabel}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t.schedule.voiceDesc}
                  </ThemedText>
                </View>
                <Switch
                  value={settings.voiceEnabled}
                  onValueChange={(v) => void updateSettings({ voiceEnabled: v })}
                />
              </View>

              <View style={styles.settingRow}>
                <ThemedText>{t.schedule.vibrationLabel}</ThemedText>
                <Switch
                  value={settings.vibrationEnabled}
                  onValueChange={(v) => void updateSettings({ vibrationEnabled: v })}
                />
              </View>
            </View>

            {/* Permissions & Device Card — automatically removed once all permissions are granted */}
            <PermissionsCard />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: Spacing.three,
    gap: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  scrollContent: {
    gap: 14,
    paddingBottom: Spacing.two,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  settingTextWrap: {
    flex: 1,
    gap: 2,
  },
  langToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
});
