import { haversineKm } from './geo';

export type VenueTransitInfo = {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
  affectedRoutes: string[];
};

export const MAJOR_VENUES: VenueTransitInfo[] = [
  {
    name: 'Canadian Tire Centre',
    lat: 45.2968,
    lng: -75.9279,
    radiusKm: 0.6,
    affectedRoutes: ['85', '86', '87', '96'],
  },
  {
    name: 'TD Place / Lansdowne',
    lat: 45.3967,
    lng: -75.6893,
    radiusKm: 0.5,
    affectedRoutes: ['1', '6', '7', '10'],
  },
  {
    name: 'NAC / Convention Centre',
    lat: 45.4249,
    lng: -75.6942,
    radiusKm: 0.4,
    affectedRoutes: ['1', '14', '16'],
  },
];

/**
 * Returns the first major venue within range of the given coordinates, or null.
 * Used to detect if a trip destination is near a major event venue.
 */
export function nearbyVenueAlert(lat: number, lng: number): VenueTransitInfo | null {
  for (const v of MAJOR_VENUES) {
    if (haversineKm(lat, lng, v.lat, v.lng) <= v.radiusKm) return v;
  }
  return null;
}

/**
 * Matches a Ticketmaster venue name string against the major venues list.
 * Returns the matched venue or null.
 */
export function matchVenueByName(venueName: string): VenueTransitInfo | null {
  const lower = venueName.toLowerCase();
  for (const v of MAJOR_VENUES) {
    const keywords = v.name.toLowerCase().split(/[\s/]+/);
    if (keywords.some(kw => kw.length > 3 && lower.includes(kw))) return v;
  }
  return null;
}
