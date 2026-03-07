import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  clearCachedGPSData,
  getCachedGPSData,
  isStorageReady,
} from '../features/gps/storage/gpsCache';
import { generateGPSPdfReport } from '../features/gps/reports/gpsPdfReport';
import type { GPSDataPoint } from '../features/gps/types/gps';

export default function HomeScreen() {
  const [cachedData, setCachedData] = useState<GPSDataPoint[]>([]);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

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

  const onDownloadPdfPress = async () => {
    try {
      setIsBusy(true);
      const data = await getCachedGPSData();
      if (data.length === 0) {
        Alert.alert('No data', 'No cached GPS data found to generate a report.');
        return;
      }

      const filePath = await generateGPSPdfReport(data);
      Alert.alert('PDF downloaded', `Saved at:\n${filePath}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not generate PDF report.';
      Alert.alert(
        'Download failed',
        message,
      );
    } finally {
      setIsBusy(false);
    }
  };

  const onClearCachePress = async () => {
    try {
      setIsBusy(true);
      await clearCachedGPSData();
      setCachedData([]);
    } catch {
      Alert.alert('Clear failed', 'Could not clear cached GPS data.');
    } finally {
      setIsBusy(false);
    }
  };

  const renderItem = ({ item }: { item: GPSDataPoint }) => {
    const tagsText =
      item.roadInfo && Object.keys(item.roadInfo.tags).length > 0
        ? Object.entries(item.roadInfo.tags)
            .map(([key, value]) => `${key}:${value}`)
            .join(', ')
        : 'not fetched';

    return (
      <View style={styles.row}>
        <Text style={styles.time}>
          {new Date(item.timestamp).toLocaleString()}
        </Text>
        <Text style={styles.value}>Lat: {item.latitude.toFixed(6)}</Text>
        <Text style={styles.value}>Lon: {item.longitude.toFixed(6)}</Text>
        <Text style={styles.value}>
          Alt: {item.altitude === null ? 'N/A' : `${item.altitude.toFixed(2)} m`}
        </Text>
        <Text style={styles.value}>
          Acc: {item.accuracy === null ? 'N/A' : `${item.accuracy.toFixed(2)} m`}
        </Text>
        <Text style={styles.value}>
          MaxSpeed: {item.roadInfo?.maxSpeed ?? 'not fetched'}
        </Text>
        <Text style={styles.value}>WayId: {item.roadInfo?.wayId ?? 'not fetched'}</Text>
        <Text style={styles.value}>Tags: {tagsText}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GPS + Road Cache (Every 5 sec)</Text>
      {storageMessage ? <Text style={styles.warning}>{storageMessage}</Text> : null}
      <Text style={styles.subtitle}>Cached points: {cachedData.length}</Text>

      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.downloadButton]}
          onPress={onDownloadPdfPress}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>Download PDF</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.clearButton]}
          onPress={onClearCachePress}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>Clear Cache</Text>
        </Pressable>
      </View>

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
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  downloadButton: {
    backgroundColor: '#0f766e',
  },
  clearButton: {
    backgroundColor: '#b91c1c',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
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
