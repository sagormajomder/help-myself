import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

const FOCUS_CHIME = require('@/assets/sounds/focus_chime.wav');
const REST_CHIME = require('@/assets/sounds/rest_chime.wav');

let activePlayer: AudioPlayer | null = null;
let audioConfigured = false;

async function ensureAudioMode(): Promise<void> {
  if (audioConfigured) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
    });
    audioConfigured = true;
  } catch {
    // Web or restricted environments may reject audio mode configuration
  }
}

export async function playAlarmFeedback(
  kind: 'focus_complete' | 'rest_complete' | 'range_complete' | 'individual_complete',
  options: { soundEnabled: boolean; vibrationEnabled: boolean }
): Promise<void> {
  if (options.vibrationEnabled) {
    try {
      await Haptics.notificationAsync(
        kind === 'rest_complete'
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success
      );
    } catch {
      // Haptics unavailable on web/unsupported devices
    }
  }

  if (!options.soundEnabled) return;

  try {
    await ensureAudioMode();
    if (activePlayer) {
      activePlayer.remove();
      activePlayer = null;
    }
    const source = kind === 'rest_complete' ? REST_CHIME : FOCUS_CHIME;
    const player = createAudioPlayer(source);
    activePlayer = player;
    player.play();
  } catch {
    // Ignore playback errors in headless/unsupported environments
  }
}

export function stopAlarmSound(): void {
  if (activePlayer) {
    try {
      activePlayer.pause();
      activePlayer.remove();
    } catch {
      // Ignore cleanup errors
    }
    activePlayer = null;
  }
}
