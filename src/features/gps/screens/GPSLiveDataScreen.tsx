import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { appendGPSData, isStorageReady } from '../storage/gpsCache';
import {
  DEFAULT_GPS_QUERY_SETTINGS,
  getGPSQuerySettings,
} from '../storage/gpsSettings';
import { appendGPSAPITimelineEntry } from '../storage/gpsApiTimeline';
import { saveGPSOverlayMetrics } from '../storage/gpsOverlayMetrics';
import {
  isBackgroundTrackingAvailable,
  isBackgroundTrackingRunning,
  startBackgroundGPSTracking,
  stopBackgroundGPSTracking,
} from '../background/backgroundTracking';
import { fetchRoadInfoForLocation } from '../services/overpass';
import { maybeAutoArchiveGPSCache } from '../reports/gpsAutoArchive';
import { maybeAutoArchiveTimeline } from '../reports/gpsTimelineAutoArchive';
import type { GPSDataPoint, GPSQuerySettings } from '../types/gps';

type GPSPosition = {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
  };
  timestamp: number;
};

type GPSError = {
  message: string;
};

type GeolocationLike = {
  getCurrentPosition: (
    success: (position: GPSPosition) => void,
    failure?: (error: GPSError) => void,
    options?: {
      enableHighAccuracy?: boolean;
      timeout?: number;
      maximumAge?: number;
      distanceFilter?: number;
    },
  ) => void;
  watchPosition: (
    success: (position: GPSPosition) => void,
    failure?: (error: GPSError) => void,
    options?: {
      enableHighAccuracy?: boolean;
      timeout?: number;
      maximumAge?: number;
      distanceFilter?: number;
    },
  ) => number;
  clearWatch: (watchId: number) => void;
};

type GPSStage =
  | 'idle'
  | 'requesting_permission'
  | 'quick_fix'
  | 'refining_accuracy'
  | 'tracking';

type StatusUpdate = {
  message: string;
  time: number;
};

function getGeolocation(): GeolocationLike | null {
  try {
    const moduleRef = require('@react-native-community/geolocation');
    return (moduleRef.default ?? moduleRef) as GeolocationLike;
  } catch {
    return null;
  }
}

