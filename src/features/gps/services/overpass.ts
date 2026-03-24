import type { GPSRoadInfo } from '../types/gps';

type OverpassWayElement = {
  type: 'way';
  id: number;
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassWayElement[];
};

const OVERPASS_URLS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
] as const;
const OVERPASS_TIMEOUT_MS = 12000;
let nextOverpassUrlIndex = 0;

export type OverpassFailureDetails = {
  category: 'timeout' | 'network' | 'http' | 'parse' | 'unknown';
  reason: string;
};

function buildQuery(lat: number, lon: number, aroundMeters: number) {
  return `[out:json][timeout:25];
way(around:${aroundMeters},${lat},${lon})["highway"];
out body tags geom;`;
}

function getRotatedOverpassUrls() {
  return OVERPASS_URLS.map(
    (_, offset) => OVERPASS_URLS[(nextOverpassUrlIndex + offset) % OVERPASS_URLS.length],
  );
}

function advanceOverpassUrlIndex() {
  nextOverpassUrlIndex = (nextOverpassUrlIndex + 1) % OVERPASS_URLS.length;
}

function sqDistance(aLat: number, aLon: number, bLat: number, bLon: number) {
  const dLat = aLat - bLat;
  const dLon = aLon - bLon;
  return dLat * dLat + dLon * dLon;
}

function pickClosestWay(
  ways: OverpassWayElement[],
  lat: number,
  lon: number,
): OverpassWayElement | null {
  if (ways.length === 0) {
    return null;
  }

  let best: OverpassWayElement | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  ways.forEach(way => {
    const points = way.geometry ?? [];
    if (points.length === 0) {
      return;
    }

    points.forEach(point => {
      const dist = sqDistance(lat, lon, point.lat, point.lon);
      if (dist < bestDist) {
        bestDist = dist;
        best = way;
      }
    });
  });

  return best;
}

async function postOverpassQuery(url: string, query: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, OVERPASS_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: query,
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('aborted')) {
      throw new Error(`Overpass timeout after ${OVERPASS_TIMEOUT_MS} ms at ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchRoadInfoForLocation(
  latitude: number,
  longitude: number,
  aroundMeters: number,
): Promise<{ roadInfo: GPSRoadInfo; rawResponse: unknown }> {
  const query = buildQuery(latitude, longitude, aroundMeters);
  const urlsToTry = getRotatedOverpassUrls();
  let lastError: Error | null = null;
  let response: Response | null = null;
  let responseUrl: string | null = null;

  for (const url of urlsToTry) {
    try {
      const candidateResponse = await postOverpassQuery(url, query);
      if (candidateResponse.status === 429) {
        advanceOverpassUrlIndex();
        lastError = new Error(`Overpass HTTP 429 at ${url}: ${candidateResponse.statusText}`);
        continue;
      }
      if (!candidateResponse.ok) {
        throw new Error(`Overpass HTTP ${candidateResponse.status} at ${url}: ${candidateResponse.statusText}`);
      }

      response = candidateResponse;
      responseUrl = url;
      nextOverpassUrlIndex = OVERPASS_URLS.indexOf(url);
      break;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error));
    }
  }

  if (!response) {
    throw lastError ?? new Error('All Overpass endpoints failed');
  }

  const json = (await response.json()) as OverpassResponse;
  const allWays = (json.elements ?? []).filter(item => item.type === 'way');
  const way = pickClosestWay(allWays, latitude, longitude);

  if (!way) {
    return {
      roadInfo: {
        maxSpeed: 'not fetched',
        tags: {},
        wayId: null,
        status: responseUrl
          ? `No nearby highway found (${responseUrl})`
          : 'No nearby highway found',
      },
      rawResponse: json,
    };
  }

  const tags = way.tags ?? {};
  const maxSpeed = tags.maxspeed ?? 'not fetched';
  return {
    roadInfo: {
      maxSpeed,
      tags,
      wayId: way.id ?? null,
      status: tags.maxspeed
        ? responseUrl
          ? `Fetched (${responseUrl})`
          : 'Fetched'
        : responseUrl
          ? `MaxSpeed tag missing in response (${responseUrl})`
          : 'MaxSpeed tag missing in response',
    },
    rawResponse: json,
  };
}

export function getOverpassFailureDetails(error: unknown): OverpassFailureDetails {
  const reason =
    error instanceof Error ? error.message : 'Unknown error while calling Overpass';
  const lower = reason.toLowerCase();

  if (lower.includes('timeout')) {
    return { category: 'timeout', reason };
  }
  if (lower.includes('network request failed') || lower.includes('failed to fetch')) {
    return { category: 'network', reason };
  }
  if (lower.includes('http')) {
    return { category: 'http', reason };
  }
  if (lower.includes('json') || lower.includes('parse')) {
    return { category: 'parse', reason };
  }

  return { category: 'unknown', reason };
}
