export type GPSAPITimelineEntry = {
  id: string;
  gpsData: string;
  gpsDataTime: number;
  querySettings: string;
  apiCalledTime: number | null;
  apiResponseTime: number | null;
  apiResponse: string;
};

const GPS_API_TIMELINE_KEY = 'gps_api_timeline_v1';
const MAX_TIMELINE_ITEMS = 500;
export const AUTO_TIMELINE_ARCHIVE_ITEMS = 50;

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

function getAsyncStorage(): AsyncStorageLike | null {
  try {
    const moduleRef = require('@react-native-async-storage/async-storage');
    return (moduleRef.default ?? moduleRef) as AsyncStorageLike;
  } catch {
    return null;
  }
}

export async function getGPSAPITimeline(): Promise<GPSAPITimelineEntry[]> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return [];
  }

  const raw = await asyncStorage.getItem(GPS_API_TIMELINE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as GPSAPITimelineEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendGPSAPITimelineEntry(
  entry: Omit<GPSAPITimelineEntry, 'id'>,
): Promise<number> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return 0;
  }

  const existing = await getGPSAPITimeline();
  const next: GPSAPITimelineEntry[] = [
    {
      ...entry,
      id: `${entry.gpsDataTime}-${Math.random().toString(36).slice(2, 8)}`,
    },
    ...existing,
  ].slice(0, MAX_TIMELINE_ITEMS);

  await asyncStorage.setItem(GPS_API_TIMELINE_KEY, JSON.stringify(next));
  return next.length;
}

export async function clearGPSAPITimeline(): Promise<void> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return;
  }
  await asyncStorage.setItem(GPS_API_TIMELINE_KEY, JSON.stringify([]));
}
