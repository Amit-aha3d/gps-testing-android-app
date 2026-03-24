import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getGPSOverlayMetrics } from '../storage/gpsOverlayMetrics';

type WidgetState = {
  accuracy: number | null;
  directSpeedKmph: number | null;
  resolvedSpeedKmph: number | null;
  approach: string;
  edgeCase: string;
};

export default function GlobalGPSWidget() {
  const [state, setState] = useState<WidgetState>({
    accuracy: null,
    directSpeedKmph: null,
    resolvedSpeedKmph: null,
    approach: 'not_started',
    edgeCase: 'not_started',
  });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const next = await getGPSOverlayMetrics();
      if (!mounted) {
        return;
      }
      setState({
        accuracy: next.accuracy,
        directSpeedKmph: next.directSpeedKmph,
        resolvedSpeedKmph: next.resolvedSpeedKmph,
        approach: next.approach,
        edgeCase: next.edgeCase,
      });
    };

    load();
    const timerId = setInterval(load, 2000);
    return () => {
      mounted = false;
      clearInterval(timerId);
    };
  }, []);

  return (
    <View pointerEvents="none" style={styles.container}>
      <Text style={styles.title}>Live Speed</Text>
      <Text style={styles.row}>
        Direct:{' '}
        {state.directSpeedKmph === null ? 'N/A' : `${state.directSpeedKmph} km/h`}
      </Text>
      <Text style={styles.row}>
        Smart:{' '}
        {state.resolvedSpeedKmph === null ? 'N/A' : `${state.resolvedSpeedKmph} km/h`}
      </Text>
      <Text style={styles.row}>
        Accuracy:{' '}
        {state.accuracy === null ? 'N/A' : `${state.accuracy.toFixed(2)} m`}
      </Text>
      <Text style={styles.row}>Mode: {state.approach}</Text>
      <Text style={styles.row}>Edge: {state.edgeCase}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    zIndex: 9999,
    elevation: 12,
    minWidth: 220,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065f46',
    marginBottom: 4,
  },
  row: {
    fontSize: 12,
    fontWeight: '600',
    color: '#064e3b',
  },
});
