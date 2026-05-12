import AsyncStorage from '@react-native-async-storage/async-storage';
import { SK_SESSION_COUNT, SK_SHOWN_PROMPTS } from './storageKeys';

// Module-level flag: only one prompt shown per app session
let promptShownThisSession = false;

export async function incrementSessionCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SK_SESSION_COUNT);
    const count = (parseInt(raw ?? '0') || 0) + 1;
    await AsyncStorage.setItem(SK_SESSION_COUNT, String(count));
    return count;
  } catch {
    return 0;
  }
}

export async function getSessionCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SK_SESSION_COUNT);
    return parseInt(raw ?? '0') || 0;
  } catch {
    return 0;
  }
}

/**
 * Returns true if this prompt should be shown:
 * - Session count >= threshold
 * - Prompt not already shown in a previous session
 * - No other prompt shown this session
 */
export async function shouldShowPrompt(id: string, sessionThreshold: number): Promise<boolean> {
  if (promptShownThisSession) return false;
  try {
    const count = await getSessionCount();
    if (count < sessionThreshold) return false;
    const raw = await AsyncStorage.getItem(SK_SHOWN_PROMPTS);
    const shown: string[] = raw ? JSON.parse(raw) : [];
    return !shown.includes(id);
  } catch {
    return false;
  }
}

/** Marks prompt as shown permanently and blocks further prompts this session. */
export async function markPromptShown(id: string): Promise<void> {
  promptShownThisSession = true;
  try {
    const raw = await AsyncStorage.getItem(SK_SHOWN_PROMPTS);
    const shown: string[] = raw ? JSON.parse(raw) : [];
    if (!shown.includes(id)) {
      shown.push(id);
      await AsyncStorage.setItem(SK_SHOWN_PROMPTS, JSON.stringify(shown));
    }
  } catch {}
}
