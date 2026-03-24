type LastSample = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

export type GPSSpeedDecisionState = {
  activeStableSpeedKmph: number | null;
  lastGoodSpeedKmph: number | null;
  lastGoodAt: number;
  lastGoodWayId: number | null;
  lastSample: LastSample | null;
  pendingCandidateSpeedKmph: number | null;
  pendingCandidateWayId: number | null;
  pendingTrials: number;
};

const GPS_SPEED_DECISION_STATE_KEY = 'gps_speed_decision_state_v1';

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const DEFAULT_STATE: GPSSpeedDecisionState = {
  activeStableSpeedKmph: null,
  lastGoodSpeedKmph: null,
  lastGoodAt: 0,
  lastGoodWayId: null,
  lastSample: null,
  pendingCandidateSpeedKmph: null,
  pendingCandidateWayId: null,
  pendingTrials: 0,
};

function getAsyncStorage(): AsyncStorageLike | null {
  try {
    const moduleRef = require('@react-native-async-storage/async-storage');
    return (moduleRef.default ?? moduleRef) as AsyncStorageLike;
  } catch {
    return null;
  }
}

export async function getGPSSpeedDecisionState(): Promise<GPSSpeedDecisionState> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return DEFAULT_STATE;
  }

  const raw = await asyncStorage.getItem(GPS_SPEED_DECISION_STATE_KEY);
  if (!raw) {
    return DEFAULT_STATE;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GPSSpeedDecisionState>;
    return {
      activeStableSpeedKmph:
        typeof parsed.activeStableSpeedKmph === 'number'
          ? parsed.activeStableSpeedKmph
          : DEFAULT_STATE.activeStableSpeedKmph,
      lastGoodSpeedKmph:
        typeof parsed.lastGoodSpeedKmph === 'number'
          ? parsed.lastGoodSpeedKmph
          : DEFAULT_STATE.lastGoodSpeedKmph,
      lastGoodAt:
        typeof parsed.lastGoodAt === 'number' ? parsed.lastGoodAt : DEFAULT_STATE.lastGoodAt,
      lastGoodWayId:
        typeof parsed.lastGoodWayId === 'number'
          ? parsed.lastGoodWayId
          : DEFAULT_STATE.lastGoodWayId,
      lastSample:
        parsed.lastSample &&
        typeof parsed.lastSample.latitude === 'number' &&
        typeof parsed.lastSample.longitude === 'number' &&
        typeof parsed.lastSample.timestamp === 'number'
          ? parsed.lastSample
          : DEFAULT_STATE.lastSample,
      pendingCandidateSpeedKmph:
        typeof parsed.pendingCandidateSpeedKmph === 'number'
          ? parsed.pendingCandidateSpeedKmph
          : DEFAULT_STATE.pendingCandidateSpeedKmph,
      pendingCandidateWayId:
        typeof parsed.pendingCandidateWayId === 'number'
          ? parsed.pendingCandidateWayId
          : DEFAULT_STATE.pendingCandidateWayId,
      pendingTrials:
        typeof parsed.pendingTrials === 'number'
          ? parsed.pendingTrials
          : DEFAULT_STATE.pendingTrials,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export async function saveGPSSpeedDecisionState(
  state: GPSSpeedDecisionState,
): Promise<void> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return;
  }

  await asyncStorage.setItem(GPS_SPEED_DECISION_STATE_KEY, JSON.stringify(state));
}

