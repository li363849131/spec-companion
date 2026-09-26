import { CachedAnalysis, ChapterAnalysis, R2SyncConfig } from '../types';

/**
 * Upload analysis result to R2 as JSON
 */
export async function uploadAnalysisToR2(
  analysis: CachedAnalysis | ChapterAnalysis,
  config: R2SyncConfig,
  type: 'page' | 'chapter',
  category: string = 'uncategorized'
): Promise<{ success: boolean; error?: string }> {
  try {
    const fileName = type === 'page'
      ? `analysis/${category}/${analysis.docId}/page_${analysis.pageNum}_${analysis.userId}.json`
      : `analysis/${category}/${analysis.docId}/chapter_${(analysis as ChapterAnalysis).chapterId}_${analysis.userId}.json`;

    const jsonData = JSON.stringify(analysis);
    const base64Data = btoa(unescape(encodeURIComponent(jsonData)));

    const response = await fetch('/api/r2/upload-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, jsonBase64: base64Data, config }),
    });

    const result = await response.json();
    return result.success ? { success: true } : { success: false, error: result.error };
  } catch (err: any) {
    console.error('Failed to upload analysis to R2:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Download analysis result from R2
 */
export async function downloadAnalysisFromR2(
  fileName: string,
  config: R2SyncConfig
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${config.bucketName}/${fileName}`;

    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      return { success: false, error: `Download failed: ${response.status}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * List all analysis files in R2 for a document
 */
export async function listAnalysisInR2(
  docId: string,
  config: R2SyncConfig
): Promise<{ success: boolean; files?: string[]; error?: string }> {
  try {
    const response = await fetch('/api/r2/list-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, config }),
    });

    const result = await response.json();
    return result.success ? { success: true, files: result.files } : { success: false, error: result.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Sync analysis from R2 to local IndexedDB
 */
export async function syncAnalysisFromR2ToLocal(
  docId: string,
  config: R2SyncConfig,
  onProgress?: (current: number, total: number) => void
): Promise<{ success: boolean; synced: number; error?: string }> {
  try {
    const { success, files, error } = await listAnalysisInR2(docId, config);

    if (!success || !files) {
      return { success: false, synced: 0, error: error || 'Failed to list R2 files' };
    }

    let syncedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const fileName = files[i];
      if (onProgress) onProgress(i + 1, files.length);

      const { success: downloadSuccess, data } = await downloadAnalysisFromR2(fileName, config);

      if (downloadSuccess && data) {
        // Save to IndexedDB
        const { saveCachedAnalysis, saveCachedChapterAnalysis } = await import('./db');

        if (fileName.includes('/page_')) {
          await saveCachedAnalysis(data);
        } else if (fileName.includes('/chapter_')) {
          await saveCachedChapterAnalysis(data);
        }

        syncedCount++;
      }
    }

    return { success: true, synced: syncedCount };
  } catch (err: any) {
    return { success: false, synced: 0, error: err.message };
  }
}
