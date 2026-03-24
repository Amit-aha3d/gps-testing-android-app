type GPSOverlayMetrics = {
  accuracy: number | null;
  directSpeedKmph: number | null;
  resolvedSpeedKmph: number | null;
  approach: string;
  edgeCase: string;
  updatedAt: number;
};

const GPS_OVERLAY_METRICS_KEY = 'gps_overlay_metrics_v1';

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const DEFAULT_METRICS: GPSOverlayMetrics = {
  accuracy: null,
  directSpeedKmph: null,
  resolvedSpeedKmph: null,
  approach: 'not_started',
  edgeCase: 'not_started',
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
      directSpeedKmph:
        typeof parsed.directSpeedKmph === 'number'
          ? parsed.directSpeedKmph
          : DEFAULT_METRICS.directSpeedKmph,
      resolvedSpeedKmph:
        typeof parsed.resolvedSpeedKmph === 'number'
          ? parsed.resolvedSpeedKmph
          : DEFAULT_METRICS.resolvedSpeedKmph,
      approach:
        typeof parsed.approach === 'string' && parsed.approach.length > 0
          ? parsed.approach
          : DEFAULT_METRICS.approach,
      edgeCase:
        typeof parsed.edgeCase === 'string' && parsed.edgeCase.length > 0
          ? parsed.edgeCase
          : DEFAULT_METRICS.edgeCase,
      updatedAt:
        typeof parsed.updatedAt === 'number' ? parsed.updatedAt : DEFAULT_METRICS.updatedAt,
    };
  } catch {
    return DEFAULT_METRICS;
  }
}

export async function saveGPSOverlayMetrics(input: {
  accuracy: number | null;
  directSpeedKmph: number | null;
  resolvedSpeedKmph: number | null;
  approach: string;
  edgeCase: string;
}): Promise<void> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return;
  }

  const next: GPSOverlayMetrics = {
    accuracy: input.accuracy,
    directSpeedKmph: input.directSpeedKmph,
    resolvedSpeedKmph: input.resolvedSpeedKmph,
    approach: input.approach,
    edgeCase: input.edgeCase,
    updatedAt: Date.now(),
  };
  await asyncStorage.setItem(GPS_OVERLAY_METRICS_KEY, JSON.stringify(next));
}
