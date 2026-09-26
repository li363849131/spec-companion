# 最终诊断和解决方案

## 🔍 问题确认

通过 curl 测试确认：
- ✅ Functions **已经部署成功**
- ✅ `/api/health` 工作正常
- ✅ `/api/r2/list-documents` 和 `/api/r2/download-metadata-bundle` 都能响应

**但是**浏览器仍然显示 404/403 错误。

## 🎯 根本原因

这是 **Cloudflare CDN 缓存问题**。即使你清除了浏览器缓存，Cloudflare 的边缘节点仍然缓存了旧的 404 响应。

## ✅ 解决方案

### 方案 1：在 Cloudflare Dashboard 清除缓存（推荐）

1. 登录 Cloudflare Dashboard
2. 进入你的 Pages 项目：https://dash.cloudflare.com/
3. 找到 `spec-companion` 项目
4. 点击 **Deployments** 标签
5. 找到最新的部署，点击 **View details**
6. 在部署详情页面，找到 **Purge Cache** 或类似选项
7. 清除全部缓存

### 方案 2：使用 Cloudflare API 清除缓存

如果你有 Cloudflare API Token：

```bash
# 清除整个站点的缓存
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

### 方案 3：等待缓存自然过期

Cloudflare 的边缘缓存通常在几分钟到几小时内过期。如果不急，可以等待。

### 方案 4：使用查询参数绕过缓存

临时解决方案，在 URL 后面加上随机参数：

```
https://spec-companion.pages.dev/?nocache=123456
```

## 🧪 验证 Functions 是否真的工作

在你的电脑上运行以下命令，验证 Functions 是否真的部署成功：

```bash
# 测试 download-metadata-bundle
curl -X POST https://spec-companion.pages.dev/api/r2/download-metadata-bundle \
  -H "Content-Type: application/json" \
  -d "{\"config\":{\"accountId\":\"YOUR_ACCOUNT_ID\",\"bucketName\":\"spec\",\"accessKeyId\":\"YOUR_ACCESS_KEY\",\"secretAccessKey\":\"YOUR_SECRET_KEY\"}}"

# 测试 list-documents
curl -X POST https://spec-companion.pages.dev/api/r2/list-documents \
  -H "Content-Type: application/json" \
  -d "{\"config\":{\"accountId\":\"YOUR_ACCOUNT_ID\",\"bucketName\":\"spec\",\"accessKeyId\":\"YOUR_ACCESS_KEY\",\"secretAccessKey\":\"YOUR_SECRET_KEY\"}}"
```

如果返回的不是 404，而是：
- `{"success":false,"error":"R2 error: Unauthorized"}` 或
- `{"success":false,"error":"R2 error: Forbidden"}` 或
- 其他错误信息

**说明 Functions 确实工作正常**，问题是浏览器/CDN 缓存。

## 🔧 关于 R2 403 错误

即使清除缓存后 Functions 正常工作，你可能仍然会看到 403 错误。这是**正常的**，说明：

1. Functions 已经成功部署 ✅
2. 请求已经到达 R2 ✅
3. 但是 R2 拒绝了请求（配置问题）❌

### 检查 R2 配置

请确认：

1. **Account ID 是完整的 32 位字符**
   - 你的显示为 `1ae1c488...`
   - 需要完整的 32 位，例如：`1ae1c48812345678901234567890abcd`

2. **Bucket 名称正确**
   - 你的是 `spec`
   - 确认 R2 Dashboard 中确实存在这个 bucket

3. **Access Key ID 和 Secret Access Key 正确**
   - 从 R2 API Token 页面重新复制
   - 确保没有多余的空格或换行符

4. **API Token 权限**
   - Object Read ✅
   - Object Write ✅
   - 绑定到正确的 bucket ✅

### 重新生成 R2 API Token

如果配置都正确但仍然 403，建议：

1. 在 Cloudflare Dashboard 删除旧的 API Token
2. 重新生成一个新的
3. 在应用中重新配置

## 📊 预期的正常行为

清除 CDN 缓存后，当你点击"从 R2 同步"时：

1. **前端日志**（浏览器控制台）：
   ```
   [R2] downloadAllMetadataFromR2 开始
   [R2] 请求 URL: /api/r2/download-metadata-bundle
   [R2] 配置信息: {...}
   [R2] 响应状态: 404 或 403（取决于 R2 配置）
   ```

2. **服务端日志**（Cloudflare Pages Dashboard > Logs）：
   ```
   [Functions] download-metadata-bundle 被调用
   [Functions] 请求体: {...}
   [Functions] 配置完整，准备请求 R2
   [Functions] R2 响应状态: 404 或 403
   ```

## 📞 如果还是不行

1. 在 Cloudflare Pages Dashboard 查看**实时日志**
2. 截图完整的部署日志（包括 Functions 构建部分）
3. 告诉我你看到的日志内容

## 🎁 临时绕过方案

如果你急需使用 R2 功能，可以：

1. 在本地运行应用：
   ```bash
   cd D:\temp\spec_pdf\spec-companion-main
   npm run dev
   ```

2. 访问 `http://localhost:3000`，在本地环境测试 R2 功能

本地环境不经过 Cloudflare CDN，不会有缓存问题。
