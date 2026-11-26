import * as Speech from 'expo-speech';

import type { AppLanguage } from '@/types/focus';

let cachedVoices: Speech.Voice[] | null = null;

async function pickBestLanguageTag(lang: AppLanguage): Promise<string> {
  try {
    if (!cachedVoices) {
      cachedVoices = await Speech.getAvailableVoicesAsync();
    }
    if (lang === 'bn') {
      const hasBengali = cachedVoices.some((v) =>
        v.language.toLowerCase().startsWith('bn')
      );
      return hasBengali ? 'bn-BD' : 'en-US';
    }
    return 'en-US';
  } catch {
    return lang === 'bn' ? 'bn-BD' : 'en-US';
  }
}

export async function speakAnnouncement(
  text: string,
  lang: AppLanguage,
  fallbackEnglishText?: string
): Promise<void> {
  try {
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) {
      await Speech.stop();
    }

    const chosenLang = await pickBestLanguageTag(lang);
    const spokenText =
      lang === 'bn' && chosenLang === 'en-US' && fallbackEnglishText
        ? fallbackEnglishText
        : text;

    Speech.speak(spokenText, {
      language: chosenLang,
      pitch: 1.0,
      rate: 0.95,
    });
  } catch {
    // Speech unavailable on current platform/device
  }
}

export async function stopSpeech(): Promise<void> {
  try {
    await Speech.stop();
  } catch {
    // Ignore stop errors
  }
}
