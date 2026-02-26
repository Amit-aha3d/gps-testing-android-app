import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { appendGPSData, isStorageReady } from '../storage/gpsCache';
import type { GPSDataPoint } from '../types/gps';

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

function getGeolocation(): GeolocationLike | null {
  try {
    const moduleRef = require('@react-native-community/geolocation');
    return (moduleRef.default ?? moduleRef) as GeolocationLike;
  } catch (_error) {
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

export default function GPSLiveDataScreen() {
  const [gpsData, setGpsData] = useState<GPSDataPoint | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [isPermissionDeniedPermanently, setIsPermissionDeniedPermanently] =
    useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastCachedAtRef = useRef<number>(0);

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
    if (!isStorageReady()) {
      setStorageMessage(
        'Storage module missing. Run: npm i @react-native-async-storage/async-storage',
      );
    } else {
      setStorageMessage(null);
    }

    watchIdRef.current = geolocation.watchPosition(
      (position: GPSPosition) => {
        setErrorMessage(null);
        const sample: GPSDataPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          altitude: position.coords.altitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };

        setGpsData(sample);

        const now = Date.now();
        if (now - lastCachedAtRef.current >= 5000) {
          lastCachedAtRef.current = now;
          appendGPSData(sample).catch(() => {
            setStorageMessage('Failed to cache GPS sample.');
          });
        }
      },
      (error: GPSError) => {
        setErrorMessage(error.message);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 0,
        timeout: 15000,
        maximumAge: 2000,
      },
    );
  };

  const requestPermissionAndStartGPS = async () => {
    if (isRequestingPermission) {
      return;
    }

    setIsRequestingPermission(true);

    const granted = await requestAndroidLocationPermission();
    const hasPermission = granted === PermissionsAndroid.RESULTS.GRANTED;

    setIsPermissionDeniedPermanently(
      granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    );

    if (!hasPermission) {
      setErrorMessage('Location permission denied.');
      clearLocationWatch();
      setIsRequestingPermission(false);
      return;
    }

    const geolocation = getGeolocation();
    if (!geolocation) {
      setErrorMessage(
        'Geolocation module missing. Run: npm i @react-native-community/geolocation',
      );
      setIsRequestingPermission(false);
      return;
    }

    startLocationWatch(geolocation);
    setIsRequestingPermission(false);
  };

  useEffect(() => {
    requestPermissionAndStartGPS();

    return () => {
      clearLocationWatch();
    };
    // We intentionally run this once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOpenSettingsPress = () => {
    Linking.openSettings();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Live GPS Data</Text>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {storageMessage ? <Text style={styles.storageInfo}>{storageMessage}</Text> : null}

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
      </View>
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
    padding: 16,
    gap: 12,
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
