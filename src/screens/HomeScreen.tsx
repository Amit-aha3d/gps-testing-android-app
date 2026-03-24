import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  clearCachedGPSData,
  getCachedGPSData,
  isStorageReady,
} from '../features/gps/storage/gpsCache';
import { generateGPSPdfReport } from '../features/gps/reports/gpsPdfReport';
import {
  openPdfInExternalApp,
} from '../features/gps/native/pdfSave';
import {
  addArchivedGPSReport,
  getArchivedGPSReports,
  type GPSArchivedReport,
} from '../features/gps/storage/gpsReports';
import type { GPSDataPoint } from '../features/gps/types/gps';

export default function HomeScreen() {
  const [cachedData, setCachedData] = useState<GPSDataPoint[]>([]);
  const [archivedReports, setArchivedReports] = useState<GPSArchivedReport[]>([]);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!isStorageReady()) {
        if (mounted) {
          setStorageMessage(
            'Storage module missing. Run: npm i @react-native-async-storage/async-storage',
          );
        }
        return;
      }

      if (mounted) {
        setStorageMessage(null);
      }
      const data = await getCachedGPSData();
      if (mounted) {
        setCachedData(data);
      }
      const reports = await getArchivedGPSReports();
      if (mounted) {
        setArchivedReports(reports);
      }
    };

    load();
    const timerId = setInterval(load, 1000);

    return () => {
      mounted = false;
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
      await addArchivedGPSReport({
        filePath,
        createdAt: Date.now(),
        pointCount: data.length,
      });
      const reports = await getArchivedGPSReports();
      setArchivedReports(reports);
      Alert.alert('PDF saved', `Saved in app storage:\n${filePath}`);
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

  const onViewReportPress = async (report: GPSArchivedReport) => {
    try {
      if (Platform.OS === 'android') {
        await openPdfInExternalApp(report.filePath);
        return;
      }
      Alert.alert('Unsupported', 'View action is currently supported on Android.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not open PDF report.';
      Alert.alert('Open failed', message);
    }
  };

  const renderItem = ({ item }: { item: GPSDataPoint }) => {
    const tagsText =
      item.roadInfo && Object.keys(item.roadInfo.tags).length > 0
        ? Object.entries(item.roadInfo.tags)
            .map(([key, value]) => `${key}:${value}`)
            .join(', ')
        : 'not fetched';

    const settingsText = item.querySettings
      ? `around:${item.querySettings.overpassAroundMeters}m, minAcc:${item.querySettings.minAccuracyMeters}m, distance:${item.querySettings.distanceFilterMeters}m, maxAge:${item.querySettings.maxAgeMs}ms, fixedFallback:${item.querySettings.fixedFallbackSpeedKmph}km/h`
      : 'not saved';

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
        <Text style={styles.value}>API Status: {item.roadInfo?.status ?? 'not fetched'}</Text>
        <Text style={styles.value}>Tags: {tagsText}</Text>
        <Text style={styles.value}>Config: {settingsText}</Text>
      </View>
    );
  };

  const renderReportsSection = () => (
    <View style={styles.reportsSection}>
      <Text style={styles.sectionTitle}>Saved PDF Reports</Text>
      {archivedReports.length === 0 ? (
        <Text style={styles.empty}>No saved PDF reports yet.</Text>
      ) : (
        archivedReports.map(item => (
          <View key={item.id} style={styles.reportRow}>
            <Text style={styles.reportTitle}>
              {new Date(item.createdAt).toLocaleString()}
            </Text>
            <Text style={styles.reportMeta}>Points: {item.pointCount}</Text>
            <Text style={styles.reportMeta} numberOfLines={1}>
              Path: {item.filePath}
            </Text>
            <Pressable
              style={[styles.button, styles.viewButton]}
              onPress={() => onViewReportPress(item)}
            >
              <Text style={styles.buttonText}>View</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );

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
        ListFooterComponent={renderReportsSection}
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 8,
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
  viewButton: {
    marginTop: 8,
    backgroundColor: '#1d4ed8',
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
  reportsSection: {
    marginTop: 8,
    gap: 10,
  },
  reportRow: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderColor: '#dbeafe',
    borderWidth: 1,
    padding: 12,
    gap: 2,
  },
  reportTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e3a8a',
  },
  reportMeta: {
    fontSize: 12,
    color: '#334155',
  },
});
