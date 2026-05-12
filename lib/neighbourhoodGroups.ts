export type NeighbourhoodGroup = {
  id: string;
  name_en: string;
  name_fr: string;
  lat: number;
  lng: number;
  radiusKm: number;
  icon: string;
  color: string;
};

export const NEIGHBOURHOOD_GROUPS: NeighbourhoodGroup[] = [
  {
    id: 'glebe',
    name_en: 'The Glebe',
    name_fr: 'Le Glebe',
    lat: 45.4060,
    lng: -75.6870,
    radiusKm: 1.2,
    icon: 'leaf',
    color: '#22c55e',
  },
  {
    id: 'hintonburg',
    name_en: 'Hintonburg',
    name_fr: 'Hintonburg',
    lat: 45.4046,
    lng: -75.7315,
    radiusKm: 1.0,
    icon: 'home',
    color: '#8B5CF6',
  },
  {
    id: 'westboro',
    name_en: 'Westboro',
    name_fr: 'Westboro',
    lat: 45.4040,
    lng: -75.7600,
    radiusKm: 1.2,
    icon: 'cafe',
    color: '#F59E0B',
  },
  {
    id: 'byward',
    name_en: 'ByWard Market',
    name_fr: 'March\u00e9 By',
    lat: 45.4275,
    lng: -75.6944,
    radiusKm: 0.8,
    icon: 'storefront',
    color: '#EC4899',
  },
  {
    id: 'carleton',
    name_en: 'Carleton Campus',
    name_fr: 'Campus Carleton',
    lat: 45.3849,
    lng: -75.6960,
    radiusKm: 0.8,
    icon: 'school',
    color: '#3B82F6',
  },
  {
    id: 'uottawa',
    name_en: 'uOttawa',
    name_fr: 'uOttawa',
    lat: 45.4231,
    lng: -75.6831,
    radiusKm: 0.8,
    icon: 'school',
    color: '#EF4444',
  },
  {
    id: 'old_ottawa_south',
    name_en: 'Old Ottawa South',
    name_fr: 'Vieux Ottawa-Sud',
    lat: 45.3960,
    lng: -75.6870,
    radiusKm: 1.0,
    icon: 'heart',
    color: '#14B8A6',
  },
  {
    id: 'gatineau',
    name_en: 'Gatineau',
    name_fr: 'Gatineau',
    lat: 45.4765,
    lng: -75.7013,
    radiusKm: 2.0,
    icon: 'globe',
    color: '#6366F1',
  },
];
