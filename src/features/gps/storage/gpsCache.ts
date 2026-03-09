import type { GPSDataPoint } from '../types/gps';

const GPS_CACHE_KEY = 'gps_cache_v1';
export const MAX_CACHE_ITEMS = 120;

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let writeQueue: Promise<GPSDataPoint[]> = Promise.resolve([]);

function getAsyncStorage(): AsyncStorageLike | null {
  try {
    const moduleRef = require('@react-native-async-storage/async-storage');
    return (moduleRef.default ?? moduleRef) as AsyncStorageLike;
  } catch {
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
    return normalizeCache(parsed);
  } catch {
    return [];
  }
}

export async function appendGPSData(point: GPSDataPoint): Promise<GPSDataPoint[]> {
  const run = async () => {
    const asyncStorage = getAsyncStorage();
    if (!asyncStorage) {
      return [];
    }

    const existing = await getCachedGPSData();
    const next = normalizeCache([point, ...existing]);
    await asyncStorage.setItem(GPS_CACHE_KEY, JSON.stringify(next));
    return next;
  };

  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

export async function clearCachedGPSData(): Promise<void> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return;
  }

  await asyncStorage.setItem(GPS_CACHE_KEY, JSON.stringify([]));
}

function normalizeCache(points: GPSDataPoint[]): GPSDataPoint[] {
  const dedupMap = new Map<string, GPSDataPoint>();
  points.forEach(point => {
    const key = `${point.timestamp}_${point.latitude}_${point.longitude}`;
    if (!dedupMap.has(key)) {
      dedupMap.set(key, point);
    }
  });

  return [...dedupMap.values()]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_CACHE_ITEMS);
}
