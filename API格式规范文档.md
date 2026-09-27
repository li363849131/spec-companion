# Spec Companion - R2 API 格式完整规范

## 📋 执行摘要

本文档定义了前端与 Cloudflare Functions 之间所有 R2 相关 API 的请求和返回格式，确保前后端数据结构完全一致。

---

## 🚨 发现的关键问题

### ❌ 问题 1：DOMParser 不支持
**受影响的文件：**
- `functions/api/r2/list-analysis.ts` 第 84 行
- `functions/api/r2/list-all.ts` 第 84 行

**错误代码：**
```typescript
const parser = new DOMParser();  // ❌ Cloudflare Workers 不支持
const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
```

**影响：** 这些 API 会在运行时崩溃

**解决方案：** 使用正则表达式解析 XML（参考 `list-documents.ts` 的实现）

### ✅ 问题 2：download.ts 返回格式已修复
已从返回 Blob 修改为返回 JSON `{success: true, base64Data: string}`

---

## 📂 API 完整规范

### 1. 上传 PDF 文档

**端点：** `POST /api/r2/upload`

**请求格式：**
```typescript
{
  docId: string,          // 文档ID，如 "custom_1790476166351_xxx"
  pdfBase64: string,      // PDF 的 Base64 编码
  config: R2SyncConfig,   // R2 配置
  category?: string       // 可选，默认 "uncategorized"
}
```

**返回格式（成功）：**
```typescript
{
  success: true,
  r2Path: string          // 如 "documents/custom_xxx.pdf"
}
```

**返回格式（失败）：**
```typescript
{
  success: false,
  error: string
}
```

**实现文件：** `functions/api/r2/upload.ts`

---

### 2. 上传 JSON 文件

**端点：** `POST /api/r2/upload-json`

**请求格式（支持两种）：**

**方式 1：直接传 JSON 对象**
```typescript
{
  fileName: string,       // 完整路径，如 "analysis/custom/xxx/page_1.json"
  data: any,              // JSON 对象
  config: R2SyncConfig
}
```

**方式 2：传 Base64 编码**
```typescript
{
  fileName: string,
  jsonBase64: string,     // Base64 编码的 JSON 字符串
  config: R2SyncConfig
}
```

**返回格式：**
```typescript
{
  success: boolean,
  error?: string
}
```

**实现文件：** `functions/api/r2/upload-json.ts`

---

### 3. 上传元数据包

**端点：** `POST /api/r2/upload-metadata-bundle`

**请求格式（支持两种字段名）：**
```typescript
{
  data: any,              // 优先使用
  metadata: any,          // 后备字段
  config: R2SyncConfig
}
```

**返回格式：**
```typescript
{
  success: boolean,
  error?: string
}
```

**实现文件：** `functions/api/r2/upload-metadata-bundle.ts`

**固定路径：** `metadata-bundle.json`（根目录）

---

### 4. 下载文件

**端点：** `POST /api/r2/download`

**请求格式（支持两种字段名）：**
```typescript
{
  fileName?: string,      // 后备字段
  r2Path?: string,        // 优先使用（前端使用）
  config: R2SyncConfig
}
```

**返回格式（成功）：**
```typescript
{
  success: true,
  base64Data: string      // Base64 编码的文件内容
}
```

**返回格式（失败）：**
```typescript
{
  success: false,
  error: string
}
```

**实现文件：** `functions/api/r2/download.ts`

**⚠️ 注意：** 已修复，现在返回 JSON 格式而不是直接返回 Blob

---

### 5. 下载元数据包

**端点：** `POST /api/r2/download-metadata-bundle`

**请求格式：**
```typescript
{
  config: R2SyncConfig
}
```

**返回格式（成功）：**
```typescript
{
  success: true,
  data: any               // JSON 对象（元数据包内容）
}
```

**返回格式（404 未找到）：**
```typescript
{
  success: false,
  notFound: true
}
```

**返回格式（其他错误）：**
```typescript
{
  success: false,
  error: string
}
```

**实现文件：** `functions/api/r2/download-metadata-bundle.ts`

**固定路径：** `metadata-bundle.json`

---

### 6. 列出文档列表