function formatValue(value: number | null, suffix = '') {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${value.toFixed(6)}${suffix}`;
}

async function requestAndroidLocationPermission() {
  if (Platform.OS !== 'android') {
    return PermissionsAndroid.RESULTS.GRANTED;
  }

  return PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location Permission',
      message: 'This app needs location permission to show live GPS data.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );
}

async function requestAndroidBackgroundLocationPermission() {
  if (Platform.OS !== 'android') {
    return PermissionsAndroid.RESULTS.GRANTED;
  }

  const sdkVersion = Number(Platform.Version);
  if (sdkVersion < 29) {
    return PermissionsAndroid.RESULTS.GRANTED;
  }

  return PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
    {
      title: 'Background Location Permission',
      message:
        'Allow background location so GPS data continues while the app is minimized.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );
}

export default function GPSLiveDataScreen() {
  const [gpsData, setGpsData] = useState<GPSDataPoint | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [backgroundMessage, setBackgroundMessage] = useState<string | null>(null);
  const [gpsStage, setGpsStage] = useState<GPSStage>('idle');
  const [statusUpdates, setStatusUpdates] = useState<StatusUpdate[]>([]);
  const [isBackgroundRunning, setIsBackgroundRunning] = useState(false);
  const [isPermissionDeniedPermanently, setIsPermissionDeniedPermanently] =
    useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [gpsSettings, setGpsSettings] = useState<GPSQuerySettings>(
    DEFAULT_GPS_QUERY_SETTINGS,
  );
  const watchIdRef = useRef<number | null>(null);
  const lastCachedAtRef = useRef<number>(0);
  const bestAccuracyRef = useRef<number | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const gpsSettingsRef = useRef<GPSQuerySettings>(DEFAULT_GPS_QUERY_SETTINGS);

  const addStatusUpdate = (message: string) => {
    const next: StatusUpdate = { message, time: Date.now() };
    setStatusUpdates(prev => [next, ...prev].slice(0, 5));
  };

  const refreshSettings = async () => {
    const loaded = await getGPSQuerySettings();
    gpsSettingsRef.current = loaded;
    setGpsSettings(loaded);
  };

  const isSettingsChanged = (
    a: GPSQuerySettings,
    b: GPSQuerySettings,
  ): boolean => {
    return (
      a.overpassAroundMeters !== b.overpassAroundMeters ||
      a.minAccuracyMeters !== b.minAccuracyMeters ||
      a.distanceFilterMeters !== b.distanceFilterMeters ||
      a.maxAgeMs !== b.maxAgeMs
    );
  };

  const cacheSample = async (sample: GPSDataPoint) => {
    const settings = gpsSettingsRef.current;
    const shouldCallOverpass =
      sample.accuracy !== null && sample.accuracy <= settings.minAccuracyMeters;

    let pointToCache: GPSDataPoint = sample;
    let apiCalledTime: number | null = null;
    let apiResponseTime: number | null = null;
    let apiResponseText = '';
    if (shouldCallOverpass) {
      try {
        apiCalledTime = Date.now();
        const { roadInfo, rawResponse } = await fetchRoadInfoForLocation(
          sample.latitude,
          sample.longitude,
          settings.overpassAroundMeters,
        );
        apiResponseTime = Date.now();
        apiResponseText = JSON.stringify(rawResponse);
        pointToCache = { ...sample, roadInfo };
      } catch {
        apiResponseTime = Date.now();
        apiResponseText = JSON.stringify({ error: 'Overpass request failed' });
        pointToCache = {
          ...sample,
          roadInfo: {
            maxSpeed: 'not fetched',
            tags: {},
            wayId: null,
            status: 'Overpass request failed',
          },
        };
      }
    } else {
      pointToCache = {
        ...sample,
        roadInfo: {
          maxSpeed: 'not fetched',
          tags: {},
          wayId: null,
          status:
            sample.accuracy === null
              ? 'Skipped: accuracy unavailable'
              : `Skipped: accuracy ${sample.accuracy.toFixed(1)}m above threshold ${settings.minAccuracyMeters}m`,
        },
      };
      apiResponseText = JSON.stringify({
        info:
          sample.accuracy === null
            ? 'API not called because GPS accuracy is unavailable'
            : `API not called because GPS accuracy ${sample.accuracy.toFixed(1)}m is above threshold ${settings.minAccuracyMeters}m`,
      });
    }

    pointToCache = {
      ...pointToCache,
      querySettings: { ...settings },
    };

    const resolvedMaxSpeed = pointToCache.roadInfo?.maxSpeed ?? 'not fetched';
    await saveGPSOverlayMetrics({
      accuracy: sample.accuracy,
      maxSpeed: resolvedMaxSpeed,
    });
    const timelineCount = await appendGPSAPITimelineEntry({
      gpsData: JSON.stringify({
        latitude: sample.latitude,
        longitude: sample.longitude,
        altitude: sample.altitude,
        accuracy: sample.accuracy,
      }),
      gpsDataTime: sample.timestamp,
      querySettings: JSON.stringify(settings),
      apiCalledTime,
      apiResponseTime,
      apiResponse: apiResponseText,
    });
    await maybeAutoArchiveTimeline(timelineCount);
    const next = await appendGPSData(pointToCache);
    await maybeAutoArchiveGPSCache(next.length);
  };

  const onPositionReceived = (position: GPSPosition) => {
    setErrorMessage(null);
    const sample: GPSDataPoint = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      altitude: position.coords.altitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };

    setGpsData(sample);
    if (sample.accuracy !== null) {
      const previousBest = bestAccuracyRef.current;
      if (previousBest === null || sample.accuracy < previousBest) {
        bestAccuracyRef.current = sample.accuracy;
        addStatusUpdate(`Accuracy improved: ${sample.accuracy.toFixed(1)} m`);
      }
    }

    const now = Date.now();
    if (now - lastCachedAtRef.current >= 5000) {
      lastCachedAtRef.current = now;
      cacheSample(sample).catch(() => {
        setStorageMessage('Failed to cache GPS sample.');
      });
    }
  };

  const clearLocationWatch = () => {
    if (watchIdRef.current === null) {
      return;
    }

    const geolocation = getGeolocation();
    geolocation?.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  };

  const startLocationWatch = (geolocation: GeolocationLike) => {
    clearLocationWatch();
    setGpsStage('refining_accuracy');
    addStatusUpdate('Started high-accuracy refinement.');
    if (!isStorageReady()) {
      setStorageMessage(
        'Storage module missing. Run: npm i @react-native-async-storage/async-storage',
      );
    } else {
      setStorageMessage(null);
    }

    watchIdRef.current = geolocation.watchPosition(
      (position: GPSPosition) => {
        onPositionReceived(position);
        setGpsStage('tracking');
      },
      (error: GPSError) => {
        setErrorMessage(error.message);
        addStatusUpdate(`GPS error: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: gpsSettingsRef.current.distanceFilterMeters,
        timeout: 10000,
        maximumAge: gpsSettingsRef.current.maxAgeMs,
      },
    );
  };

  const requestPermissionAndStartGPS = async () => {
    if (isRequestingPermission) {
      return;
    }

    setIsRequestingPermission(true);
    setGpsStage('requesting_permission');
    addStatusUpdate('Requesting location permission...');

    const granted = await requestAndroidLocationPermission();
    const hasPermission = granted === PermissionsAndroid.RESULTS.GRANTED;

    setIsPermissionDeniedPermanently(
      granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    );

    if (!hasPermission) {
      setErrorMessage('Location permission denied.');
      setGpsStage('idle');
      addStatusUpdate('Location permission denied.');
      clearLocationWatch();
      setIsRequestingPermission(false);
      return;
    }

    const geolocation = getGeolocation();
    if (!geolocation) {
      setErrorMessage(
        'Geolocation module missing. Run: npm i @react-native-community/geolocation',
      );
      setGpsStage('idle');
      addStatusUpdate('Geolocation module is missing.');
      setIsRequestingPermission(false);
      return;
    }

    // Fast first fix: allow cached/network location so UI updates quickly.
    setGpsStage('quick_fix');
    addStatusUpdate('Getting quick first fix...');
    geolocation.getCurrentPosition(
      (position: GPSPosition) => {
        onPositionReceived(position);
        addStatusUpdate('Quick fix received.');
      },
      () => {
        // Ignore this failure; high-accuracy watcher below keeps running.
        addStatusUpdate('Quick fix timed out; continuing with high accuracy.');
      },
      {
        enableHighAccuracy: false,
        timeout: 4000,
        maximumAge: Math.max(15000, gpsSettingsRef.current.maxAgeMs),
      },
    );

    // Then keep watching with high accuracy for better precision.
    startLocationWatch(geolocation);
    setIsRequestingPermission(false);
  };

  useEffect(() => {
    setIsBackgroundRunning(isBackgroundTrackingRunning());
    refreshSettings().finally(() => {
      requestPermissionAndStartGPS();
    });

    const settingsPoller = setInterval(() => {
      getGPSQuerySettings()
        .then(nextSettings => {
          const prevSettings = gpsSettingsRef.current;
          if (!isSettingsChanged(prevSettings, nextSettings)) {
            return;
          }

          gpsSettingsRef.current = nextSettings;
          setGpsSettings(nextSettings);
          addStatusUpdate('Applied latest settings.');

          const geolocation = getGeolocation();
          if (geolocation && watchIdRef.current !== null) {
            startLocationWatch(geolocation);
          }
        })
        .catch(() => {
          // Ignore periodic settings read errors.
        });
    }, 2000);

    const subscription = AppState.addEventListener('change', nextAppState => {
      const prev = appStateRef.current;
      appStateRef.current = nextAppState;

      const movedToBackground =
        prev === 'active' && (nextAppState === 'background' || nextAppState === 'inactive');
      const movedToForeground =
        (prev === 'background' || prev === 'inactive') && nextAppState === 'active';

      if (movedToBackground) {
        startBackgroundFromLifecycle();
      }

      if (movedToForeground) {
        refreshSettings();

        if (isBackgroundTrackingRunning()) {
          stopBackgroundGPSTracking()
            .then(() => {
              setIsBackgroundRunning(false);
              setBackgroundMessage('Foreground active: background tracking stopped.');
              addStatusUpdate('App in foreground: background tracking stopped.');
            })
            .catch(() => {
              setBackgroundMessage('Could not stop background tracking.');
            });
        }
      }
    });

    return () => {
      clearInterval(settingsPoller);
      subscription.remove();
      clearLocationWatch();
    };
    // We intentionally run this once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOpenSettingsPress = () => {
    Linking.openSettings();
  };

  const onStartBackgroundPress = async () => {
    if (!isBackgroundTrackingAvailable()) {
      setBackgroundMessage(
        'Background module missing. Run: npm i react-native-background-actions',
      );
      return;
    }

    const granted = await requestAndroidBackgroundLocationPermission();
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      setBackgroundMessage('Background location permission denied.');
      addStatusUpdate('Background tracking not started (permission denied).');
      return;
    }

    try {
      await startBackgroundGPSTracking();
      setIsBackgroundRunning(true);
      setBackgroundMessage('Background tracking started.');
      addStatusUpdate('Background tracking started.');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to start background tracking.';
      setBackgroundMessage(message);
      addStatusUpdate(message);
    }
  };

  const onStopBackgroundPress = async () => {
    try {
      await stopBackgroundGPSTracking();
      setIsBackgroundRunning(false);
      setBackgroundMessage('Background tracking stopped.');
      addStatusUpdate('Background tracking stopped.');
    } catch {
      setBackgroundMessage('Failed to stop background tracking.');
    }
  };

  const ensureAndroidBackgroundPermissions = async () => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const hasFine = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    if (!hasFine) {
      return false;
    }

    const sdkVersion = Number(Platform.Version);
    if (sdkVersion < 29) {
      return true;
    }

    const hasBackground = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
    );
    return hasBackground;
  };

  const startBackgroundFromLifecycle = async () => {
    if (!isBackgroundTrackingAvailable()) {
      return;
    }

    if (isBackgroundTrackingRunning()) {
      setIsBackgroundRunning(true);
      return;
    }

    const hasPermissions = await ensureAndroidBackgroundPermissions();
    if (!hasPermissions) {
      addStatusUpdate(
        'Background tracking skipped: grant "Allow all the time" location.',
      );
      return;
    }

    try {
      await startBackgroundGPSTracking();
      setIsBackgroundRunning(true);
      setBackgroundMessage('Background tracking started automatically.');
      addStatusUpdate('App in background: tracking started.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to auto-start background.';
      setBackgroundMessage(message);
      addStatusUpdate(message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Live GPS Data</Text>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {storageMessage ? <Text style={styles.storageInfo}>{storageMessage}</Text> : null}
        {backgroundMessage ? (
          <Text style={styles.backgroundInfo}>{backgroundMessage}</Text>
        ) : null}

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>GPS Status</Text>
          <Text style={styles.statusStage}>Stage: {gpsStage}</Text>
          <Text style={styles.statusMeta}>
            Around: {gpsSettings.overpassAroundMeters}m | Min accuracy:{' '}
            {gpsSettings.minAccuracyMeters}m
          </Text>
          <Text style={styles.statusMeta}>
            Distance: {gpsSettings.distanceFilterMeters}m | MaxAge:{' '}
            {gpsSettings.maxAgeMs}ms
          </Text>
          {statusUpdates.map((item, index) => (
            <Text key={`${item.time}-${index}`} style={styles.statusLine}>
              {new Date(item.time).toLocaleTimeString()} - {item.message}
            </Text>
          ))}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={styles.button}
            onPress={requestPermissionAndStartGPS}
            disabled={isRequestingPermission}
          >
            <Text style={styles.buttonText}>
              {isRequestingPermission
                ? 'Requesting...'
                : 'Grant Location Permission'}
            </Text>
          </Pressable>

          {isPermissionDeniedPermanently ? (
            <Pressable style={styles.secondaryButton} onPress={onOpenSettingsPress}>
              <Text style={styles.secondaryButtonText}>Open App Settings</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            style={isBackgroundRunning ? styles.secondaryButton : styles.button}
            onPress={isBackgroundRunning ? onStopBackgroundPress : onStartBackgroundPress}
          >
            <Text
              style={
                isBackgroundRunning
                  ? styles.secondaryButtonText
                  : styles.buttonText
              }
            >
              {isBackgroundRunning
                ? 'Stop Background Tracking'
                : 'Start Background Tracking'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Latitude</Text>
          <Text style={styles.value}>{formatValue(gpsData?.latitude ?? null)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Longitude</Text>
          <Text style={styles.value}>{formatValue(gpsData?.longitude ?? null)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Altitude</Text>
          <Text style={styles.value}>{formatValue(gpsData?.altitude ?? null, ' m')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Accuracy</Text>
          <Text style={styles.value}>{formatValue(gpsData?.accuracy ?? null, ' m')}</Text>
        </View>

        <Text style={styles.timestamp}>
          Last update:{' '}
          {gpsData
            ? new Date(gpsData.timestamp).toLocaleTimeString()
            : 'Waiting for GPS...'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 12,
    paddingBottom: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  label: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 4,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  timestamp: {
    marginTop: 8,
    fontSize: 13,
    color: '#475569',
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    marginBottom: 4,
  },
  storageInfo: {
    color: '#92400e',
    fontSize: 13,
    marginBottom: 4,
  },
  backgroundInfo: {
    color: '#1d4ed8',
    fontSize: 13,
    marginBottom: 4,
  },
  statusCard: {
    backgroundColor: '#ecfeff',
    borderRadius: 12,
    borderColor: '#a5f3fc',
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  statusStage: {
    fontSize: 13,
    fontWeight: '600',
    color: '#155e75',
    marginBottom: 2,
  },
  statusMeta: {
    fontSize: 12,
    color: '#334155',
  },
  statusLine: {
    fontSize: 12,
    color: '#1f2937',
  },
  actions: {
    gap: 8,
    marginBottom: 4,
  },
  button: {
    backgroundColor: '#0f766e',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
});
