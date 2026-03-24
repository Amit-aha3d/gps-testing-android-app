import type { GPSAPITimelineEntry } from '../storage/gpsApiTimeline';

type PDFGeneratorResult = {
  filePath?: string;
};

type PDFGeneratorLike = {
  generatePDF: (options: {
    html: string;
    fileName: string;
    directory?: string;
  }) => Promise<PDFGeneratorResult>;
};

function getPDFGenerator(): PDFGeneratorLike | null {
  try {
    const moduleRef = require('react-native-html-to-pdf');
    return (moduleRef.default ?? moduleRef) as PDFGeneratorLike;
  } catch {
    return null;
  }
}

function esc(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(value: number | null) {
  if (value === null) {
    return 'N/A';
  }
  return new Date(value).toLocaleString();
}

function buildHTML(rows: GPSAPITimelineEntry[]) {
  const generatedAt = new Date().toLocaleString();

  const tableRows = rows
    .map((item, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(item.gpsData)}</td>
          <td>${esc(formatDateTime(item.gpsDataTime))}</td>
          <td>${esc(item.querySettings ?? 'not available')}</td>
          <td>${esc(formatDateTime(item.apiCalledTime))}</td>
          <td>${esc(formatDateTime(item.apiResponseTime))}</td>
          <td>${esc(
            item.directSpeedKmph === null ? 'N/A' : `${item.directSpeedKmph} km/h`,
          )}</td>
          <td>${esc(`${item.resolvedSpeedKmph} km/h`)}</td>
          <td>${esc(item.edgeCase)}</td>
          <td>${esc(item.approach)}</td>
          <td>${esc(item.decisionDetail)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
          h1 { margin: 0 0 6px 0; font-size: 24px; }
          p { margin: 0 0 14px 0; color: #475569; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; word-break: break-word; }
          th { background: #f1f5f9; }
          tr:nth-child(even) { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>GPS API Timeline Report</h1>
        <p>Generated at: ${esc(generatedAt)}</p>
        <p>Total rows: ${rows.length}</p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>GPS Data</th>
              <th>GPS Data Time</th>
              <th>Query Settings</th>
              <th>API Called Time</th>
              <th>API Response Time</th>
              <th>Direct Speed</th>
              <th>Smart Speed</th>
              <th>Edge Case</th>
              <th>Approach</th>
              <th>Decision Detail</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

export async function generateTimelinePdfReport(rows: GPSAPITimelineEntry[]) {
  const pdf = getPDFGenerator();
  if (!pdf) {
    throw new Error('PDF module missing. Run: npm i react-native-html-to-pdf');
  }

  const result = await pdf.generatePDF({
    html: buildHTML(rows),
    fileName: `gps-api-timeline-${Date.now()}`,
  });

  if (!result.filePath) {
    throw new Error('Timeline PDF generation failed. No file path returned.');
  }

  return result.filePath;
}
