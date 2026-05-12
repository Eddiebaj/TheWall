/**
 * Static OC Transpo platform-to-route mapping for major multi-platform stations.
 * Platform assignments are based on known route patterns and may change.
 * Always advise riders to check posted signs.
 */

export type PlatformEntry = { label: string; routes: string[] };
export type StationPlatforms = { platforms: PlatformEntry[] };

const STATION_DATA: Record<string, StationPlatforms> = {
  'HURDMAN': {
    platforms: [
      { label: 'A', routes: ['95', '96', '97'] },
      { label: 'B', routes: ['61', '62', '63', '64', '66', '67'] },
      { label: 'C', routes: ['85', '86', '87'] },
      { label: 'D', routes: ['10', '11', '12', '14', '17', '19', '90', '91'] },
    ],
  },
  'BLAIR': {
    platforms: [
      { label: 'A', routes: ['95', '97'] },
      { label: 'B', routes: ['31', '35', '38', '39', '40', '41', '47'] },
      { label: 'C', routes: ['110', '111'] },
    ],
  },
  "TUNNEY'S PASTURE": {
    platforms: [
      { label: 'A', routes: ['95', '96', '97'] },
      { label: 'B', routes: ['60', '62', '63', '64', '68'] },
      { label: 'C', routes: ['111', '118'] },
    ],
  },
  'BAYSHORE': {
    platforms: [
      { label: 'A', routes: ['60', '61', '63', '64', '68', '69'] },
      { label: 'B', routes: ['65', '67', '93', '94'] },
    ],
  },
  'BASELINE': {
    platforms: [
      { label: 'A', routes: ['85', '86', '87'] },
      { label: 'B', routes: ['60', '61', '80', '83', '94'] },
    ],
  },
  'LINCOLN FIELDS': {
    platforms: [
      { label: 'A', routes: ['60', '63', '64', '68', '94'] },
      { label: 'B', routes: ['65', '67', '69', '101'] },
    ],
  },
  'LEES': {
    platforms: [
      { label: 'A', routes: ['14', '16', '66'] },
      { label: 'B', routes: ['98', '111'] },
    ],
  },
  'GREENBORO': {
    platforms: [
      { label: 'A', routes: ['35', '39', '40', '65', '92', '93'] },
      { label: 'B', routes: ['77', '78', '111'] },
    ],
  },
};

/** Returns the platform label (e.g. "B") for a given route at a named station, or null if unknown. */
export function getPlatformForRoute(stopName: string, routeId: string): string | null {
  const nameUpper = stopName.toUpperCase();
  const key = Object.keys(STATION_DATA).find(k => nameUpper.includes(k));
  if (!key) return null;
  const base = routeId.split('-')[0].toUpperCase();
  for (const p of STATION_DATA[key].platforms) {
    if (p.routes.includes(base)) return p.label;
  }
  return null;
}

/** Returns true if the stop name matches a major station with known platform data. */
export function hasPlatformData(stopName: string): boolean {
  const nameUpper = stopName.toUpperCase();
  return Object.keys(STATION_DATA).some(k => nameUpper.includes(k));
}
