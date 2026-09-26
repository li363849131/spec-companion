import { R2SyncConfig } from '../types';

/**
 * Cloudflare R2 配置
 *
 * ⚠️ 此文件仅作为示例，实际配置应通过应用界面设置并保存到 IndexedDB
 *
 * 如果需要硬编码配置（不推荐），请：
 * 1. 复制此文件为 r2Config.local.ts
 * 2. 在 r2Config.local.ts 中填入真实配置
 * 3. r2Config.local.ts 已在 .gitignore 中，不会被提交
 */
export const R2_CONFIG: R2SyncConfig = {
  accountId: '',
  bucketName: '',
  accessKeyId: '',
  secretAccessKey: '',
  publicDomain: '',
  autoSync: false,
};

