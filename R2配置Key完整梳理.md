# R2 配置 Key 完整梳理文档

## 📋 执行摘要

本文档系统梳理了 Spec Companion 项目中所有 R2 配置（包括 API keys）的存储、读取和使用位置。

---

## 🔑 R2SyncConfig 数据结构

```typescript
interface R2SyncConfig {
  accountId: string;        // Cloudflare Account ID
  bucketName: string;       // R2 Bucket 名称
  accessKeyId: string;      // R2 Access Key ID
  secretAccessKey: string;  // R2 Secret Access Key
  publicDomain?: string;    // 可选：自定义域名
  autoSync?: boolean;       // 可选：自动同步开关
}
```

---

## 📦 存储位置

### 1. IndexedDB（主要存储）

**存储位置：** IndexedDB `SpecCompanionDB` → `r2_config` store

**存储函数：** `src/lib/db.ts`
```typescript
export async function saveR2SyncConfig(config: R2SyncConfig): Promise<void>
```

**读取函数：** `src/lib/db.ts`
```typescript
export async function getR2SyncConfig(): Promise<R2SyncConfig | null>
```

**存储格式：**
```json
{
  "id": "default_r2",
  "config": {
    "accountId": "xxx",
    "bucketName": "spec",
    "accessKeyId": "xxx",
    "secretAccessKey": "xxx",
    "autoSync": true
  }
}
```

**特点：**
- ✅ 持久化存储
- ✅ 用户配置，私密安全
- ✅ 跨会话保持
- ✅ 可以随时修改

---

### 2. R2TestPanel（硬编码）

**位置：** `src/components/R2TestPanel.tsx` 第 81-87 行

```typescript
const [config] = useState({
  accountId: '1ae1c488589174c90cf5ded822766a56',
  bucketName: 'spec',
  accessKeyId: '104728a9c9734593c4086fb07383858e',
  secretAccessKey: '94d111f5c8cfcd8ff044ad15294dcda30f4c03c4e1ec64b82474312eee10504a',
  endpoint: 'https://1ae1c488589174c90cf5ded822766a56.r2.cloudflarestorage.com',
});
```

**特点：**
- ❌ 硬编码在源代码中
- ⚠️ 暴露在客户端代码
- ⚠️ 所有用户看到相同的 key
- ✅ 仅用于测试页面（`?test=r2`）

**访问方式：**
```
https://spec-companion.pages.dev/?test=r2
```

---

### 3. r2Config.ts（空配置）

**位置：** `src/config/r2Config.ts`

```typescript
export const R2_CONFIG: R2SyncConfig = {
  accountId: '',
  bucketName: '',
  accessKeyId: '',
  secretAccessKey: '',
  publicDomain: '',
  autoSync: false,
};
```

**特点：**
- ❌ 所有值为空
- ⚠️ 似乎未被使用
- 🤔 可能是历史遗留文件

---

## 🔄 使用流程

### 用户配置流程

```
1. 用户打开 R2ConfigModal
   ↓
2. 输入 accountId, bucketName, accessKeyId, secretAccessKey
   ↓
3. 点击保存 → saveR2SyncConfig()
   ↓
4. 保存到 IndexedDB (r2_config store)
   ↓
5. 后续所有操作从 IndexedDB 读取配置
```

---

## 📍 读取位置清单

### 主应用（App.tsx）

**使用次数：** 12 处

| 行号 | 场景 | 用途 |
|------|------|------|
| 187 | 初始化检查 | 检查 R2 是否已配置 |
| 685 | 章节分析 | 上传分析结果到 R2 |
| 761 | 文档下载 | 从 R2 下载文档 |
| 902 | 文档同步 | 同步文档到 R2 |
| 1292 | 文档上传 | 上传新文档到 R2 |
| 1463 | 文档上传 | 上传新文档到 R2 |
| 1788 | 文档上传 | 上传新文档到 R2 |
| 1846 | R2同步检查 | 检查 R2 配置状态 |
| 2232 | 文档删除 | 从 R2 删除文档 |