**端点：** `POST /api/r2/list-documents`

**请求格式：**
```typescript
{
  config: R2SyncConfig
}
```

**返回格式（成功）：**
```typescript
{
  success: true,
  documents: [
    {
      docId: string,        // 如 "custom_1790476166351_xxx"
      category: string,     // 如 "custom", "pcie", "arm" 等
      fileName: string,     // 如 "custom_xxx.pdf"
      r2Path: string,       // 完整路径 "documents/custom_xxx.pdf"
      size: number,         // 文件大小（字节）
      lastModified: string  // ISO 时间戳
    }
  ]
}
```

**返回格式（失败）：**
```typescript
{
  success: false,
  error: string
}
```

**实现文件：** `functions/api/r2/list-documents.ts`

**✅ 状态：** 已修复，现在返回正确的字段（r2Path, category, fileName）

---

### 7. 列出所有文件

**端点：** `POST /api/r2/list-all`

**请求格式：**
```typescript
{
  config: R2SyncConfig
}
```

**返回格式（成功）：**
```typescript
{
  success: true,
  files: [
    {
      key: string,          // 完整路径
      lastModified: string,
      size: number
    }
  ]
}
```

**或使用别名：**
```typescript
{
  success: true,
  keys: string[]           // 仅返回路径数组
}
```

**返回格式（失败）：**
```typescript
{
  success: false,
  error: string
}
```

**实现文件：** `functions/api/r2/list-all.ts`

**❌ 问题：** 使用了 `DOMParser`，需要修复

---

### 8. 列出分析文件

**端点：** `POST /api/r2/list-analysis`

**请求格式：**
```typescript
{
  config: R2SyncConfig,
  docId?: string           // 可选，过滤特定文档
}
```

**返回格式（成功）：**
```typescript
{
  success: true,
  analysisFiles: [
    {
      key: string,          // 完整路径
      lastModified: string,
      size: number
    }
  ]
}
```

**或使用别名：**
```typescript
{
  success: true,
  files: string[]          // 仅返回路径数组
}
```

**返回格式（失败）：**
```typescript
{
  success: false,
  error: string
}
```

**实现文件：** `functions/api/r2/list-analysis.ts`

**❌ 问题：** 使用了 `DOMParser`，需要修复

---

## 🔧 R2SyncConfig 结构

所有 API 请求都需要的配置对象：

```typescript
interface R2SyncConfig {
  accountId: string,        // Cloudflare Account ID
  bucketName: string,       // R2 Bucket 名称（如 "spec"）
  accessKeyId: string,      // R2 Access Key ID
  secretAccessKey: string,  // R2 Secret Access Key
  publicDomain?: string,    // 可选，自定义域名
  autoSync?: boolean        // 可选，是否自动同步
}
```

---

## 🐛 需要修复的问题列表

### 优先级 1：阻塞性问题

#### 1. 修复 list-all.ts 中的 DOMParser

**文件：** `functions/api/r2/list-all.ts` 第 82-101 行

**当前代码（错误）：**
```typescript
const xmlText = await response.text();

// Parse XML response to extract file list
const parser = new DOMParser();  // ❌ 不支持
const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
const contents = xmlDoc.getElementsByTagName('Contents');
```

**修复方案：** 使用正则表达式解析

```typescript
const xmlText = await response.text();

// Parse XML response manually
const contentsRegex = /<Contents>[\s\S]*?<\/Contents>/g;
const keyRegex = /<Key>(.*?)<\/Key>/;
const lastModifiedRegex = /<LastModified>(.*?)<\/LastModified>/;
const sizeRegex = /<Size>(\d+)<\/Size>/;

const contentsMatches = xmlText.match(contentsRegex) || [];

const files = [];
for (const content of contentsMatches) {
  const keyMatch = content.match(keyRegex);
  const lastModifiedMatch = content.match(lastModifiedRegex);
  const sizeMatch = content.match(sizeRegex);

  const key = keyMatch ? keyMatch[1] : null;

  if (key) {
    files.push({
      key,
      lastModified: lastModifiedMatch ? lastModifiedMatch[1] : null,
      size: sizeMatch ? parseInt(sizeMatch[1]) : 0,
    });
  }
}
```

