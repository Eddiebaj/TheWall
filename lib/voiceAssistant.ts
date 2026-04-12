/**
 * Voice-to-trip assistant.
 *
 * Two responsibilities:
 *  1. Wrap expo-speech-recognition (lazy-loaded for Expo Go compat) so callers
 *     get a simple start/stop API without worrying about the native module.
 *  2. Call the Claude API to parse a natural-language transit query into
 *     structured { from, to } strings that the planner can geocode.
 *
 * NOTE: The Anthropic API key is read from EXPO_PUBLIC_ANTHROPIC_API_KEY.
 * For production, proxy this through the backend to avoid key exposure.
 */

const CLAUDE_URL   = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const CLAUDE_KEY   = (process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '').trim();

const SYSTEM_PROMPT_EN = `You are a transit planning assistant for Ottawa, Canada.
The user will give you a natural-language trip request (e.g. "get me from Carleton to ByWard Market").
Extract the origin and destination. Well-known Ottawa landmarks include:
  Parliament Hill, ByWard Market, Rideau Centre, Rideau Canal, Ottawa Airport,
  Carleton University, University of Ottawa (uOttawa), Algonquin College, Saint Paul University,
  Kanata, Barrhaven, Orleans, Nepean, Westboro, Hintonburg, Little Italy, Sandy Hill,
  Glebe, Old Ottawa South, Centretown, Vanier.
Respond ONLY with valid JSON in the form: {"from":"<origin or null>","to":"<destination or null>"}
If a field cannot be determined, use null.`;

const SYSTEM_PROMPT_FR = `Tu es un assistant de planification de trajet pour Ottawa, Canada.
L'utilisateur te donnera une demande de trajet en langage naturel.
Extrais l'origine et la destination.
Reponds UNIQUEMENT avec du JSON valide : {"from":"<origine ou null>","to":"<destination ou null>"}
Si un champ ne peut pas etre determine, utilise null.`;

/**
 * Call Claude to extract origin/destination from a raw speech transcript.
 * Returns { from: string|null, to: string|null } on success, null on failure.
 */
export async function parseTransitQuery(
  transcript: string,
  language: string,
): Promise<{ from: string | null; to: string | null } | null> {
  if (!CLAUDE_KEY) {
    if (__DEV__) console.warn('[voiceAssistant] EXPO_PUBLIC_ANTHROPIC_API_KEY not set');
    return null;
  }
  try {
    const resp = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 128,
        system: language === 'fr' ? SYSTEM_PROMPT_FR : SYSTEM_PROMPT_EN,
        messages: [{ role: 'user', content: transcript }],
      }),
    });
    if (!resp.ok) {
      if (__DEV__) console.warn('[voiceAssistant] Claude HTTP', resp.status);
      return null;
    }
    const data = await resp.json();
    const text: string = data.content?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      from: typeof parsed.from === 'string' ? parsed.from : null,
      to:   typeof parsed.to   === 'string' ? parsed.to   : null,
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
