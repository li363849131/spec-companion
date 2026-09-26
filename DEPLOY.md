# Cloudflare Pages 部署方案

## 架构说明

当前项目是 Express + Vite 架构，server.ts 同时负责：
1. 开发模式下启动 Vite dev server
2. 提供 AI 分析 API（/api/spec/explain、/api/spec/chapter-explain 等）

部署到 Cloudflare Pages 需要分离这两个职责：
- 前端（React/Vite）→ Cloudflare Pages 静态托管
- 后端 API → Cloudflare Pages Functions（自动部署到 Workers）

## 部署步骤

### 第一步：修改 vite.config.ts 的构建配置

确保构建输出到 dist/ 目录（已有则跳过）。

### 第二步：创建 Pages Functions

在项目根目录创建 `functions/` 文件夹，把 server.ts 里的 API 路由迁移进去。
每个文件名对应一个路由：
- functions/api/spec/explain.ts → /api/spec/explain
- functions/api/spec/chapter-explain.ts → /api/spec/chapter-explain
- functions/api/spec/qa.ts → /api/spec/qa

### 第三步：配置环境变量

在 Cloudflare Pages 控制台 → Settings → Environment Variables 里设置：
- GEMINI_API_KEY
- AI_BASE_URL（你的中转站地址）
- AI_API_KEY（你的中转站 key）
- AI_MODEL

这些替代 .env 文件，不需要把 .env 提交到 git。

### 第四步：发布

```bash
# 安装 wrangler
npm install -g wrangler

# 构建前端
npm run build

# 部署
wrangler pages deploy dist
```

或者连接 GitHub 仓库，每次 push 自动部署。

## 注意事项

- .env 文件不要提交到 git（已在 .gitignore 里）
- 敏感凭据（R2、AI key）通过 Cloudflare Pages 的环境变量管理
- R2 的 CORS 策略需要加上你的 Pages 域名（*.pages.dev）