#### 2. 修复 list-analysis.ts 中的 DOMParser

**文件：** `functions/api/r2/list-analysis.ts` 第 81-101 行

**应用相同的正则表达式解析方案**

---

### 优先级 2：一致性优化

#### 3. 统一 list-all 返回字段名

**当前问题：** 有些代码期待 `files`，有些期待 `keys`

**建议：** 统一返回 `keys`（简单的字符串数组）

```typescript
return Response.json({
  success: true,
  keys: files.map(f => f.key)  // 仅返回路径
}, {
  headers: { 'Access-Control-Allow-Origin': '*' },
});
```

#### 4. 统一 list-analysis 返回字段名

**当前问题：** 有些代码期待 `analysisFiles`，有些期待 `files`

**建议：** 统一返回 `files`

---

## 📊 前端调用代码检查

### r2Service.ts 中的调用

**listDocumentsFromR2：**
```typescript
// ✅ 正确：期待 {success, documents}
const result = await response.json();
return result;
```

**downloadDocumentFromR2：**
```typescript
// ✅ 正确：期待 {success, base64Data}
const result = await response.json();
// 解码 base64Data 为 ArrayBuffer
```

**downloadJsonFromR2：**
```typescript
// ✅ 正确：期待 {success, base64Data}
const result = await response.json();
// 解码 base64Data 并 JSON.parse
```

**uploadJsonToR2：**
```typescript
// ✅ 正确：发送 {fileName, jsonBase64, config}
body: JSON.stringify({ fileName, jsonBase64, config })
```

**uploadAllMetadataToR2：**
```typescript
// ✅ 正确：发送 {metadata, config}
body: JSON.stringify({ metadata: metadataBundle, config })
```

**downloadAllMetadataFromR2：**
```typescript
// ✅ 正确：期待 {success, data}
const result = await response.json();
```

---

## ✅ 格式检查清单

### 上传 APIs

- [x] `upload.ts` - 请求格式正确，返回格式正确
- [x] `upload-json.ts` - 支持两种请求格式，返回格式正确
- [x] `upload-metadata-bundle.ts` - 支持两种字段名，返回格式正确

### 下载 APIs

- [x] `download.ts` - 支持两种字段名，返回格式已修复（Base64 JSON）
- [x] `download-metadata-bundle.ts` - 请求格式正确，返回格式正确

### 列表 APIs

- [x] `list-documents.ts` - 请求格式正确，返回格式已修复
- [ ] `list-all.ts` - ❌ 使用 DOMParser，需要修复
- [ ] `list-analysis.ts` - ❌ 使用 DOMParser，需要修复

---

## 🎯 修复优先级

### 立即修复（阻塞性）

1. **修复 `list-all.ts` DOMParser 问题**
   - 使用正则表达式解析 XML
   - 统一返回字段为 `keys`

2. **修复 `list-analysis.ts` DOMParser 问题**
   - 使用正则表达式解析 XML
   - 统一返回字段为 `files`

### 后续优化（非阻塞）

3. 添加更详细的错误日志
4. 添加请求超时处理
5. 添加重试机制

---

## 🧪 测试检查清单

完成修复后，需要测试：

- [ ] 上传 PDF 文档
- [ ] 下载 PDF 文档（检查是否为 JSON 格式）
- [ ] 上传章节分析 JSON
- [ ] 下载章节分析 JSON
- [ ] 列出文档列表（检查字段：docId, category, fileName, r2Path）
- [ ] 列出所有文件（检查是否崩溃）
- [ ] 列出分析文件（检查是否崩溃）
- [ ] 上传/下载元数据包

---

## 📝 总结

### 已修复的问题
- ✅ `list-documents.ts` 返回字段不匹配
- ✅ `download.ts` 返回格式从 Blob 改为 JSON

### 需要立即修复的问题
- ❌ `list-all.ts` 使用 DOMParser（会崩溃）
- ❌ `list-analysis.ts` 使用 DOMParser（会崩溃）

### 接口一致性状态
- 上传 APIs：✅ 完全一致
- 下载 APIs：✅ 完全一致
- 列表 APIs：⚠️ 两个文件需要修复
