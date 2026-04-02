import AsyncStorage from '@react-native-async-storage/async-storage';
import { SK_SAVED_BOARD } from './storageKeys';

const SK_WIDGET_DATA = 'routeo_widget_data';

export interface WidgetArrival {
  routeId: string;
  headsign: string;
  minsAway: number;
  source: 'gtfs-rt' | 'sto-gtfs-rt' | 'gtfs-static';
}

export interface WidgetData {
  stopId: string;
  stopName: string;
  arrivals: WidgetArrival[];
  updatedAt: number;
}

// TODO: Requires App Groups bridge (e.g. expo-shared-preferences) for native widget access. Current AsyncStorage write is a data prep step only.
export async function writeWidgetData(data: WidgetData): Promise<void> {
  try {
    await AsyncStorage.setItem(SK_WIDGET_DATA, JSON.stringify(data));
    // If expo-shared-preferences or similar is available, also write there for native widget access
  } catch (e) {
    if (__DEV__) console.warn('writeWidgetData error:', e);
  }
}

export async function getTopSavedStopId(): Promise<{ id: string; name: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(SK_SAVED_BOARD);
    if (!raw) return null;
    const board = JSON.parse(raw);
    const stop = board.find((item: any) => item.type === 'bus_stop' || item.type === 'lrt_station');
    if (!stop) return null;
    return { id: stop.id, name: stop.name || `Stop ${stop.id}` };
  } catch {
    return null;
  }
}

export async function readWidgetData(): Promise<WidgetData | null> {
  try {
    const raw = await AsyncStorage.getItem(SK_WIDGET_DATA);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
