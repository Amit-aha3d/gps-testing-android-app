import {
  AUTO_TIMELINE_ARCHIVE_ITEMS,
  clearGPSAPITimeline,
  getGPSAPITimeline,
} from '../storage/gpsApiTimeline';
import { addArchivedGPSReport } from '../storage/gpsReports';
import { generateTimelinePdfReport } from './gpsTimelinePdfReport';

let isTimelineAutoArchiveRunning = false;

export async function maybeAutoArchiveTimeline(pointCountHint?: number): Promise<void> {
  if (isTimelineAutoArchiveRunning) {
    return;
  }

  const currentCount = pointCountHint ?? (await getGPSAPITimeline()).length;
  if (currentCount < AUTO_TIMELINE_ARCHIVE_ITEMS) {
    return;
  }

  isTimelineAutoArchiveRunning = true;
  try {
    const rows = await getGPSAPITimeline();
    if (rows.length < AUTO_TIMELINE_ARCHIVE_ITEMS) {
      return;
    }

    const filePath = await generateTimelinePdfReport(rows);
    await addArchivedGPSReport({
      filePath,
      createdAt: Date.now(),
      pointCount: rows.length,
      reportType: 'timeline',
    });
    await clearGPSAPITimeline();
  } finally {
    isTimelineAutoArchiveRunning = false;
  }
}
