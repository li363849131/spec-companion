/**
 * Calculate SHA-256 hash of a file
 */
export async function calculateFileHash(arrayBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Calculate hash from File object
 */
export async function calculateFileHashFromFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return calculateFileHash(arrayBuffer);
}
