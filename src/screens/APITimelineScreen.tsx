import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AUTO_TIMELINE_ARCHIVE_ITEMS,
  clearGPSAPITimeline,
  getGPSAPITimeline,
  type GPSAPITimelineEntry,
} from '../features/gps/storage/gpsApiTimeline';
import { openPdfInExternalApp } from '../features/gps/native/pdfSave';
import { generateTimelinePdfReport } from '../features/gps/reports/gpsTimelinePdfReport';
import {
  addArchivedGPSReport,
  getArchivedGPSReports,
  type GPSArchivedReport,
} from '../features/gps/storage/gpsReports';

function formatTime(value: number | null) {
  if (value === null) {
    return 'N/A';
  }
  return new Date(value).toLocaleString();
}

export default function APITimelineScreen() {
  const [rows, setRows] = useState<GPSAPITimelineEntry[]>([]);
  const [archivedReports, setArchivedReports] = useState<GPSArchivedReport[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      const data = await getGPSAPITimeline();
      setRows(data);
      const reports = await getArchivedGPSReports();
      setArchivedReports(reports.filter(item => item.reportType === 'timeline'));
    };

    load();
    const timerId = setInterval(load, 3000);
    return () => {
      clearInterval(timerId);
    };
  }, []);

  const onClearPress = async () => {
    try {
      setIsBusy(true);
      await clearGPSAPITimeline();
      setRows([]);
    } catch {
      Alert.alert('Clear failed', 'Could not clear API timeline data.');
    } finally {
      setIsBusy(false);
    }
  };

  const onDownloadPress = async () => {
    try {
      setIsBusy(true);
      const data = await getGPSAPITimeline();
      if (data.length === 0) {
        Alert.alert('No data', 'No timeline data available to export.');
        return;
      }

      const filePath = await generateTimelinePdfReport(data);
      await addArchivedGPSReport({
        filePath,
        createdAt: Date.now(),
        pointCount: data.length,
        reportType: 'timeline',
      });
      await clearGPSAPITimeline();
      setRows([]);
      const reports = await getArchivedGPSReports();
      setArchivedReports(reports.filter(item => item.reportType === 'timeline'));
      Alert.alert(
        'Timeline PDF saved',
        `Saved in app storage and timeline cleared:\n${filePath}`,
        [
          { text: 'Close', style: 'cancel' },
          {
            text: 'Open',
            onPress: () => {
              openPdfInExternalApp(filePath).catch(() => {
                Alert.alert('Open failed', 'Could not open generated PDF.');
              });
            },
          },
        ],
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not export timeline PDF.';
      Alert.alert('Export failed', message);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GPS + API Timeline</Text>
      <Text style={styles.subtitle}>
        Rows: {rows.length} | Auto archive at {AUTO_TIMELINE_ARCHIVE_ITEMS}
      </Text>
      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.downloadButton, isBusy ? styles.buttonDisabled : null]}
          onPress={onDownloadPress}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>Download PDF</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.clearButton, isBusy ? styles.buttonDisabled : null]}
          onPress={onClearPress}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>Clear Timeline</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cell, styles.headerCell]}>GPS Data</Text>
              <Text style={[styles.cell, styles.headerCell]}>GPS Data Time</Text>
              <Text style={[styles.cell, styles.headerCell]}>Query Settings</Text>
              <Text style={[styles.cell, styles.headerCell]}>API Called Time</Text>
              <Text style={[styles.cell, styles.headerCell]}>API Response Time</Text>
              <Text style={[styles.cellWide, styles.headerCell]}>Full API Response</Text>
            </View>

            {rows.map(item => (
              <View key={item.id} style={styles.row}>
                <Text style={styles.cell}>{item.gpsData}</Text>
                <Text style={styles.cell}>{formatTime(item.gpsDataTime)}</Text>
                <Text style={styles.cell}>{item.querySettings ?? 'not available'}</Text>
                <Text style={styles.cell}>{formatTime(item.apiCalledTime)}</Text>
                <Text style={styles.cell}>{formatTime(item.apiResponseTime)}</Text>
                <Text style={styles.cellWide}>{item.apiResponse}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.reportsSection}>
          <Text style={styles.sectionTitle}>Saved Timeline PDFs</Text>
          {archivedReports.length === 0 ? (
            <Text style={styles.empty}>No saved timeline PDFs yet.</Text>
          ) : (
            archivedReports.map(item => (
              <View key={item.id} style={styles.reportRow}>
                <Text style={styles.reportTitle}>
                  {new Date(item.createdAt).toLocaleString()}
                </Text>
                <Text style={styles.reportMeta}>Rows: {item.pointCount}</Text>
                <Text style={styles.reportMeta} numberOfLines={1}>
                  Path: {item.filePath}
                </Text>
                <Pressable
                  style={[styles.button, styles.viewButton]}
                  onPress={() => {
                    openPdfInExternalApp(item.filePath).catch(() => {
                      Alert.alert('Open failed', 'Could not open timeline PDF.');
                    });
                  }}
                >
                  <Text style={styles.buttonText}>View</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 12,
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 13,
    color: '#475569',
  },
  scroll: {
    flex: 1,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  downloadButton: {
    backgroundColor: '#0f766e',
  },
  clearButton: {
    backgroundColor: '#b91c1c',
    borderRadius: 8,
  },
  viewButton: {
    marginTop: 8,
    backgroundColor: '#1d4ed8',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  table: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  headerRow: {
    borderTopWidth: 0,
    backgroundColor: '#e2e8f0',
  },
  cell: {
    width: 220,
    padding: 8,
    fontSize: 12,
    color: '#111827',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  cellWide: {
    width: 500,
    padding: 8,
    fontSize: 12,
    color: '#111827',
  },
  headerCell: {
    fontWeight: '700',
    color: '#0f172a',
  },
  reportsSection: {
    marginTop: 8,
    gap: 10,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
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
  empty: {
    fontSize: 13,
    color: '#64748b',
  },
});
