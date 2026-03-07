export type GPSDataPoint = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  timestamp: number;
  roadInfo?: GPSRoadInfo | null;
};

export type GPSRoadInfo = {
  maxSpeed: string;
  tags: Record<string, string>;
  wayId: number | null;
};

export type GPSQuerySettings = {
  overpassAroundMeters: number;
  minAccuracyMeters: number;
  distanceFilterMeters: number;
  maxAgeMs: number;
};
