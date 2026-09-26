import { R2SyncConfig } from '../types';

// R2 Service for Cloudflare R2 operations using S3 API with AWS Signature V4

interface R2UploadResult {
  success: boolean;
  r2Path?: string;
  error?: string;
}

interface R2DownloadResult {
  success: boolean;
  data?: ArrayBuffer;
  error?: string;
}

// AWS Signature V4 signing helpers
async function sha256(message: string): Promise<ArrayBuffer> {
  const msgBuffer = new TextEncoder().encode(message);
  return await crypto.subtle.digest('SHA-256', msgBuffer);
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

async function generateSignatureV4(
  method: string,
  url: string,
  headers: Record<string, string>,
  payload: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string = 'auto'
): Promise<string> {
  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const path = urlObj.pathname;
  const service = 's3';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // Step 1: Create canonical request
  const payloadHash = hex(await sha256(payload));
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  // Step 2: Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = hex(await sha256(canonicalRequest));
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  // Step 3: Calculate signature
  let kDate = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  let kRegion = await hmac(kDate, region);
  let kService = await hmac(kRegion, service);
  let kSigning = await hmac(kService, 'aws4_request');
  const signingKey = await crypto.subtle.importKey('raw', kSigning.buffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = hex(await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(stringToSign)));

  // Step 4: Build authorization header
  return `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/**
 * Upload a PDF document to Cloudflare R2 via server proxy
 */
export async function uploadDocumentToR2(
  docId: string,
  pdfBuffer: ArrayBuffer,
  config: R2SyncConfig,
  category: string = 'uncategorized'
): Promise<R2UploadResult> {
  try {
    // Convert ArrayBuffer to base64
    const uint8Array = new Uint8Array(pdfBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const pdfBase64 = btoa(binary);

    // Upload via server proxy to bypass CORS
    const response = await fetch('/api/r2/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, pdfBase64, config, category }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    return {
      success: true,
      r2Path: result.r2Path,
    };
  } catch (err: any) {
    console.error('Failed to upload to R2:', err);
    return {
      success: false,
      error: err.message || 'Upload failed',
    };
  }
}

/**
 * Upload JSON metadata to Cloudflare R2
 */
export async function uploadJsonToR2(
  r2Path: string,
  jsonData: any,
  config: R2SyncConfig
): Promise<{ success: boolean; r2Path?: string; error?: string }> {
  try {
    const jsonString = JSON.stringify(jsonData);
    const jsonBase64 = btoa(unescape(encodeURIComponent(jsonString)));

    const response = await fetch('/api/r2/upload-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: r2Path,
        jsonBase64,
        config,
      }),
    });

    const result = await response.json();
    return result;
  } catch (err: any) {
    console.error('Failed to upload JSON to R2:', err);
    return { success: false, error: err.message };
  }
}

/**
 * List all PDF documents from R2
 */
export async function listDocumentsFromR2(
  config: R2SyncConfig
): Promise<{ success: boolean; documents?: any[]; error?: string; notFound?: boolean }> {
  try {
    console.log('[R2] listDocumentsFromR2 开始');
    console.log('[R2] 请求 URL:', '/api/r2/list-documents');
    console.log('[R2] 配置信息:', {
      accountId: config.accountId?.substring(0, 8) + '...',
      bucketName: config.bucketName,
      hasAccessKey: !!config.accessKeyId,
      hasSecretKey: !!config.secretAccessKey
    });

    const response = await fetch('/api/r2/list-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });

    console.log('[R2] 响应状态:', response.status, response.statusText);
    console.log('[R2] 响应 headers:', Object.fromEntries(response.headers.entries()));

    // 如果 API 端点不存在 (404)
    if (response.status === 404) {
      console.warn('[R2] List documents API not available (404)');
      return { success: false, notFound: true };
    }

    // 如果 R2 配置错误或权限问题 (403)
    if (response.status === 403) {
      console.error('[R2] R2 access forbidden (403) - check your R2 configuration');
      const errorText = await response.text().catch(() => '');
      console.error('[R2] 403 响应内容:', errorText);
      return { success: false, error: 'R2 访问被拒绝，请检查您的配置（Account ID, Access Key, Secret Key）' };
    }

    // 如果返回其他错误状态
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[R2] HTTP 错误:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    console.log('[R2] 响应成功，文档数量:', result.documents?.length || 0);
    return result;
  } catch (err: any) {
    console.error('[R2] listDocumentsFromR2 异常:', err);
    console.error('[R2] 错误栈:', err.stack);
    return { success: false, error: err.message };
  }
}

/**
 * Download JSON metadata from Cloudflare R2
 */
export async function downloadJsonFromR2(
  r2Path: string,
  config: R2SyncConfig
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // Use server proxy to download
    const response = await fetch('/api/r2/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ r2Path, config }),
    });

    const result = await response.json();

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Decode base64 to string (handle UTF-8 properly)
    const binaryString = atob(result.base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decoder = new TextDecoder('utf-8');
    const jsonString = decoder.decode(bytes);
    const jsonData = JSON.parse(jsonString);

    return {
      success: true,
      data: jsonData,
    };
  } catch (err: any) {
    console.error('Failed to download JSON from R2:', err);
    return {
      success: false,
      error: err.message || 'Download failed',
    };
  }
}

/**
 * Download a PDF document from Cloudflare R2
 */
export async function downloadDocumentFromR2(
  r2Path: string,
  config: R2SyncConfig
): Promise<R2DownloadResult> {
  try {
    // Use server proxy to download
    const response = await fetch('/api/r2/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ r2Path, config }),
    });

    const result = await response.json();

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Decode base64 to ArrayBuffer
    const binaryString = atob(result.base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return {
      success: true,
      data: bytes.buffer,
    };
  } catch (err: any) {
    console.error('Failed to download from R2:', err);
    return {
      success: false,
      error: err.message || 'Download failed',
    };
  }
}

/**
 * Delete a PDF document from Cloudflare R2
 */
export async function deleteDocumentFromR2(
  r2Path: string,
  config: R2SyncConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${config.bucketName}/${r2Path}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');

    const headers: Record<string, string> = {
      'Host': new URL(url).hostname,
      'x-amz-content-sha256': hex(await sha256('')),
      'x-amz-date': amzDate,
    };

    const authorization = await generateSignatureV4(
      'DELETE',
      url,
      headers,
      '',
      config.accessKeyId,
      config.secretAccessKey
    );

    headers['Authorization'] = authorization;

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Delete failed: ${response.statusText}`);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Failed to delete from R2:', err);
    return {
      success: false,
      error: err.message || 'Delete failed',
    };
  }
}

