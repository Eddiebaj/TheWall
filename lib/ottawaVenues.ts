export type VenueCoords = { lat: number; lng: number; name: string };

export const OTTAWA_VENUE_COORDS: Record<string, VenueCoords> = {
  national_arts_centre: {
    name: 'National Arts Centre',
    lat: 45.4237,
    lng: -75.6934,
  },
  canadian_tire_centre: {
    name: 'Canadian Tire Centre',
    lat: 45.2969,
    lng: -75.9275,
  },
  td_place_stadium: {
    name: 'TD Place Stadium',
    lat: 45.3984,
    lng: -75.6856,
  },
  td_place_arena: {
    name: 'TD Place Arena',
    lat: 45.3981,
    lng: -75.6858,
  },
  bronson_centre: {
    name: 'Bronson Centre',
    lat: 45.4133,
    lng: -75.7012,
  },
  bluesfest_lebreton: {
    name: 'Bluesfest / LeBreton Flats',
    lat: 45.4174,
    lng: -75.7161,
  },
  algonquin_commons_theatre: {
    name: 'Algonquin Commons Theatre',
    lat: 45.3480,
    lng: -75.7588,
  },
  carleton_alumni_theatre: {
    name: 'Carleton University Alumni Theatre',
    lat: 45.3832,
    lng: -75.6980,
  },
  lansdowne_park: {
    name: 'Lansdowne Park',
    lat: 45.3993,
    lng: -75.6853,
  },
  byward_market: {
    name: 'ByWard Market',
    lat: 45.4287,
    lng: -75.6908,
  },
  rideau_hall: {
    name: 'Rideau Hall',
    lat: 45.4441,
    lng: -75.6857,
  },
  aberdeen_pavilion: {
    name: 'Aberdeen Pavilion',
    lat: 45.3992,
    lng: -75.6864,
  },
  shenkman_arts_centre: {
    name: 'Shenkman Arts Centre',
    lat: 45.4780,
    lng: -75.5189,
  },
  gladstone_theatre: {
    name: 'Gladstone Theatre',
    lat: 45.4121,
    lng: -75.6999,
  },
  la_nouvelle_scene: {
    name: 'La Nouvelle Scène',
    lat: 45.4243,
    lng: -75.6882,
  },
};

const VENUE_LIST = Object.values(OTTAWA_VENUE_COORDS);

/**
 * Case-insensitive substring match against known Ottawa venues.
 * e.g. resolveVenueCoords("National Arts Centre, Ottawa") → {lat, lng}
 */
export function resolveVenueCoords(venueName: string): { lat: number; lng: number } | null {
  if (!venueName) return null;
  const needle = venueName.toLowerCase();

  // First pass: check if the input contains a known venue name
  for (const v of VENUE_LIST) {
    if (needle.includes(v.name.toLowerCase())) {
      return { lat: v.lat, lng: v.lng };
    }
  }

  // Second pass: check if a known venue name contains the input (handles short queries)
  for (const v of VENUE_LIST) {
    if (v.name.toLowerCase().includes(needle)) {
      return { lat: v.lat, lng: v.lng };
    }
  }

  return null;
}
