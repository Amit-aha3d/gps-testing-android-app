import { appendGPSData } from '../storage/gpsCache';
import { saveGPSOverlayMetrics } from '../storage/gpsOverlayMetrics';
import { getGPSQuerySettings } from '../storage/gpsSettings';
import { fetchRoadInfoForLocation } from '../services/overpass';
import type { GPSDataPoint } from '../types/gps';

type GPSError = { message: string };

type GPSPosition = {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
  };
  timestamp: number;
};

type GeolocationLike = {
  watchPosition: (
    success: (position: GPSPosition) => void,
    failure?: (error: GPSError) => void,
    options?: {
      enableHighAccuracy?: boolean;
      timeout?: number;
      maximumAge?: number;
      distanceFilter?: number;
      interval?: number;
      fastestInterval?: number;
    },
  ) => number;
  clearWatch: (watchId: number) => void;
};

type BackgroundActionsLike = {
  start: (
    task: (taskDataArguments?: unknown) => Promise<void>,
    options: {
      taskName: string;
      taskTitle: string;
      taskDesc: string;
      taskIcon: { name: string; type: string };
      color?: string;
      parameters?: Record<string, unknown>;
    },
  ) => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
};

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(() => resolve(), ms));

function getGeolocation(): GeolocationLike | null {
  try {
    const moduleRef = require('@react-native-community/geolocation');
    return (moduleRef.default ?? moduleRef) as GeolocationLike;
  } catch {
    return null;
  }
}

function getBackgroundActions(): BackgroundActionsLike | null {
  try {
    const moduleRef = require('react-native-background-actions');
    return (moduleRef.default ?? moduleRef) as BackgroundActionsLike;
  } catch {
    return null;
  }
}

export function isBackgroundTrackingAvailable() {
  return getBackgroundActions() !== null && getGeolocation() !== null;
}

export function isBackgroundTrackingRunning() {
  const bg = getBackgroundActions();
  return bg?.isRunning() ?? false;
}

export async function stopBackgroundGPSTracking() {
  const bg = getBackgroundActions();
  if (!bg) {
    return;
  }

  if (bg.isRunning()) {
    await bg.stop();
  }
}

export async function startBackgroundGPSTracking() {
  const bg = getBackgroundActions();
  const geolocation = getGeolocation();
  const settings = await getGPSQuerySettings();

  if (!bg) {
    throw new Error(
      'Background module missing. Run: npm i react-native-background-actions',
    );
  }

  if (!geolocation) {
    throw new Error(
      'Geolocation module missing. Run: npm i @react-native-community/geolocation',
    );
  }

  if (bg.isRunning()) {
    return;
  }

  const task = async () => {
    let watchId: number | null = null;
    let lastCachedAt = 0;
    const cacheSample = async (sample: GPSDataPoint) => {
      const shouldCallOverpass =
        sample.accuracy !== null && sample.accuracy <= settings.minAccuracyMeters;

      let pointToCache = sample;
      if (shouldCallOverpass) {
        try {
          const roadInfo = await fetchRoadInfoForLocation(
            sample.latitude,
            sample.longitude,
            settings.overpassAroundMeters,
          );
          pointToCache = { ...sample, roadInfo };
        } catch {
          pointToCache = {
            ...sample,
            roadInfo: {
              maxSpeed: 'not fetched',
              tags: {},
              wayId: null,
            },
          };
        }
      }

      await saveGPSOverlayMetrics({
        accuracy: sample.accuracy,
        maxSpeed: pointToCache.roadInfo?.maxSpeed ?? 'not fetched',
      });
      await appendGPSData(pointToCache);
    };

    watchId = geolocation.watchPosition(
      position => {
        const sample: GPSDataPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          altitude: position.coords.altitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };

        const now = Date.now();
        if (now - lastCachedAt >= 5000) {
          lastCachedAt = now;
          cacheSample(sample).catch(() => {
            // Ignore cache failures in background worker loop.
          });
        }
      },
      () => {
        // Ignore temporary background GPS errors and continue.
      },
      {
        enableHighAccuracy: true,
        distanceFilter: settings.distanceFilterMeters,
        timeout: 15000,
        maximumAge: settings.maxAgeMs,
        interval: 5000,
        fastestInterval: 2000,
      },
    );

    while (bg.isRunning()) {
      await sleep(1000);
    }

    if (watchId !== null) {
      geolocation.clearWatch(watchId);
    }
  };

  await bg.start(task, {
    taskName: 'GPS Tracking',
    taskTitle: 'GPS tracking active',
    taskDesc: 'Collecting location in background',
    taskIcon: {
      name: 'ic_launcher',
      type: 'mipmap',
    },
    color: '#0f766e',
    parameters: {},
  });
}
