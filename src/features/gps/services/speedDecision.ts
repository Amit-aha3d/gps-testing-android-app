import {
  getGPSSpeedDecisionState,
  saveGPSSpeedDecisionState,
  type GPSSpeedDecisionState,
} from '../storage/gpsSpeedDecisionState';
import type { GPSQuerySettings, GPSRoadInfo, GPSSpeedDecision } from '../types/gps';

type SpeedDecisionInput = {
  latitude: number;
  longitude: number;
  timestamp: number;
  roadInfo: GPSRoadInfo;
  querySettings: GPSQuerySettings;
};

const LAST_GOOD_HOLD_MS = 15000;
const STALE_LOCATION_MS = 10000;
const IMPOSSIBLE_SPEED_KMH = 180;
const CHANGE_CONFIRMATION_TRIALS = 2;

function parseSpeedKmph(input: string): number | null {
  const match = input.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function buildHoldOrFallbackDecision(
  state: GPSSpeedDecisionState,
  edgeCase: string,
  detail: string,
  fixedFallbackSpeedKmph: number,
): { decision: GPSSpeedDecision; nextState: GPSSpeedDecisionState } {
  const now = Date.now();
  const hasFreshLastGood =
    state.lastGoodSpeedKmph !== null && now - state.lastGoodAt <= LAST_GOOD_HOLD_MS;

  if (hasFreshLastGood) {
    return {
      decision: {
        directSpeedKmph: null,
        resolvedSpeedKmph: state.lastGoodSpeedKmph as number,
        edgeCase,
        approach: 'hold_last_good',
        detail,
        decidedAt: now,
      },
      nextState: {
        ...state,
        activeStableSpeedKmph: state.lastGoodSpeedKmph,
        pendingCandidateSpeedKmph: null,
        pendingCandidateWayId: null,
        pendingTrials: 0,
      },
    };
  }

  return {
    decision: {
      directSpeedKmph: null,
      resolvedSpeedKmph: fixedFallbackSpeedKmph,
      edgeCase,
      approach: 'fixed_speed_fallback',
      detail,
      decidedAt: now,
    },
    nextState: {
      ...state,
      activeStableSpeedKmph: fixedFallbackSpeedKmph,
      pendingCandidateSpeedKmph: null,
      pendingCandidateWayId: null,
      pendingTrials: 0,
    },
  };
}

export async function resolveSpeedDecision(
  input: SpeedDecisionInput,
): Promise<GPSSpeedDecision> {
  const state = await getGPSSpeedDecisionState();
  const now = Date.now();
  const nextBaseState: GPSSpeedDecisionState = {
    ...state,
    lastSample: {
      latitude: input.latitude,
      longitude: input.longitude,
      timestamp: input.timestamp,
    },
  };

  if (now - input.timestamp > STALE_LOCATION_MS) {
    const result = buildHoldOrFallbackDecision(
      state,
      'old_gps_data',
      `Location timestamp is older than ${STALE_LOCATION_MS / 1000}s.`,
      input.querySettings.fixedFallbackSpeedKmph,
    );
    await saveGPSSpeedDecisionState(result.nextState);
    return result.decision;
  }

  const previousSample = state.lastSample;
  if (previousSample && input.timestamp > previousSample.timestamp) {
    const deltaSeconds = (input.timestamp - previousSample.timestamp) / 1000;
    const distance = distanceMeters(
      previousSample.latitude,
      previousSample.longitude,
      input.latitude,
      input.longitude,
    );
    const impliedSpeedKmph = deltaSeconds > 0 ? (distance / deltaSeconds) * 3.6 : 0;
    if (distance > 100 && impliedSpeedKmph > IMPOSSIBLE_SPEED_KMH) {
      const result = buildHoldOrFallbackDecision(
        state,
        'gps_jump',
        `Rejected GPS jump with implied speed ${impliedSpeedKmph.toFixed(1)} km/h.`,
        input.querySettings.fixedFallbackSpeedKmph,
      );
      await saveGPSSpeedDecisionState(result.nextState);
      return result.decision;
    }
  }

  if (input.roadInfo.status.startsWith('Skipped: accuracy')) {
    const result = buildHoldOrFallbackDecision(
      nextBaseState,
      'low_accuracy',
      input.roadInfo.status,
      input.querySettings.fixedFallbackSpeedKmph,
    );
    await saveGPSSpeedDecisionState(result.nextState);
    return result.decision;
  }

  if (input.roadInfo.status.startsWith('Overpass failed')) {
    const result = buildHoldOrFallbackDecision(
      nextBaseState,
      'backend_failure',
      input.roadInfo.status,
      input.querySettings.fixedFallbackSpeedKmph,
    );
    await saveGPSSpeedDecisionState(result.nextState);
    return result.decision;
  }

  if (input.roadInfo.status === 'No nearby highway found') {
    const result = buildHoldOrFallbackDecision(
      nextBaseState,
      'no_road_match',
      'No OSM road match found for this sample.',
      input.querySettings.fixedFallbackSpeedKmph,
    );
    await saveGPSSpeedDecisionState(result.nextState);
    return result.decision;
  }

  const directSpeedKmph = parseSpeedKmph(input.roadInfo.maxSpeed);
  if (directSpeedKmph === null) {
    const result = buildHoldOrFallbackDecision(
      nextBaseState,
      'maxspeed_missing',
      input.roadInfo.status,
      input.querySettings.fixedFallbackSpeedKmph,
    );
    await saveGPSSpeedDecisionState(result.nextState);
    return result.decision;
  }

  const activeStable = state.activeStableSpeedKmph ?? state.lastGoodSpeedKmph;
  if (activeStable === null) {
    const nextState: GPSSpeedDecisionState = {
      ...nextBaseState,
      activeStableSpeedKmph: directSpeedKmph,
      lastGoodSpeedKmph: directSpeedKmph,
      lastGoodAt: now,
      lastGoodWayId: input.roadInfo.wayId,
      pendingCandidateSpeedKmph: null,
      pendingCandidateWayId: null,
      pendingTrials: 0,
    };
    await saveGPSSpeedDecisionState(nextState);
    return {
      directSpeedKmph,
      resolvedSpeedKmph: directSpeedKmph,
      edgeCase: 'normal',
      approach: 'fresh_osm_initial',
      detail: 'Accepted first valid OSM speed limit.',
      decidedAt: now,
    };
  }

  if (directSpeedKmph === activeStable) {
    const nextState: GPSSpeedDecisionState = {
      ...nextBaseState,
      activeStableSpeedKmph: directSpeedKmph,
      lastGoodSpeedKmph: directSpeedKmph,
      lastGoodAt: now,
      lastGoodWayId: input.roadInfo.wayId,
      pendingCandidateSpeedKmph: null,
      pendingCandidateWayId: null,
      pendingTrials: 0,
    };
    await saveGPSSpeedDecisionState(nextState);
    return {
      directSpeedKmph,
      resolvedSpeedKmph: directSpeedKmph,
      edgeCase: 'normal',
      approach: 'fresh_osm',
      detail: 'Raw speed matches active smart speed.',
      decidedAt: now,
    };
  }

  const samePendingCandidate =
    state.pendingCandidateSpeedKmph === directSpeedKmph &&
    state.pendingCandidateWayId === input.roadInfo.wayId;
  const pendingTrials = samePendingCandidate ? state.pendingTrials + 1 : 1;

  if (pendingTrials >= CHANGE_CONFIRMATION_TRIALS) {
    const nextState: GPSSpeedDecisionState = {
      ...nextBaseState,
      activeStableSpeedKmph: directSpeedKmph,
      lastGoodSpeedKmph: directSpeedKmph,
      lastGoodAt: now,
      lastGoodWayId: input.roadInfo.wayId,
      pendingCandidateSpeedKmph: null,
      pendingCandidateWayId: null,
      pendingTrials: 0,
    };
    await saveGPSSpeedDecisionState(nextState);
    return {
      directSpeedKmph,
      resolvedSpeedKmph: directSpeedKmph,
      edgeCase: 'confirmed_change',
      approach: 'confirmed_osm_change',
      detail: `Changed speed after ${CHANGE_CONFIRMATION_TRIALS} consistent trials.`,
      decidedAt: now,
    };
  }

  const nextState: GPSSpeedDecisionState = {
    ...nextBaseState,
    activeStableSpeedKmph: activeStable,
    pendingCandidateSpeedKmph: directSpeedKmph,
    pendingCandidateWayId: input.roadInfo.wayId,
    pendingTrials,
  };
  await saveGPSSpeedDecisionState(nextState);
  return {
    directSpeedKmph,
    resolvedSpeedKmph: activeStable,
    edgeCase: 'speed_limit_flap_guard',
    approach: 'hold_last_good',
    detail: `Candidate speed ${directSpeedKmph} km/h differs from active ${activeStable} km/h. Trial ${pendingTrials}/${CHANGE_CONFIRMATION_TRIALS}.`,
    decidedAt: now,
  };
}