**代码模式：**
```typescript
const r2Config = await getR2SyncConfig();
if (r2Config && r2Config.accountId && r2Config.accessKeyId && r2Config.secretAccessKey) {
  // 使用 r2Config 调用 R2 API
}
```

---

### R2ConfigModal

**文件：** `src/components/R2ConfigModal.tsx`

**功能：**
- 加载现有配置：`getR2SyncConfig()`
- 保存用户配置：`saveR2SyncConfig(config)`
- 显示配置表单

**代码：**
```typescript
useEffect(() => {
  const loadConfig = async () => {
    const saved = await getR2SyncConfig();
    if (saved) {
      setConfig(saved);
    }
  };
  loadConfig();
}, [isOpen]);
```

---

### R2SyncModal

**文件：** `src/components/R2SyncModal.tsx`

**接收方式：** 通过 props

```typescript
interface R2SyncModalProps {
  r2Config: R2SyncConfig;  // 从父组件传入
  // ...
}
```

**调用链：**
```
App.tsx (getR2SyncConfig)
  ↓
传递给 R2SyncModal
  ↓
使用 r2Config 调用 listDocumentsFromR2, downloadDocumentFromR2
```

---

### 数据库自动同步

**文件：** `src/lib/db.ts`

**触发位置：**
- `saveCachedAnalysis()` - 保存页面分析后
- `saveCachedChapterAnalysis()` - 保存章节分析后

**代码：**
```typescript
// 保存后自动同步
const r2Config = await getR2SyncConfig();
if (r2Config && r2Config.autoSync && r2Config.accountId && r2Config.accessKeyId) {
  const { uploadAnalysisToR2 } = await import('./r2AnalysisService');
  uploadAnalysisToR2(analysis, r2Config, 'page', category).catch(err => {
    console.warn('R2 auto-sync failed:', err);
  });
}
```

---

### R2 服务函数

**文件：** `src/lib/r2Service.ts`

**所有函数都接收 `config: R2SyncConfig` 参数：**

```typescript
uploadDocumentToR2(docId, pdfBuffer, config, category)
uploadJsonToR2(r2Path, jsonData, config)
listDocumentsFromR2(config)
downloadJsonFromR2(r2Path, config)
downloadDocumentFromR2(r2Path, config)
deleteDocumentFromR2(r2Path, config)
uploadAllMetadataToR2(documents, config)
downloadAllMetadataFromR2(config)
```

---

### R2 分析服务

**文件：** `src/lib/r2AnalysisService.ts`

```typescript
uploadAnalysisToR2(analysis, config, type, category)
downloadAnalysisFromR2(fileName, config)
listAnalysisInR2(docId, config)
syncAnalysisFromR2ToLocal(docId, config, onProgress)
```

---

## 🔒 安全性分析

### ✅ 主应用配置（IndexedDB）

**优点：**
- ✅ 存储在本地 IndexedDB
- ✅ 每个用户独立配置
- ✅ 不会暴露在代码中
- ✅ 不会发送到服务器（除了 Functions 调用）

**缺点：**
- ⚠️ 浏览器可以直接查看 IndexedDB
- ⚠️ 如果有 XSS 漏洞可能被窃取

---

### ❌ R2TestPanel 配置（硬编码）

**严重问题：**
- ❌ **硬编码在源代码中**
- ❌ **所有人都能看到**
- ❌ **可以直接访问你的 R2 bucket**
- ❌ **构建后的代码中明文可见**

**风险等级：** 🔴 高风险

**建议：**
1. **立即轮换这些 API keys**
2. 改为从 IndexedDB 读取（共享主应用配置）
3. 或者完全移除 R2TestPanel（仅在开发环境使用）

---

## 🚨 安全建议

### 立即行动

1. **轮换 R2TestPanel 中的 API keys**
   ```bash
   # 在 Cloudflare Dashboard 中：
   # 1. 删除旧的 Access Key
   # 2. 创建新的 Access Key
   # 3. 更新 IndexedDB 中的配置
   ```

