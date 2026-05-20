import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { SK_THEME, SK_LARGE_TEXT, SK_CONTRAST, SK_MOTION, SK_LANGUAGE, SK_PALETTE } from '../lib/storageKeys';

type Theme = 'dark' | 'light' | 'system';
type Language = 'en' | 'fr';
export type PaletteId = 'default' | 'senators' | 'midnight' | 'forest' | 'sand';

type AppContextType = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: 'dark' | 'light';
  palette: PaletteId;
  setPalette: (p: PaletteId) => void;
  largeText: boolean;
  setLargeText: (v: boolean) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
  language: Language;
  setLanguage: (l: Language) => void;
  t: (en: string, fr: string) => string;
  fonts: { sm: number; md: number; lg: number; xl: number; xxl: number };
  colours: typeof DARK_COLOURS;
};

const DARK_COLOURS = {
  bg:       '#0C0E12',
  surface:  '#181B22',
  card:     '#1E2230',
  border:   '#252933',
  accent:   '#00C07A',
  accentAlt:'#004890',
  lrt:      '#004890',
  text:     '#eef2f7',
  muted:    '#6b7f99',
  green:    '#00C07A',
  orange:   '#e8a020',
  red:      '#cc3b2a',
  purple:   '#7b5ea7',
  tintBg:   '#00C07A0F',
  warnBg:   '#1f1a0d',
  errorBg:  '#1f100e',
  live:     '#22c55e',
  warn:     '#F59E0B',
  warnText: '#FBBF24',
};

const LIGHT_COLOURS = {
  bg:       '#f0f4f8',
  surface:  '#ffffff',
  card:     '#f7fafc',
  border:   '#dde4ef',
  accent:   '#00A78D',
  accentAlt:'#004890',
  lrt:      '#004890',
  text:     '#0d1117',
  muted:    '#7b8fa8',
  green:    '#00957d',
  orange:   '#c47d0a',
  red:      '#b83224',
  purple:   '#6b4f9e',
  tintBg:   '#e8f5f2',
  warnBg:   '#fdf6e8',
  errorBg:  '#fceeed',
  live:     '#22c55e',
  warn:     '#F59E0B',
  warnText: '#92400E',
};

const HIGH_CONTRAST_DARK = {
  ...DARK_COLOURS,
  border:  '#3a5275',
  text:    '#ffffff',
  muted:   '#a0b4cc',
  surface: '#0f1929',
  tintBg:  '#0a2e24',
  warnBg:  '#2a2010',
  errorBg: '#2a1210',
  live:    '#22c55e',
  warn:    '#F59E0B',
  warnText:'#FBBF24',
};

const HIGH_CONTRAST_LIGHT = {
  ...LIGHT_COLOURS,
  border: '#2d4a6b',
  text:   '#000000',
  muted:  '#2d4a6b',
  surface: '#ffffff',
  tintBg:  '#d9f0ec',
  warnBg:  '#f5edd4',
  errorBg: '#f5dbd9',
  live:    '#22c55e',
  warn:    '#F59E0B',
  warnText:'#92400E',
};

// Palette accent overrides (applied on top of dark/light base)
const PALETTE_OVERRIDES: Record<PaletteId, { accent: string; accentAlt: string; green: string }> = {
  default:   { accent: '#00C07A', accentAlt: '#004890', green: '#00C07A' },
  senators:  { accent: '#C8102E', accentAlt: '#C69214', green: '#C8102E' },
  midnight:  { accent: '#3B82F6', accentAlt: '#1E3A5F', green: '#3B82F6' },
  forest:    { accent: '#2D8659', accentAlt: '#6B8F71', green: '#2D8659' },
  sand:      { accent: '#B8860B', accentAlt: '#8B6914', green: '#B8860B' },
};

export const PALETTE_LABELS: Record<PaletteId, { en: string; fr: string; swatch: string }> = {
  default:  { en: 'Default', fr: 'Defaut', swatch: '#00C07A' },
  senators: { en: 'Senators', fr: 'Senateurs', swatch: '#C8102E' },
  midnight: { en: 'Midnight', fr: 'Minuit', swatch: '#3B82F6' },
  forest:   { en: 'Forest', fr: 'Foret', swatch: '#2D8659' },
  sand:     { en: 'Sand', fr: 'Sable', swatch: '#B8860B' },
};

const BASE_FONTS = { sm: 11, md: 13, lg: 15, xl: 18, xxl: 28 };
const LARGE_FONTS = { sm: 13, md: 15, lg: 17, xl: 21, xxl: 32 };

