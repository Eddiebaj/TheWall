// Lazy-loaded haptic feedback utility — safe for Expo Go
let Haptics: typeof import('expo-haptics') | null = null;
try { Haptics = require('expo-haptics'); } catch {}

/** Light tap — toggles, chips, small buttons */
export function hapticLight() {
  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Medium tap — primary actions, navigation */
export function hapticMedium() {
  Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Success — save, confirm, send */
export function hapticSuccess() {
  Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Selection tick — scroll pickers, sliders */
export function hapticSelection() {
  Haptics?.selectionAsync().catch(() => {});
}
