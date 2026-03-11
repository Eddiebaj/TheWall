import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { SK_THEME, SK_LARGE_TEXT, SK_CONTRAST, SK_MOTION, SK_LANGUAGE } from '../lib/storageKeys';

type Theme = 'dark' | 'light' | 'system';
type Language = 'en' | 'fr';

type AppContextType = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: 'dark' | 'light';
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
  bg:       '#0d1117',
  surface:  '#131a24',
  card:     '#1a2230',
  border:   '#1e2d42',
  accent:   '#00A78D',  // Ottawa teal
  accentAlt:'#004890',  // Ottawa blue
  lrt:      '#004890',  // Ottawa blue for O-Train
  text:     '#eef2f7',
  muted:    '#6b7f99',
  green:    '#00A78D',  // teal doubles as green
  orange:   '#e8a020',  // amber for warnings/delays
  red:      '#cc3b2a',  // errors, closed, ghost bus
  purple:   '#7b5ea7',
};

const LIGHT_COLOURS = {
  bg:       '#f0f4f8',
  surface:  '#ffffff',
  card:     '#f7fafc',
  border:   '#dde4ef',
  accent:   '#00A78D',  // Ottawa teal
  accentAlt:'#004890',  // Ottawa blue
  lrt:      '#004890',  // Ottawa blue for O-Train
  text:     '#0d1117',
  muted:    '#7b8fa8',
  green:    '#00957d',  // slightly darker teal for light bg readability
  orange:   '#c47d0a',
  red:      '#b83224',
  purple:   '#6b4f9e',
};

const HIGH_CONTRAST_DARK = {
  ...DARK_COLOURS,
  border:  '#3a5275',
  text:    '#ffffff',
  muted:   '#a0b4cc',
  surface: '#0f1929',
};

const HIGH_CONTRAST_LIGHT = {
  ...LIGHT_COLOURS,
  border: '#2d4a6b',
  text:   '#000000',
  muted:  '#2d4a6b',
  surface: '#ffffff',
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

  useEffect(() => {
    AsyncStorage.multiGet([
      SK_THEME, SK_LARGE_TEXT, SK_CONTRAST,
      SK_MOTION, SK_LANGUAGE
    ]).then(vals => {
      try {
        const themeVal = vals[0][1];
        if (themeVal === 'dark' || themeVal === 'light' || themeVal === 'system') setThemeState(themeVal);
        if (vals[1][1]) setLargeTextState(vals[1][1] === 'true');
        if (vals[2][1]) setHighContrastState(vals[2][1] === 'true');
        if (vals[3][1]) setReducedMotionState(vals[3][1] === 'true');
        const langVal = vals[4][1];
        if (langVal === 'en' || langVal === 'fr') setLanguageState(langVal);
      } catch {
        // Corrupted storage — keep defaults
      }
    }).catch(() => {});
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    AsyncStorage.setItem(SK_THEME, t);
  };
  const setLargeText = (v: boolean) => {
    setLargeTextState(v);
    AsyncStorage.setItem(SK_LARGE_TEXT, String(v));
  };
  const setHighContrast = (v: boolean) => {
    setHighContrastState(v);
    AsyncStorage.setItem(SK_CONTRAST, String(v));
  };
  const setReducedMotion = (v: boolean) => {
    setReducedMotionState(v);
    AsyncStorage.setItem(SK_MOTION, String(v));
  };
  const setLanguage = (l: Language) => {
    setLanguageState(l);
    AsyncStorage.setItem(SK_LANGUAGE, l);
  };

  const resolvedTheme = theme === 'system'
    ? (systemScheme === 'light' ? 'light' : 'dark')
    : theme;

  const colours = useMemo(() => resolvedTheme === 'light'
    ? (highContrast ? HIGH_CONTRAST_LIGHT : LIGHT_COLOURS)
    : (highContrast ? HIGH_CONTRAST_DARK : DARK_COLOURS), [resolvedTheme, highContrast]);

  const fonts = useMemo(() => largeText ? LARGE_FONTS : BASE_FONTS, [largeText]);

  const t = useCallback((en: string, fr: string) => language === 'fr' ? fr : en, [language]);

  return (
    <AppContext.Provider value={{
      theme, setTheme, resolvedTheme,
      largeText, setLargeText,
      highContrast, setHighContrast,
      reducedMotion, setReducedMotion,
      language, setLanguage,
      t, fonts, colours,
    }}>
      {children}
    </AppContext.Provider>
  );
}