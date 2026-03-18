import { MAX_CACHE_ITEMS, clearCachedGPSData, getCachedGPSData } from '../storage/gpsCache';
import { addArchivedGPSReport } from '../storage/gpsReports';
import { generateGPSPdfReportWithOptions } from './gpsPdfReport';

let isAutoArchiveRunning = false;

export async function maybeAutoArchiveGPSCache(pointCountHint?: number): Promise<void> {
  if (isAutoArchiveRunning) {
    return;
  }

  const currentCount = pointCountHint ?? (await getCachedGPSData()).length;
  if (currentCount < MAX_CACHE_ITEMS) {
    return;
  }

  isAutoArchiveRunning = true;
  try {
    const points = await getCachedGPSData();
    if (points.length < MAX_CACHE_ITEMS) {
      return;
    }

    const filePath = await generateGPSPdfReportWithOptions(points, {});
    await addArchivedGPSReport({
      filePath,
      createdAt: Date.now(),
      pointCount: points.length,
      reportType: 'gps',
    });
    // Clear only after both PDF generation and report indexing succeed.
    await clearCachedGPSData();
  } finally {
    isAutoArchiveRunning = false;
  }
}
