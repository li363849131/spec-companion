# Cloudflare Pages 部署指南

本指南将帮助你将 Spec Companion 项目部署到 Cloudflare Pages。

## 前置要求

1. Cloudflare 账号（免费即可）
2. GitHub 账号（已有：li363849131/spec-companion）
3. 项目已推送到 GitHub

## 部署步骤

### 方法一：通过 Cloudflare Dashboard（推荐，简单）

#### 1. 登录 Cloudflare

访问 https://dash.cloudflare.com/ 并登录你的账号

#### 2. 创建 Pages 项目

1. 在左侧导航栏选择 **Workers & Pages**
2. 点击 **Create application** 按钮
3. 选择 **Pages** 标签页
4. 点击 **Connect to Git**

#### 3. 连接 GitHub 仓库

1. 选择 **GitHub** 作为 Git 提供商
2. 授权 Cloudflare 访问你的 GitHub 账号
3. 选择 `li363849131/spec-companion` 仓库
4. 点击 **Begin setup**

#### 4. 配置构建设置

在项目配置页面，填写以下信息：

- **Project name**: `spec-companion`（或你想要的名称）
- **Production branch**: `master`
- **Framework preset**: `Vite`（会自动检测）
- **Build command**: `npm run build`
- **Build output directory**: `dist`

#### 5. 环境变量（可选）

如果你的项目需要环境变量，在 **Environment variables** 部分添加：

例如：
```
NODE_VERSION=18
```

#### 6. 部署

点击 **Save and Deploy** 按钮，Cloudflare Pages 将开始构建和部署你的项目。

构建过程大约需要 2-5 分钟。

#### 7. 访问你的网站

部署成功后，你会看到一个类似这样的 URL：
```
https://spec-companion.pages.dev
```

你也可以绑定自定义域名。

---

### 方法二：使用 Wrangler CLI（高级）

#### 1. 安装 Wrangler

```bash
npm install -g wrangler
```

#### 2. 登录 Cloudflare

```bash
wrangler login
```

这会打开浏览器进行授权。

#### 3. 本地构建项目

```bash
npm install
npm run build
```

#### 4. 部署到 Cloudflare Pages

```bash
wrangler pages deploy dist --project-name=spec-companion
```

首次部署时，会提示你创建新项目，按照提示操作即可。

---

## Cloudflare Pages Functions（API 路由）

你的项目包含 `functions/` 目录，Cloudflare Pages 会自动识别并部署这些 API 端点：

- `functions/api/health.ts` → `https://your-site.pages.dev/api/health`
- `functions/api/r2/upload.ts` → `https://your-site.pages.dev/api/r2/upload`
- `functions/api/spec/explain/stream.ts` → `https://your-site.pages.dev/api/spec/explain/stream`
- 等等...

**注意**：这些 Functions 会自动部署，无需额外配置。

---

## 配置 Cloudflare R2（如果使用云存储）

### 1. 创建 R2 存储桶

1. 在 Cloudflare Dashboard 中，选择 **R2**
2. 点击 **Create bucket**
3. 输入存储桶名称（例如：`spec-companion-storage`）
4. 点击 **Create bucket**

### 2. 创建 API Token

1. 在 R2 页面，选择 **Manage R2 API Tokens**
2. 点击 **Create API token**
3. 设置权限：
   - **Token name**: `spec-companion-token`
   - **Permissions**: Admin Read & Write
4. 保存 **Access Key ID** 和 **Secret Access Key**

### 3. 配置环境变量

在 Cloudflare Pages 项目设置中添加：

- `R2_ACCOUNT_ID`: 你的 Cloudflare Account ID
- `R2_ACCESS_KEY_ID`: 上面创建的 Access Key ID
- `R2_SECRET_ACCESS_KEY`: 上面创建的 Secret Access Key
- `R2_BUCKET_NAME`: 你的存储桶名称

---

## 自定义域名配置

### 1. 添加自定义域名

1. 在 Pages 项目页面，选择 **Custom domains**
2. 点击 **Set up a custom domain**
3. 输入你的域名（例如：`spec.yourdomain.com`）
4. 按照提示添加 DNS 记录

### 2. DNS 配置

在你的 DNS 提供商处添加 CNAME 记录：

```
spec.yourdomain.com  →  spec-companion.pages.dev
```

或者如果域名托管在 Cloudflare：

Cloudflare 会自动为你配置 DNS 记录。

---

## 持续部署

配置完成后，每次你推送代码到 GitHub 的 `master` 分支，Cloudflare Pages 会自动：

1. 检测到新提交
2. 运行构建命令 `npm run build`
3. 部署新版本
4. 更新网站

你可以在 Cloudflare Dashboard 的 **Deployments** 页面查看构建日志和历史。

---

## 常见问题

### 1. 构建失败

**检查构建日志**：
- 在 Cloudflare Dashboard 的 **Deployments** 页面查看详细日志
- 确保 `package.json` 中的依赖都正确安装
- 确保 Node.js 版本兼容（推荐 18.x）

**解决方法**：
```bash
# 本地测试构建
npm install
npm run build

# 如果本地构建成功，问题可能在环境变量或 Cloudflare 配置
```

### 2. API 路由 404

确保 `functions/` 目录在项目根目录下，Cloudflare Pages 会自动识别。

### 3. 环境变量不生效

环境变量需要在 Cloudflare Pages 项目设置中配置，不是在代码中。

---

## 性能优化建议

### 1. 启用 Cloudflare CDN

Cloudflare Pages 默认使用全球 CDN，你的网站会自动在全球范围内加速。

### 2. 配置缓存规则

在 **Pages** → **Settings** → **Functions** 中配置缓存策略。

### 3. 压缩资源

确保 `vite.config.ts` 中启用了压缩：

```typescript
export default defineConfig({
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
  },
});
```

---

## 监控和日志

### 查看实时日志

1. 在 Cloudflare Dashboard 中选择你的 Pages 项目
2. 选择 **Functions** 标签
3. 查看实时请求日志和错误信息

### 查看分析数据

在 **Analytics** 标签中查看：
- 访问量统计
- 请求次数
- 错误率
- 响应时间

---

## 回滚到旧版本

如果新版本有问题，可以快速回滚：

1. 在 **Deployments** 页面找到之前的成功部署
2. 点击该部署右侧的 **...** 按钮
3. 选择 **Rollback to this deployment**

---

## 费用说明

Cloudflare Pages 免费套餐包括：

- ✅ 无限带宽
- ✅ 无限请求数
- ✅ 500 次构建/月
- ✅ 1 次并发构建
- ✅ 100 个自定义域名

对于个人项目，免费套餐完全够用！

---

## 下一步

部署成功后，你可以：

1. 绑定自定义域名
2. 配置 R2 存储（用于 PDF 文件云存储）
3. 设置 Webhooks（用于通知）
4. 添加团队成员协作

---

## 需要帮助？

- Cloudflare Pages 文档：https://developers.cloudflare.com/pages/
- Cloudflare 社区：https://community.cloudflare.com/
- 项目 GitHub Issues：https://github.com/li363849131/spec-companion/issues
