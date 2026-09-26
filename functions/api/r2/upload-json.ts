// @ts-nocheck
// Cloudflare Pages Function for uploading JSON files to R2

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const { fileName, data, config } = await request.json() as any;

    if (!fileName || !data || !config) {
      return Response.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
    }

    const jsonContent = JSON.stringify(data);
    const bytes = new TextEncoder().encode(jsonContent);

    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${config.bucketName}/${fileName}`;

    // Calculate SHA256 of content
    const payloadHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const region = 'auto';
    const service = 's3';

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const canonicalUri = `/${config.bucketName}/${fileName}`;
    const canonicalQuerystring = '';
    const canonicalHeaders = `content-type:application/json
host:${new URL(url).host}
x-amz-content-sha256:${payloadHash}
x-amz-date:${amzDate}
`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `PUT
${canonicalUri}
${canonicalQuerystring}
${canonicalHeaders}
${signedHeaders}
${payloadHash}`;

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
      method: 'PUT',
      headers: {
        'Authorization': authorizationHeader,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Content-Type': 'application/json',
      },
      body: bytes,
    });

    if (!response.ok) {
      return Response.json({ success: false, error: `R2 error: ${response.statusText}` }, { status: response.status });
    }

    return Response.json({ success: true }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    console.error('Upload JSON error:', err);
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
