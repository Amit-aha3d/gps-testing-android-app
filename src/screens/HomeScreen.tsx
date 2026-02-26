import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { getCachedGPSData, isStorageReady } from '../features/gps/storage/gpsCache';
import type { GPSDataPoint } from '../features/gps/types/gps';

export default function HomeScreen() {
  const [cachedData, setCachedData] = useState<GPSDataPoint[]>([]);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!isStorageReady()) {
        setStorageMessage(
          'Storage module missing. Run: npm i @react-native-async-storage/async-storage',
        );
        return;
      }

      setStorageMessage(null);
      const data = await getCachedGPSData();
      setCachedData(data);
    };

    load();
    const timerId = setInterval(load, 5000);

    return () => {
      clearInterval(timerId);
    };
  }, []);

  const renderItem = ({ item }: { item: GPSDataPoint }) => {
    return (
      <View style={styles.row}>
        <Text style={styles.time}>
          {new Date(item.timestamp).toLocaleTimeString()}
        </Text>
        <Text style={styles.value}>Lat: {item.latitude.toFixed(6)}</Text>
        <Text style={styles.value}>Lon: {item.longitude.toFixed(6)}</Text>
        <Text style={styles.value}>
          Alt: {item.altitude === null ? 'N/A' : `${item.altitude.toFixed(2)} m`}
        </Text>
        <Text style={styles.value}>
          Acc: {item.accuracy === null ? 'N/A' : `${item.accuracy.toFixed(2)} m`}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GPS Cache (Every 5 sec)</Text>
      {storageMessage ? <Text style={styles.warning}>{storageMessage}</Text> : null}
      <Text style={styles.subtitle}>Cached points: {cachedData.length}</Text>

      <FlatList
        data={cachedData}
        keyExtractor={(item, index) => `${item.timestamp}-${index}`}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.empty}>No cached GPS data yet. Open GPS tab first.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    marginTop: 6,
  },
  warning: {
    color: '#92400e',
    fontSize: 13,
    marginTop: 8,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 24,
    gap: 10,
  },
  row: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderColor: '#e2e8f0',
    borderWidth: 1,
    padding: 12,
    gap: 2,
  },
  time: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f766e',
    marginBottom: 4,
  },
  value: {
    fontSize: 13,
    color: '#1f2937',
  },
  empty: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
});
