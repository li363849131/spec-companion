// Cloudflare Pages Function for downloading metadata bundle from R2

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const { config } = await request.json() as any;

    if (!config) {
      return Response.json({ success: false, error: 'Missing R2 config' }, { status: 400 });
    }

    if (!config.accountId || !config.bucketName || !config.accessKeyId || !config.secretAccessKey) {
      return Response.json({ success: false, error: 'Incomplete R2 config' }, { status: 400 });
    }

    const fileName = 'metadata-bundle.json';
    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${config.bucketName}/${fileName}`;

    // AWS v4 signature for R2
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const region = 'auto';
    const service = 's3';

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const canonicalUri = `/${config.bucketName}/${fileName}`;
    const canonicalQuerystring = '';
    const canonicalHeaders = `host:${new URL(url).host}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `GET\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;

    const canonicalRequestHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)))
    ).map(b => b.toString(16).padStart(2, '0')).join('');

    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
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
      if (response.status === 404) {
        return Response.json({ success: false, notFound: true }, { status: 404 });
      }
      return Response.json({ success: false, error: `R2 error: ${response.statusText}` }, { status: response.status });
    }

    const data = await response.json();
    return Response.json({ success: true, data }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    console.error('Download metadata bundle error:', err);
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
