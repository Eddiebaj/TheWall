/**
 * Shared route badge color utility.
 * Used by NearbyTransitSheet and map.tsx so both surfaces stay in sync.
 */

const BADGE_PALETTE = [
  '#0EA5E9', '#8B5CF6', '#EC4899', '#22C55E',
  '#F59E0B', '#EF4444', '#14B8A6', '#6366F1',
  '#F97316', '#06B6D4',
];

/** Returns a background + foreground color pair for a route badge. */
export function routeBadgeStyle(routeId: string): { bg: string; fg: string } {
  const id = routeId.split('-')[0].toUpperCase().trim();
  const num = parseInt(id, 10);

  // O-Train lines
  if (['1', 'R1', 'LINE1', 'O1'].includes(id)) return { bg: '#004890', fg: '#fff' };
  if (['2', 'R2', 'LINE2', 'O2'].includes(id)) return { bg: '#7b5ea7', fg: '#fff' };

  // Rapid routes
  if (['95', '96', '97', '98', '99'].includes(id)) return { bg: '#CE1126', fg: '#fff' };

  // Express 300-series
  if (!isNaN(num) && num >= 300 && num < 400) return { bg: '#F97316', fg: '#fff' };

  // Night routes
  if (id.startsWith('N')) return { bg: '#6D28D9', fg: '#fff' };

  // Deterministic hash fallback  -  same route always gets same color
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = (((h << 5) + h) ^ id.charCodeAt(i)) | 0;
  return { bg: BADGE_PALETTE[Math.abs(h) % BADGE_PALETTE.length], fg: '#fff' };
}

/** Convenience  -  returns just the background hex for map marker use. */
export const getRouteColour = (routeId: string): string => routeBadgeStyle(routeId).bg;
