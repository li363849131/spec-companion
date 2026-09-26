// Cloudflare Pages Function for R2 upload
// Server-side upload to bypass CORS

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  try {
    const { docId, pdfBase64, config } = await request.json() as any;

    if (!docId || !pdfBase64 || !config) {
      return Response.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
    }

    // Decode base64 PDF
    const binaryString = atob(pdfBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const fileName = `documents/${docId}.pdf`;
    const endpoint = config.publicDomain || `https://${config.accountId}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${config.bucketName}/${fileName}`;

    // Calculate SHA256 of PDF
    const payloadHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const path = urlObj.pathname;

    // Build canonical request
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `PUT\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    // String to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
    const canonicalRequestHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest))))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    // Calculate signature (HMAC-SHA256 chain)
    async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
      const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message)));
    }

    let kDate = await hmac(new TextEncoder().encode(`AWS4${config.secretAccessKey}`), dateStamp);
    let kRegion = await hmac(kDate, 'auto');
    let kService = await hmac(kRegion, 's3');
    let kSigning = await hmac(kService, 'aws4_request');
    const signingKey = await crypto.subtle.importKey('raw', kSigning, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(stringToSign))))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Authorization header
    const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // Upload to R2
    const uploadResponse = await fetch(url, {
      method: 'PUT',
      headers: {
        'Host': host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Content-Type': 'application/pdf',
        'Authorization': authorization,
      },
      body: bytes,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      return Response.json({ success: false, error: errorText }, { status: uploadResponse.status });
    }

    return Response.json({ success: true, r2Path: fileName });
  } catch (err: any) {
    console.error('R2 upload proxy error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
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
