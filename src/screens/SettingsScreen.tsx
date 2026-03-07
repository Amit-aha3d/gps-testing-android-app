import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  DEFAULT_GPS_QUERY_SETTINGS,
  getGPSQuerySettings,
  saveGPSQuerySettings,
} from '../features/gps/storage/gpsSettings';

type FormState = {
  overpassAroundMeters: string;
  minAccuracyMeters: string;
  distanceFilterMeters: string;
  maxAgeMs: string;
};

function toFormState(values = DEFAULT_GPS_QUERY_SETTINGS): FormState {
  return {
    overpassAroundMeters: String(values.overpassAroundMeters),
    minAccuracyMeters: String(values.minAccuracyMeters),
    distanceFilterMeters: String(values.distanceFilterMeters),
    maxAgeMs: String(values.maxAgeMs),
  };
}

function parsePositiveInt(input: string, fieldLabel: string) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldLabel} must be 0 or greater.`);
  }
  return Math.round(value);
}

export default function SettingsScreen() {
  const [form, setForm] = useState<FormState>(() => toFormState());
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      const current = await getGPSQuerySettings();
      setForm(toFormState(current));
    };
    load();
  }, []);

  const onChange = (key: keyof FormState, value: string) => {
    setForm(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const onSavePress = async () => {
    try {
      setIsBusy(true);
      const overpassAroundMeters = parsePositiveInt(
        form.overpassAroundMeters,
        'Around',
      );
      if (overpassAroundMeters < 1) {
        throw new Error('Around must be at least 1 meter.');
      }

      const minAccuracyMeters = parsePositiveInt(
        form.minAccuracyMeters,
        'Minimum accuracy',
      );
      if (minAccuracyMeters < 1) {
        throw new Error('Minimum accuracy must be at least 1 meter.');
      }

      const distanceFilterMeters = parsePositiveInt(
        form.distanceFilterMeters,
        'Distance filter',
      );
      const maxAgeMs = parsePositiveInt(form.maxAgeMs, 'Max age');

      const saved = await saveGPSQuerySettings({
        overpassAroundMeters,
        minAccuracyMeters,
        distanceFilterMeters,
        maxAgeMs,
      });
      setForm(toFormState(saved));
      Alert.alert('Saved', 'GPS and Overpass settings updated.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not save settings.';
      Alert.alert('Save failed', message);
    } finally {
      setIsBusy(false);
    }
  };

  const onResetPress = async () => {
    try {
      setIsBusy(true);
      const saved = await saveGPSQuerySettings(DEFAULT_GPS_QUERY_SETTINGS);
      setForm(toFormState(saved));
      Alert.alert('Reset complete', 'Default settings restored.');
    } catch {
      Alert.alert('Reset failed', 'Could not reset settings.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>GPS Query Settings</Text>
        <Text style={styles.subtitle}>
          Configure when GPS points should call Overpass API.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Around radius (meters)</Text>
          <TextInput
            style={styles.input}
            value={form.overpassAroundMeters}
            keyboardType="numeric"
            onChangeText={text => onChange('overpassAroundMeters', text)}
            placeholder="50"
          />

          <Text style={styles.label}>Minimum accuracy to call API (meters)</Text>
          <TextInput
            style={styles.input}
            value={form.minAccuracyMeters}
            keyboardType="numeric"
            onChangeText={text => onChange('minAccuracyMeters', text)}
            placeholder="30"
          />

          <Text style={styles.label}>Distance filter for GPS updates (meters)</Text>
          <TextInput
            style={styles.input}
            value={form.distanceFilterMeters}
            keyboardType="numeric"
            onChangeText={text => onChange('distanceFilterMeters', text)}
            placeholder="1"
          />

          <Text style={styles.label}>GPS maxAge (milliseconds)</Text>
          <TextInput
            style={styles.input}
            value={form.maxAgeMs}
            keyboardType="numeric"
            onChangeText={text => onChange('maxAgeMs', text)}
            placeholder="1000"
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[
              styles.button,
              styles.saveButton,
              isBusy ? styles.buttonDisabled : null,
            ]}
            onPress={onSavePress}
            disabled={isBusy}
          >
            <Text style={styles.buttonText}>{isBusy ? 'Saving...' : 'Save'}</Text>
          </Pressable>
          <Pressable
            style={[
              styles.button,
              styles.resetButton,
              isBusy ? styles.buttonDisabled : null,
            ]}
            onPress={onResetPress}
            disabled={isBusy}
          >
            <Text style={styles.buttonText}>
              {isBusy ? 'Please wait...' : 'Reset Defaults'}
            </Text>
          </Pressable>
        </View>
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
    paddingBottom: 24,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#475569',
  },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
  },
  label: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f8fafc',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#0f766e',
  },
  resetButton: {
    backgroundColor: '#334155',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
