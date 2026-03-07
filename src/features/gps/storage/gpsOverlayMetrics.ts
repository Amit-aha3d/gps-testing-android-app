type GPSOverlayMetrics = {
  accuracy: number | null;
  maxSpeed: string;
  updatedAt: number;
};

const GPS_OVERLAY_METRICS_KEY = 'gps_overlay_metrics_v1';

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const DEFAULT_METRICS: GPSOverlayMetrics = {
  accuracy: null,
  maxSpeed: 'not fetched',
  updatedAt: 0,
};

function getAsyncStorage(): AsyncStorageLike | null {
  try {
    const moduleRef = require('@react-native-async-storage/async-storage');
    return (moduleRef.default ?? moduleRef) as AsyncStorageLike;
  } catch {
    return null;
  }
}

export async function getGPSOverlayMetrics(): Promise<GPSOverlayMetrics> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return DEFAULT_METRICS;
  }

  const raw = await asyncStorage.getItem(GPS_OVERLAY_METRICS_KEY);
  if (!raw) {
    return DEFAULT_METRICS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GPSOverlayMetrics>;
    return {
      accuracy:
        typeof parsed.accuracy === 'number' ? parsed.accuracy : DEFAULT_METRICS.accuracy,
      maxSpeed:
        typeof parsed.maxSpeed === 'string' && parsed.maxSpeed.length > 0
          ? parsed.maxSpeed
          : DEFAULT_METRICS.maxSpeed,
      updatedAt:
        typeof parsed.updatedAt === 'number' ? parsed.updatedAt : DEFAULT_METRICS.updatedAt,
    };
  } catch {
    return DEFAULT_METRICS;
  }
}

export async function saveGPSOverlayMetrics(input: {
  accuracy: number | null;
  maxSpeed: string;
}): Promise<void> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return;
  }

  const next: GPSOverlayMetrics = {
    accuracy: input.accuracy,
    maxSpeed: input.maxSpeed || 'not fetched',
    updatedAt: Date.now(),
  };
  await asyncStorage.setItem(GPS_OVERLAY_METRICS_KEY, JSON.stringify(next));
}

