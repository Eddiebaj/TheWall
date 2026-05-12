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
  deals:        { color: '#F59E0B', icon: 'pricetag',    label: 'Deals',        labelFr: 'Rabais'        },
  restaurants:  { color: '#EC4899', icon: 'restaurant',  label: 'Eats',         labelFr: 'Restos'        },
  coffee:       { color: '#A16207', icon: 'cafe',        label: 'Coffee',       labelFr: 'Caf\u00e9'     },
  bars:         { color: '#3B82F6', icon: 'wine',        label: 'Bars',         labelFr: 'Bars'          },
  ghost_buses:  { color: '#00C07A', icon: 'alert-circle',label: 'Ghost Buses',  labelFr: 'Bus fant\u00f4mes' },
  construction: { color: '#F97316', icon: 'construct',   label: 'Construction', labelFr: 'Construction'  },
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