2. **修复 R2TestPanel**
   
   **选项 A：从 IndexedDB 读取**
   ```typescript
   const [config, setConfig] = useState<R2SyncConfig | null>(null);
   
   useEffect(() => {
     getR2SyncConfig().then(setConfig);
   }, []);
   ```

   **选项 B：移除 R2TestPanel**
   - 删除文件
   - 移除路由

   **选项 C：仅在开发环境启用**
   ```typescript
   if (import.meta.env.DEV) {
     // R2TestPanel 仅在开发时可用
   }
   ```

---

### 长期改进

1. **环境变量管理**
   - 开发环境使用测试 bucket
   - 生产环境使用正式 bucket

2. **最小权限原则**
   - 创建只读 API key（用于下载）
   - 创建写入 API key（用于上传）
   - 按需使用不同权限

3. **密钥轮换策略**
   - 定期（如每月）轮换 API keys
   - 记录密钥使用日志

---

## 📊 配置使用统计

| 位置 | 使用次数 | 存储方式 | 安全性 |
|------|---------|---------|--------|
| App.tsx | 12处 | IndexedDB | ✅ 安全 |
| R2ConfigModal | 2处 | IndexedDB | ✅ 安全 |
| R2SyncModal | 1处 | Props传入 | ✅ 安全 |
| db.ts (auto-sync) | 2处 | IndexedDB | ✅ 安全 |
| R2TestPanel | 1处 | **硬编码** | ❌ 不安全 |
| r2Config.ts | 0处 | 空配置 | ⚠️ 未使用 |

---

## 🔍 配置验证

### 有效配置检查

**最小要求：**
```typescript
config.accountId && 
config.bucketName && 
config.accessKeyId && 
config.secretAccessKey
```

**完整配置：**
```typescript
{
  accountId: 'xxx',           // 必需：32字符十六进制
  bucketName: 'spec',         // 必需：bucket名称
  accessKeyId: 'xxx',         // 必需：32字符十六进制
  secretAccessKey: 'xxx',     // 必需：64字符十六进制
  publicDomain: '',           // 可选：自定义域名
  autoSync: true             // 可选：自动同步开关
}
```

---

## 🛠️ 修复 R2TestPanel 的代码

### 方案：从 IndexedDB 读取

```typescript
// src/components/R2TestPanel.tsx

export const R2TestPanel: React.FC = () => {
  const [logs, setLogs] = useState<R2TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  
  // ❌ 删除硬编码
  // const [config] = useState({ ... });
  
  // ✅ 从 IndexedDB 读取
  const [config, setConfig] = useState<R2SyncConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      const saved = await getR2SyncConfig();
      setConfig(saved);
      setConfigLoading(false);
    };
    loadConfig();
  }, []);

  // 添加加载状态
  if (configLoading) {
    return <div>Loading R2 configuration...</div>;
  }

  if (!config) {
    return (
      <div>
        <p>R2 未配置</p>
        <p>请先在主应用中配置 R2 设置</p>
      </div>
    );
  }

  // 其余代码保持不变
  // ...
}
```

---

## 📝 总结

### 配置来源
1. **IndexedDB** - 主要来源，用户配置 ✅
2. **硬编码** - R2TestPanel（需要修复）❌
3. **空配置** - r2Config.ts（未使用）⚠️

### 关键发现
- ✅ 主应用使用 IndexedDB 存储，安全性较好
- ❌ R2TestPanel 硬编码暴露密钥，**高风险**
- ⚠️ r2Config.ts 未被使用，可以删除

### 立即行动项
1. 🔴 **高优先级**：轮换 R2TestPanel 中的 API keys
2. 🟡 **中优先级**：修复 R2TestPanel 从 IndexedDB 读取
3. 🟢 **低优先级**：删除未使用的 r2Config.ts

---

**文档创建时间：** 2026年9月27日

**需要立即处理：** R2TestPanel 安全问题
