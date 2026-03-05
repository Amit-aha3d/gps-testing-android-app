import type { GPSDataPoint } from '../types/gps';

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
  } catch (_error) {
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

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString();
}

function buildHTML(points: GPSDataPoint[]) {
  const generatedAt = new Date().toLocaleString();

  const rows = points
    .map((item, index) => {
      const altitude =
        item.altitude === null ? 'N/A' : `${item.altitude.toFixed(2)} m`;
      const accuracy =
        item.accuracy === null ? 'N/A' : `${item.accuracy.toFixed(2)} m`;

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(formatDateTime(item.timestamp))}</td>
          <td>${item.latitude.toFixed(6)}</td>
          <td>${item.longitude.toFixed(6)}</td>
          <td>${esc(altitude)}</td>
          <td>${esc(accuracy)}</td>
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
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
          th { background: #f1f5f9; }
          tr:nth-child(even) { background: #f8fafc; }
        </style>
      </head>
      <body>
        <h1>GPS Data Report</h1>
        <p>Generated at: ${esc(generatedAt)}</p>
        <p>Total records: ${points.length}</p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Date & Time</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Altitude</th>
              <th>Accuracy</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

export async function generateGPSPdfReport(points: GPSDataPoint[]) {
  const pdf = getPDFGenerator();
  if (!pdf) {
    throw new Error('PDF module missing. Run: npm i react-native-html-to-pdf');
  }

  const fileName = `gps-report-${Date.now()}`;
  const html = buildHTML(points);
  const result = await pdf.generatePDF({
    html,
    fileName,
    directory: 'Download',
  });

  if (!result.filePath) {
    throw new Error('PDF generation failed. No file path returned.');
  }

  return result.filePath;
}
