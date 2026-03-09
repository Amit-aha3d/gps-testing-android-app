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

const OVERPASS_URL = 'https://overpass.kumi.systems/api/interpreter';
// const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function buildQuery(lat: number, lon: number, aroundMeters: number) {
  return `[out:json][timeout:25];
way(around:${aroundMeters},${lat},${lon})["highway"];
out body tags geom;`;
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

export async function fetchRoadInfoForLocation(
  latitude: number,
  longitude: number,
  aroundMeters: number,
): Promise<{ roadInfo: GPSRoadInfo; rawResponse: unknown }> {
  const query = buildQuery(latitude, longitude, aroundMeters);
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: query,
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed (${response.status})`);
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
        status: 'No nearby highway found',
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
      status: tags.maxspeed ? 'Fetched' : 'MaxSpeed tag missing in response',
    },
    rawResponse: json,
  };
}
