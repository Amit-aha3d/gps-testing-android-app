export type GPSArchivedReport = {
  id: string;
  filePath: string;
  createdAt: number;
  pointCount: number;
  reportType: 'gps' | 'timeline';
};

const GPS_REPORTS_KEY = 'gps_archived_reports_v1';
const MAX_REPORT_ITEMS = 200;

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

function getAsyncStorage(): AsyncStorageLike | null {
  try {
    const moduleRef = require('@react-native-async-storage/async-storage');
    return (moduleRef.default ?? moduleRef) as AsyncStorageLike;
  } catch {
    return null;
  }
}

export async function getArchivedGPSReports(): Promise<GPSArchivedReport[]> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return [];
  }

  const raw = await asyncStorage.getItem(GPS_REPORTS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<Partial<GPSArchivedReport>>;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(item => typeof item.filePath === 'string')
      .map(item => ({
        id: item.id ?? `${item.createdAt}-${Math.random().toString(36).slice(2, 8)}`,
        filePath: item.filePath as string,
        createdAt: item.createdAt ?? Date.now(),
        pointCount: item.pointCount ?? 0,
        reportType: item.reportType === 'timeline' ? 'timeline' : 'gps',
      }));
  } catch {
    return [];
  }
}

export async function addArchivedGPSReport(
  report: Omit<GPSArchivedReport, 'id' | 'reportType'> & {
    reportType?: 'gps' | 'timeline';
  },
): Promise<GPSArchivedReport[]> {
  const asyncStorage = getAsyncStorage();
  if (!asyncStorage) {
    return [];
  }

  const existing = await getArchivedGPSReports();
  const nextItem: GPSArchivedReport = {
    ...report,
    id: `${report.createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    reportType: report.reportType ?? 'gps',
  };
  const next = [nextItem, ...existing].slice(0, MAX_REPORT_ITEMS);
  await asyncStorage.setItem(GPS_REPORTS_KEY, JSON.stringify(next));
  return next;
}