export const AppContext = createContext<AppContextType>({} as AppContextType);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<Theme>('dark');
  const [largeText, setLargeTextState] = useState(false);
  const [highContrast, setHighContrastState] = useState(false);
  const [reducedMotion, setReducedMotionState] = useState(false);
  const [language, setLanguageState] = useState<Language>('en');
  const [palette, setPaletteState] = useState<PaletteId>('default');

  useEffect(() => {
    if (__DEV__) console.log('[AppProvider] useEffect start  -  reading preferences from AsyncStorage');
    const timer = setTimeout(() => {
      if (__DEV__) console.warn('[AppProvider] AsyncStorage load timed out  -  keeping defaults');
    }, 3000);
    AsyncStorage.multiGet([
      SK_THEME, SK_LARGE_TEXT, SK_CONTRAST,
      SK_MOTION, SK_LANGUAGE, SK_PALETTE
    ]).then(vals => {
      clearTimeout(timer);
      if (__DEV__) console.log('[AppProvider] AsyncStorage.multiGet resolved');
      try {
        const themeVal = vals[0][1];
        if (themeVal === 'dark' || themeVal === 'light' || themeVal === 'system') setThemeState(themeVal);
        if (vals[1][1]) setLargeTextState(vals[1][1] === 'true');
        if (vals[2][1]) setHighContrastState(vals[2][1] === 'true');
        if (vals[3][1]) setReducedMotionState(vals[3][1] === 'true');
        const langVal = vals[4][1];
        if (langVal === 'en' || langVal === 'fr') setLanguageState(langVal);
        const palVal = vals[5]?.[1];
        if (palVal && palVal in PALETTE_OVERRIDES) setPaletteState(palVal as PaletteId);
        if (__DEV__) console.log('[AppProvider] Preferences applied successfully');
      } catch (e) {
        clearTimeout(timer);
        if (__DEV__) console.warn('[AppProvider] Corrupted storage  -  keeping defaults:', e);
      }
    }).catch(e => {
      clearTimeout(timer);
      if (__DEV__) console.warn('[AppProvider] AsyncStorage.multiGet failed:', e);
    });
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    AsyncStorage.setItem(SK_THEME, t);
  }, []);
  const setLargeText = useCallback((v: boolean) => {
    setLargeTextState(v);
    AsyncStorage.setItem(SK_LARGE_TEXT, String(v));
  }, []);
  const setHighContrast = useCallback((v: boolean) => {
    setHighContrastState(v);
    AsyncStorage.setItem(SK_CONTRAST, String(v));
  }, []);
  const setReducedMotion = useCallback((v: boolean) => {
    setReducedMotionState(v);
    AsyncStorage.setItem(SK_MOTION, String(v));
  }, []);
  const setLanguage = useCallback((l: Language) => {
    setLanguageState(l);
    AsyncStorage.setItem(SK_LANGUAGE, l);
  }, []);
  const setPalette = useCallback((p: PaletteId) => {
    setPaletteState(p);
    AsyncStorage.setItem(SK_PALETTE, p);
  }, []);

  // Guard against iOS 26 CoreUI / UITraitCollection issues where useColorScheme()
  // may throw or return an unexpected value during early app launch.
  const safeSystemScheme = (systemScheme === 'light' || systemScheme === 'dark') ? systemScheme : 'dark';
  const resolvedTheme = theme === 'system' ? safeSystemScheme : theme;

  const colours = useMemo(() => {
    try {
      const base = resolvedTheme === 'light'
        ? (highContrast ? HIGH_CONTRAST_LIGHT : LIGHT_COLOURS)
        : (highContrast ? HIGH_CONTRAST_DARK : DARK_COLOURS);
      if (palette === 'default') return base;
      const ov = PALETTE_OVERRIDES[palette] ?? PALETTE_OVERRIDES['default'];
      return { ...base, accent: ov.accent, accentAlt: ov.accentAlt, green: ov.green };
    } catch (e) {
      if (__DEV__) console.warn('[AppProvider] colours computation failed, using defaults:', e);
      return DARK_COLOURS;
    }
  }, [resolvedTheme, highContrast, palette]);

  const fonts = useMemo(() => largeText ? LARGE_FONTS : BASE_FONTS, [largeText]);

  const t = useCallback((en: string, fr: string) => language === 'fr' ? fr : en, [language]);

  const value = useMemo(() => ({
    theme, setTheme, resolvedTheme,
    palette, setPalette,
    largeText, setLargeText,
    highContrast, setHighContrast,
    reducedMotion, setReducedMotion,
    language, setLanguage,
    t, fonts, colours,
  }), [theme, resolvedTheme, palette, largeText, highContrast, reducedMotion, language, t, fonts, colours,
       setTheme, setPalette, setLargeText, setHighContrast, setReducedMotion, setLanguage]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}