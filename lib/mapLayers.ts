import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tag, ForkKnife, Coffee, Wine, Ghost, Wrench } from 'phosphor-react-native';
import { SK_MAP_LAYERS } from './storageKeys';

export const LAYER_ICONS = {
  deals: Tag,
  restaurants: ForkKnife,
  coffee: Coffee,
  bars: Wine,
  ghost_buses: Ghost,
  construction: Wrench,
} as const;

export const LAYER_CONFIG = {
  deals: { color: '#FF9800', icon: 'pricetag', label: 'Deals', labelFr: 'Rabais' },
  restaurants: { color: '#E91E63', icon: 'restaurant', label: 'Eats', labelFr: 'Restos' },
  coffee: { color: '#795548', icon: 'cafe', label: 'Coffee', labelFr: 'Café' },
  bars: { color: '#FF6B35', icon: 'wine', label: 'Bars', labelFr: 'Bars' },
  ghost_buses: { color: '#9E9E9E', icon: 'alert-circle', label: 'Ghost Buses', labelFr: 'Bus fantômes' },
  construction: { color: '#E67E22', icon: 'construct', label: 'Construction', labelFr: 'Construction' },
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
  fsqId?: string;
  source: 'foursquare' | 'ticketmaster' | 'ottawa' | 'community' | 'supabase';
}

export const DEFAULT_LAYERS: Record<LayerKey, boolean> = (Object.keys(LAYER_CONFIG) as LayerKey[]).reduce(
  (acc, key) => ({ ...acc, [key]: false }),
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
