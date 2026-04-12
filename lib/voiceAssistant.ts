/**
 * Voice-to-trip assistant.
 *
 * Two responsibilities:
 *  1. Wrap expo-speech-recognition (lazy-loaded for Expo Go compat) so callers
 *     get a simple start/stop API without worrying about the native module.
 *  2. Call the RouteO backend /api/places?action=parse-transit to parse a
 *     natural-language transit query into structured { from, to } strings.
 *     The backend holds the Anthropic key — nothing is exposed in the bundle.
 */

const PARSE_TRANSIT_URL = 'https://routeo-backend.vercel.app/api/places?action=parse-transit';

/**
 * Call the backend to extract origin/destination from a raw speech transcript.
 * Returns { from: string|null, to: string|null } on success, null on failure.
 */
export async function parseTransitQuery(
  transcript: string,
  language: string,
): Promise<{ from: string | null; to: string | null } | null> {
  try {
    const resp = await fetch(PARSE_TRANSIT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transcript, language }),
    });
    if (!resp.ok) {
      if (__DEV__) console.warn('[voiceAssistant] parse-transit HTTP', resp.status);
      return null;
    }
    const data = await resp.json();
    return {
      from: typeof data.from === 'string' ? data.from : null,
      to:   typeof data.to   === 'string' ? data.to   : null,
    };
  } catch (e) {
    if (__DEV__) console.warn('[voiceAssistant] parseTransitQuery error:', e);
    return null;
  }
}

// ── Native speech recognition (lazy-loaded) ──────────────────────────────────

let _SpeechMod: any = null;
try { _SpeechMod = require('expo-speech-recognition'); } catch {}

export type VoiceState = 'idle' | 'listening' | 'parsing';

export type VoiceHandlers = {
  onResult: (transcript: string) => void;
  onEnd:    () => void;
  onError:  (err: string) => void;
};

/** Returns true if native speech recognition is available in this environment. */
export function isSpeechAvailable(): boolean {
  return !!_SpeechMod?.ExpoSpeechRecognitionModule;
}

/** Start listening. Attach handlers before calling. */
export function startListening(lang: string, handlers: VoiceHandlers): void {
  const mod = _SpeechMod?.ExpoSpeechRecognitionModule;
  if (!mod) {
    handlers.onError('Speech recognition not available in this environment');
    return;
  }

  // Remove any stale listeners first
  stopListening();

  mod.addListener('result', (e: any) => {
    const transcript: string = e.results?.[0]?.transcript ?? '';
    handlers.onResult(transcript);
  });
  mod.addListener('end',   () => handlers.onEnd());
  mod.addListener('error', (e: any) => handlers.onError(e.message ?? 'Speech error'));

  mod.start({
    lang: lang === 'fr' ? 'fr-CA' : 'en-CA',
    interimResults: true,
    continuous: false,
  });
}

/** Stop listening and clean up event listeners. */
export function stopListening(): void {
  const mod = _SpeechMod?.ExpoSpeechRecognitionModule;
  if (!mod) return;
  try {
    mod.stop();
    mod.removeAllListeners?.('result');
    mod.removeAllListeners?.('end');
    mod.removeAllListeners?.('error');
  } catch {}
}
