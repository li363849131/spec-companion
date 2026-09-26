import { R2SyncConfig } from '../types';

/**
 * Cloudflare R2 配置
 * 注意：这是硬编码配置，仅用于个人部署
 */
export const R2_CONFIG: R2SyncConfig = {
  accountId: '1ae1c488589174c90cf5ded822766a56',
  bucketName: 'spec',
  accessKeyId: '104728a9c9734593c4086fb07383858e',
  secretAccessKey: '94d111f5c8cfcd8ff044ad15294dcda30f4c03c4e1ec64b82474312eee10504a',
  publicDomain: 'https://1ae1c488589174c90cf5ded822766a56.r2.cloudflarestorage.com',
  autoSync: true,
};
