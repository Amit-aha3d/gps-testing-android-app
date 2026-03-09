import { NativeModules, Platform } from 'react-native';

type PdfSaveModule = {
  savePdfWithPicker: (sourcePath: string, suggestedName: string) => Promise<string>;
  openPdfInExternalApp: (filePath: string) => Promise<boolean>;
};

function getPdfSaveModule(): PdfSaveModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }

  const moduleRef = NativeModules.PdfSaveModule as PdfSaveModule | undefined;
  return moduleRef ?? null;
}

export async function savePdfToUserChosenLocation(
  sourcePath: string,
  suggestedName: string,
): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('Save picker is only available on Android.');
  }

  const moduleRef = getPdfSaveModule();
  if (!moduleRef) {
    throw new Error(
      'Android save picker module is not available. Rebuild and reinstall the app.',
    );
  }

  return moduleRef.savePdfWithPicker(sourcePath, suggestedName);
}

export async function openPdfInExternalApp(filePath: string): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('Open PDF action is only available on Android.');
  }

  const moduleRef = getPdfSaveModule();
  if (!moduleRef) {
    throw new Error(
      'Android PDF open module is not available. Rebuild and reinstall the app.',
    );
  }

  await moduleRef.openPdfInExternalApp(filePath);
}
