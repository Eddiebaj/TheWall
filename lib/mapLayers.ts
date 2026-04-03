import AsyncStorage from '@react-native-async-storage/async-storage';
import { SK_MAP_LAYERS } from './storageKeys';

export const LAYER_CONFIG = {
  ghost_buses: { color: '#F1C40F', icon: 'alert-circle', label: 'Ghost Buses', labelFr: 'Bus fantômes' },
  events: { color: '#9B59B6', icon: 'musical-notes', label: 'Events', labelFr: 'Événements' },
  deals: { color: '#27AE60', icon: 'pricetag', label: 'Deals', labelFr: 'Rabais' },
  sports: { color: '#E74C3C', icon: 'trophy', label: 'Sports', labelFr: 'Sports' },
  restaurants: { color: '#E91E63', icon: 'restaurant', label: 'Eats', labelFr: 'Restos' },
  bars: { color: '#FF9800', icon: 'wine', label: 'Bars', labelFr: 'Bars' },
  food_trucks: { color: '#FF6B35', icon: 'fast-food', label: 'Food Trucks', labelFr: 'Camions-repas' },
  breweries: { color: '#8B4513', icon: 'beer', label: 'Breweries', labelFr: 'Brasseries' },
  markets: { color: '#FF9800', icon: 'basket', label: 'Markets', labelFr: 'Marchés' },
  construction: { color: '#E67E22', icon: 'construct', label: 'Construction', labelFr: 'Construction' },
  parking: { color: '#3498DB', icon: 'car', label: 'Parking', labelFr: 'Stationnement' },
  bike_share: { color: '#1ABC9C', icon: 'bicycle', label: 'Bike Share', labelFr: 'Vélos' },
  bike_repair: { color: '#4CAF50', icon: 'build', label: 'Bike Repair', labelFr: 'Réparation vélo' },
  ev_chargers: { color: '#00BCD4', icon: 'flash', label: 'EV Charging', labelFr: 'Recharge VE' },
  public_art: { color: '#E91E63', icon: 'color-palette', label: 'Public Art', labelFr: 'Art public' },
  cultural: { color: '#9C27B0', icon: 'business', label: 'Culture', labelFr: 'Culture' },
  wifi: { color: '#2196F3', icon: 'wifi', label: 'Free Wi-Fi', labelFr: 'Wi-Fi gratuit' },
} as const;

export type LayerKey = keyof typeof LAYER_CONFIG;

export interface MapPin {
  id: string;
  category: LayerKey;
  name: string;
  subtitle: string;
  description?: string;
  lat: number;
  lng: number;
  rating?: number;
  price?: string;
  time?: string;
  url?: string;
  isOpenNow?: boolean;
  photoUrl?: string;
  source: 'foursquare' | 'ticketmaster' | 'ottawa' | 'community' | 'supabase';
}

export const DEFAULT_LAYERS: Record<LayerKey, boolean> = (Object.keys(LAYER_CONFIG) as LayerKey[]).reduce(
  (acc, key) => ({ ...acc, [key]: key === 'ghost_buses' }),
  {} as Record<LayerKey, boolean>,
);

export async function saveLayerPrefs(layers: Record<LayerKey, boolean>): Promise<void> {
  await AsyncStorage.setItem(SK_MAP_LAYERS, JSON.stringify(layers));
}

export async function loadLayerPrefs(): Promise<Record<LayerKey, boolean>> {
  try {
    const saved = await AsyncStorage.getItem(SK_MAP_LAYERS);
    return saved ? { ...DEFAULT_LAYERS, ...JSON.parse(saved) } : DEFAULT_LAYERS;
  } catch {
    return DEFAULT_LAYERS;
  }
}
