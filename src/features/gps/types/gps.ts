export type GPSDataPoint = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  timestamp: number;
  roadInfo?: GPSRoadInfo | null;
  querySettings?: GPSQuerySettings | null;
  speedDecision?: GPSSpeedDecision | null;
};

export type GPSRoadInfo = {
  maxSpeed: string;
  tags: Record<string, string>;
  wayId: number | null;
  status: string;
};

export type GPSQuerySettings = {
  overpassAroundMeters: number;
  minAccuracyMeters: number;
  distanceFilterMeters: number;
  maxAgeMs: number;
  fixedFallbackSpeedKmph: number;
};

export type GPSSpeedDecision = {
  directSpeedKmph: number | null;
  resolvedSpeedKmph: number;
  edgeCase: string;
  approach: string;
  detail: string;
  decidedAt: number;
};
