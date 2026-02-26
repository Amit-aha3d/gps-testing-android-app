import type { GPSDataPoint } from '../types/gps';

const GPS_CACHE_KEY = 'gps_cache_v1';
const MAX_CACHE_ITEMS = 120;

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

function getAsyncStorage(): AsyncStorageLike | null {
  try {
    const moduleRef = require('@react-native-async-storage/async-storage');
    return (moduleRef.default ?? moduleRef) as AsyncStorageLike;
  } catch (_error) {
    return null;
  }
}

export function isStorageReady() {
  return getAsyncStorage() !== null;
}

export async function getCachedGPSData(): Promise<GPSDataPoint[]> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return [];
  }

  const raw = await asyncStorage.getItem(GPS_CACHE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as GPSDataPoint[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (_error) {
    return [];
  }
}

export async function appendGPSData(point: GPSDataPoint): Promise<GPSDataPoint[]> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return [];
  }

  const existing = await getCachedGPSData();
  const next = [point, ...existing].slice(0, MAX_CACHE_ITEMS);
  await asyncStorage.setItem(GPS_CACHE_KEY, JSON.stringify(next));
  return next;
}
