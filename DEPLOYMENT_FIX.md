# Cloudflare Pages 部署修复指南

## 已完成的修复

### ✅ 1. 添加了 Functions 类型定义
**文件**: `functions/env.d.ts`

为所有 Cloudflare Pages Functions 提供了 `PagesFunction` 类型定义，解决 TypeScript 编译问题。

### ✅ 2. 改进了 R2 API 错误处理
**文件**: `src/lib/r2Service.ts`

- `downloadAllMetadataFromR2()`: 添加了 404 检测和详细错误处理
- `listDocumentsFromR2()`: 添加了 404/403 状态码处理和中文错误提示

### ✅ 3. 优化了前端 fallback 逻辑
**文件**: `src/App.tsx`

改进了 R2 同步逻辑，能够：
- 优雅地处理 API 不存在的情况（404）
- 提供更友好的错误提示
- 正确区分"API 不可用"和"R2 配置错误"

## 部署步骤

### 1. 提交代码到 Git

```bash
# 查看修改
git status

# 添加所有修改
git add functions/env.d.ts
git add src/lib/r2Service.ts
git add src/App.tsx

# 提交
git commit -m "fix: 修复 Cloudflare Pages Functions 类型定义和 R2 错误处理

- 添加 functions/env.d.ts 提供 PagesFunction 类型
- 改进 R2 API 调用的错误处理（404/403）
- 优化前端 fallback 逻辑和错误提示"

# 推送到 GitHub
git push origin master
```

### 2. 在 Cloudflare Pages 触发重新部署

访问 Cloudflare Pages Dashboard:
1. 进入项目: https://dash.cloudflare.com/?to=/:account/pages/view/spec-companion
2. 点击 **Deployments** 标签
3. 如果自动部署已触发，等待完成
4. 如果没有自动触发，点击 **Create deployment** 手动部署

### 3. 验证部署结果

部署完成后：

**检查 Functions 是否正确部署**:
```bash
# 测试 health 端点
curl https://spec-companion.pages.dev/api/health

# 应该返回: {"status":"ok"}
```

**检查浏览器控制台**:
- 打开 https://spec-companion.pages.dev
- 打开浏览器开发者工具（F12）
- 查看 Console 标签
- 现在应该看到友好的警告信息，而不是错误

## 预期行为

### 情况 1: Functions 正常部署，但没有配置 R2

**现象**: 
- 应用正常加载
- 点击"从 R2 同步"时，会看到提示："R2 API 端点不可用"

**解决**: 这是正常的，用户可以继续使用本地上传功能

### 情况 2: Functions 正常部署，R2 已配置但配置错误

**现象**: 
- 应用正常加载
- 点击"从 R2 同步"时，会看到提示："R2 访问被拒绝，请检查您的配置"

**解决**: 用户需要检查 R2 配置（Account ID, Access Key, Secret Key）

### 情况 3: Functions 正常部署，R2 配置正确

**现象**: 
- 应用正常加载
- R2 同步功能正常工作

## 如果问题仍然存在

### 检查 Functions 是否正确部署

1. 在 Cloudflare Pages Dashboard 查看部署日志
2. 搜索关键词 "Functions"
3. 应该看到类似这样的输出：

```
✨ Compiled Worker successfully
✨ Functions:
  /api/health
  /api/r2/download
  /api/r2/download-metadata-bundle
  /api/r2/list-documents
  ...
```

### 检查 TypeScript 编译错误

如果在部署日志中看到 TypeScript 错误：

```bash
# 在本地运行类型检查
npm run lint

# 应该没有错误输出
```

### 清除 Cloudflare 缓存

有时需要清除缓存才能看到新的部署：

1. 在 Cloudflare Pages Dashboard
2. 进入 **Settings** > **General**
3. 找到 **Purge Cache** 
4. 点击 **Purge Everything**

## R2 配置（可选功能）

如果你想启用 R2 云存储功能：

### 1. 创建 R2 Bucket

1. 登录 Cloudflare Dashboard
2. 导航到 **R2** > **Overview**
3. 点击 **Create bucket**
4. 输入 bucket 名称（例如：`spec-companion-storage`）
5. 点击 **Create bucket**

### 2. 生成 R2 API Token

1. 在 R2 页面，点击 **Manage R2 API Tokens**
2. 点击 **Create API token**
3. 权限设置：
   - **Object Read & Write** ✅
   - **Specify bucket** - 选择刚创建的 bucket
4. 创建后会显示：
   - Access Key ID
   - Secret Access Key
   - **⚠️ 重要**: 立即保存这两个值，关闭页面后无法再次查看

### 3. 在应用中配置

1. 打开应用：https://spec-companion.pages.dev
2. 点击右上角的设置图标
3. 找到 "R2 云存储配置"
4. 填入：
   - **Account ID**: 在 Cloudflare Dashboard 右侧找到（格式：32位字符）
   - **Bucket Name**: 刚才创建的 bucket 名称
   - **Access Key ID**: API Token 的 Access Key ID
   - **Secret Access Key**: API Token 的 Secret Access Key
5. 点击 **测试连接** 验证配置
6. 如果测试成功，点击 **保存**

## 故障排除

### 问题：部署后仍然看到 404 错误

**可能原因**:
1. Git 提交未包含 `functions/env.d.ts`
2. Cloudflare Pages 构建缓存问题
3. Functions 目录结构不正确

**解决方法**:
```bash
# 验证文件是否存在
ls -la functions/env.d.ts
ls -la functions/api/r2/

# 确认文件已提交
git log --oneline -n 3
git show HEAD --name-only

# 如果文件未提交，重新提交
git add functions/env.d.ts
git commit --amend --no-edit
git push origin master --force
```

### 问题：看到 TypeScript 类型错误

**解决方法**:
```bash
# 本地测试构建
npm run build:pages

# 如果有错误，检查 tsconfig.json
```

### 问题：R2 配置后仍然失败

**检查清单**:
- ✅ Account ID 是否正确（32位十六进制字符）
- ✅ Bucket Name 是否拼写正确
- ✅ Access Key ID 和 Secret Access Key 是否正确复制（注意空格）
- ✅ API Token 是否有正确的权限（Read & Write）
- ✅ API Token 是否绑定到正确的 bucket

## 下一步

修复完成后，应用应该能够：
1. ✅ 正常加载，没有控制台错误
2. ✅ 支持本地文件上传和管理
3. ✅ 优雅地处理 R2 不可用的情况
4. ✅ （可选）如果配置了 R2，支持云端存储和同步

## 需要帮助？

如果问题仍然存在，请提供：
1. Cloudflare Pages 部署日志（完整）
2. 浏览器控制台错误截图
3. 当前的 Git commit hash: `git rev-parse HEAD`