/**
 * Check if R2 is configured
 */
export function isR2Configured(config: R2SyncConfig | null): boolean {
  if (!config) return false;
  return !!(
    config.accountId &&
    config.bucketName &&
    config.accessKeyId &&
    config.secretAccessKey
  );
}

/**
 * Sync a document: upload to R2 and save r2Path
 */
export async function syncDocumentToR2(
  docId: string,
  pdfBuffer: ArrayBuffer,
  config: R2SyncConfig,
  category: string = 'uncategorized'
): Promise<R2UploadResult> {
  if (!isR2Configured(config)) {
    return {
      success: false,
      error: 'R2 not configured',
    };
  }

  return uploadDocumentToR2(docId, pdfBuffer, config, category);
}

/**
 * Fetch document from R2 if not available locally
 */
export async function fetchDocumentFromR2IfNeeded(
  r2Path: string,
  config: R2SyncConfig
): Promise<ArrayBuffer | null> {
  if (!isR2Configured(config)) {
    return null;
  }

  const result = await downloadDocumentFromR2(r2Path, config);
  return result.success ? result.data || null : null;
}

/**
 * Upload all documents metadata as a single JSON file to R2
 */
export async function uploadAllMetadataToR2(
  documents: any[],
  config: R2SyncConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const metadataBundle = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      totalDocuments: documents.length,
      documents: documents.map(doc => ({
        id: doc.id,
        name: doc.name,
        fullName: doc.fullName,
        category: doc.category,
        totalPages: doc.totalPages,
        fileSize: doc.fileSize,
        createdAt: doc.createdAt,
        lastReadPage: doc.lastReadPage,
        outline: doc.outline,
        chapters: doc.chapters,
        fileHash: doc.fileHash,
        parentCollectionId: doc.parentCollectionId,
        isCollection: doc.isCollection,
        childDocIds: doc.childDocIds,
        version: doc.version,
      })),
    };

    const response = await fetch('/api/r2/upload-metadata-bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: metadataBundle, config }),
    });

    const result = await response.json();
    return result;
  } catch (err: any) {
    console.error('Failed to upload metadata bundle to R2:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Download all documents metadata as a single JSON file from R2
 */
export async function downloadAllMetadataFromR2(
  config: R2SyncConfig
): Promise<{ success: boolean; data?: any; error?: string; notFound?: boolean }> {
  try {
    console.log('[R2] downloadAllMetadataFromR2 开始');
    console.log('[R2] 请求 URL:', '/api/r2/download-metadata-bundle');
    console.log('[R2] 配置信息:', {
      accountId: config.accountId?.substring(0, 8) + '...',
      bucketName: config.bucketName,
      hasAccessKey: !!config.accessKeyId,
      hasSecretKey: !!config.secretAccessKey
    });

    const response = await fetch('/api/r2/download-metadata-bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });

    console.log('[R2] 响应状态:', response.status, response.statusText);
    console.log('[R2] 响应 headers:', Object.fromEntries(response.headers.entries()));

    // 如果 API 端点不存在 (404)，返回 notFound 标志
    if (response.status === 404) {
      console.warn('[R2] Metadata bundle API not available (404), will use fallback method');
      return { success: false, notFound: true };
    }

    // 如果返回其他错误状态
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[R2] HTTP 错误:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    console.log('[R2] 响应成功:', result.success);
    return result;
  } catch (err: any) {
    console.error('[R2] downloadAllMetadataFromR2 异常:', err);
    console.error('[R2] 错误栈:', err.stack);
    return { success: false, error: err.message };
  }
}
