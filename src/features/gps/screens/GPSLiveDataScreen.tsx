import React, { useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type GPSData = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  timestamp: number;
};

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
  const nav = (globalThis as { navigator?: { geolocation?: GeolocationLike } })
    .navigator;

  return nav?.geolocation ?? null;
}

async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location Permission',
      message: 'This app needs location permission to show live GPS data.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

function formatValue(value: number | null, suffix = '') {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${value.toFixed(6)}${suffix}`;
}

export default function GPSLiveDataScreen() {
  const [gpsData, setGpsData] = useState<GPSData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const startWatching = async () => {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        if (isMounted) {
          setErrorMessage('Location permission denied.');
        }
        return;
      }

      const geolocation = getGeolocation();
      if (!geolocation) {
        if (isMounted) {
          setErrorMessage(
            'Geolocation API is unavailable on this build. Install a geolocation library if needed.',
          );
        }
        return;
      }

      watchIdRef.current = geolocation.watchPosition(
        (position: GPSPosition) => {
          if (!isMounted) {
            return;
          }

          setErrorMessage(null);
          setGpsData({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: position.coords.altitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          });
        },
        (error: GPSError) => {
          if (isMounted) {
            setErrorMessage(error.message);
          }
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 0,
          timeout: 15000,
          maximumAge: 2000,
        },
      );
    };

    startWatching();

    return () => {
      isMounted = false;

      if (
        watchIdRef.current !== null
      ) {
        const geolocation = getGeolocation();
        geolocation?.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Live GPS Data</Text>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.label}>Latitude</Text>
          <Text style={styles.value}>
            {formatValue(gpsData?.latitude ?? null)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Longitude</Text>
          <Text style={styles.value}>
            {formatValue(gpsData?.longitude ?? null)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Altitude</Text>
          <Text style={styles.value}>
            {formatValue(gpsData?.altitude ?? null, ' m')}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Accuracy</Text>
          <Text style={styles.value}>
            {formatValue(gpsData?.accuracy ?? null, ' m')}
          </Text>
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
});
