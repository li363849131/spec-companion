// @ts-nocheck
// Cloudflare Pages Function for listing documents from R2

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  console.log('[Functions] list-documents 被调用');

  try {
    const body = await request.json();
    console.log('[Functions] 请求体:', JSON.stringify(body).substring(0, 200));
    const { config } = body as any;

    if (!config) {
      console.error('[Functions] 错误: Missing R2 config');
      return Response.json({ success: false, error: 'Missing R2 config' }, { status: 400 });
    }

    if (!config.accountId || !config.bucketName || !config.accessKeyId || !config.secretAccessKey) {
      console.error('[Functions] 错误: Incomplete R2 config', {
        hasAccountId: !!config.accountId,
        hasBucketName: !!config.bucketName,
        hasAccessKeyId: !!config.accessKeyId,
        hasSecretAccessKey: !!config.secretAccessKey
      });
      return Response.json({ success: false, error: 'Incomplete R2 config' }, { status: 400 });
    }

    console.log('[Functions] 配置完整，准备列出文档');
    console.log('[Functions] Bucket:', config.bucketName);
    console.log('[Functions] Account ID:', config.accountId.substring(0, 8) + '...');

    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${config.bucketName}?list-type=2&prefix=documents/`;

    // AWS v4 signature for R2
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const region = 'auto';
    const service = 's3';

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const canonicalUri = `/${config.bucketName}/`;
    const canonicalQuerystring = 'list-type=2&prefix=documents/';
    const canonicalHeaders = `host:${new URL(url).host}
x-amz-content-sha256:UNSIGNED-PAYLOAD
x-amz-date:${amzDate}
`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `GET
${canonicalUri}
${canonicalQuerystring}
${canonicalHeaders}
${signedHeaders}
UNSIGNED-PAYLOAD`;

    const canonicalRequestHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)))
    ).map(b => b.toString(16).padStart(2, '0')).join('');

    const stringToSign = `AWS4-HMAC-SHA256
${amzDate}
${credentialScope}
${canonicalRequestHash}`;

    async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
      const keyBuffer = key instanceof Uint8Array ? key.buffer : key;
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
    }

    let kDate = await hmac(new TextEncoder().encode(`AWS4${config.secretAccessKey}`), dateStamp);
    let kRegion = await hmac(kDate, region);
    let kService = await hmac(kRegion, service);
    let kSigning = await hmac(kService, 'aws4_request');
    const signature = Array.from(new Uint8Array(await hmac(kSigning, stringToSign)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authorizationHeader,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      },
    });

    if (!response.ok) {
      return Response.json({ success: false, error: `R2 error: ${response.statusText}` }, { status: response.status });
    }

    const xmlText = await response.text();

    // Parse XML response to extract document list
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const contents = xmlDoc.getElementsByTagName('Contents');

    const documents = [];
    for (let i = 0; i < contents.length; i++) {
      const key = contents[i].getElementsByTagName('Key')[0]?.textContent;
      const lastModified = contents[i].getElementsByTagName('LastModified')[0]?.textContent;
      const size = contents[i].getElementsByTagName('Size')[0]?.textContent;

      if (key && key.startsWith('documents/') && key.endsWith('.pdf')) {
        const docId = key.replace('documents/', '').replace('.pdf', '');
        documents.push({
          docId,
          key,
          lastModified,
          size: parseInt(size || '0'),
        });
      }
    }

    return Response.json({ success: true, documents }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    console.error('List documents error:', err);
    return Response.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
