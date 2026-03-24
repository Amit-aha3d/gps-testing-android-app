import type { GPSQuerySettings } from '../types/gps';

const GPS_SETTINGS_KEY = 'gps_query_settings_v1';

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export const DEFAULT_GPS_QUERY_SETTINGS: GPSQuerySettings = {
  overpassAroundMeters: 50,
  minAccuracyMeters: 30,
  distanceFilterMeters: 1,
  maxAgeMs: 1000,
  fixedFallbackSpeedKmph: 30,
};

function getAsyncStorage(): AsyncStorageLike | null {
  try {
    const moduleRef = require('@react-native-async-storage/async-storage');
    return (moduleRef.default ?? moduleRef) as AsyncStorageLike;
  } catch {
    return null;
  }
}

function sanitizeSettings(input: Partial<GPSQuerySettings>): GPSQuerySettings {
  const around = Number(input.overpassAroundMeters);
  const minAccuracy = Number(input.minAccuracyMeters);
  const distance = Number(input.distanceFilterMeters);
  const maxAge = Number(input.maxAgeMs);
  const fixedFallbackSpeed = Number(input.fixedFallbackSpeedKmph);

  return {
    overpassAroundMeters:
      Number.isFinite(around) && around > 0
        ? Math.round(around)
        : DEFAULT_GPS_QUERY_SETTINGS.overpassAroundMeters,
    minAccuracyMeters:
      Number.isFinite(minAccuracy) && minAccuracy > 0
        ? Math.round(minAccuracy)
        : DEFAULT_GPS_QUERY_SETTINGS.minAccuracyMeters,
    distanceFilterMeters:
      Number.isFinite(distance) && distance >= 0
        ? Math.round(distance)
        : DEFAULT_GPS_QUERY_SETTINGS.distanceFilterMeters,
    maxAgeMs:
      Number.isFinite(maxAge) && maxAge >= 0
        ? Math.round(maxAge)
        : DEFAULT_GPS_QUERY_SETTINGS.maxAgeMs,
    fixedFallbackSpeedKmph:
      Number.isFinite(fixedFallbackSpeed) && fixedFallbackSpeed > 0
        ? Math.round(fixedFallbackSpeed)
        : DEFAULT_GPS_QUERY_SETTINGS.fixedFallbackSpeedKmph,
  };
}

export async function getGPSQuerySettings(): Promise<GPSQuerySettings> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return DEFAULT_GPS_QUERY_SETTINGS;
  }

  const raw = await asyncStorage.getItem(GPS_SETTINGS_KEY);
  if (!raw) {
    return DEFAULT_GPS_QUERY_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GPSQuerySettings>;
    return sanitizeSettings(parsed);
  } catch {
    return DEFAULT_GPS_QUERY_SETTINGS;
  }
}

export async function saveGPSQuerySettings(
  settings: Partial<GPSQuerySettings>,
): Promise<GPSQuerySettings> {
  const asyncStorage = getAsyncStorage();
  const sanitized = sanitizeSettings(settings);
  if (!asyncStorage) {
    return sanitized;
  }

  await asyncStorage.setItem(GPS_SETTINGS_KEY, JSON.stringify(sanitized));
  return sanitized;
}
