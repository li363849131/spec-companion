#!/bin/bash
# 修复 Cloudflare Pages 部署问题的快速脚本

echo "=== Cloudflare Pages 部署修复 ==="
echo ""

# 显示修改的文件
echo "📝 修改的文件:"
echo "  ✅ functions/env.d.ts (新建)"
echo "  ✅ src/lib/r2Service.ts"
echo "  ✅ src/App.tsx"
echo ""

# 提交到 git
echo "📦 提交到 Git..."
git add functions/env.d.ts src/lib/r2Service.ts src/App.tsx DEPLOYMENT_FIX.md

git commit -m "fix: 修复 Cloudflare Pages Functions 类型定义和 R2 错误处理

- 添加 functions/env.d.ts 提供 PagesFunction 类型定义
- 改进 r2Service.ts 的错误处理（检测 404/403 状态码）
- 优化 App.tsx 的 R2 同步 fallback 逻辑
- 添加友好的中文错误提示
- 添加部署修复指南文档"

echo ""
echo "✅ 代码已提交到本地仓库"
echo ""

# 推送到远程
echo "🚀 推送到 GitHub..."
git push origin master

echo ""
echo "=== 完成！==="
echo ""
echo "下一步:"
echo "1. 访问 Cloudflare Pages Dashboard"
echo "2. 等待自动部署完成（约 2-3 分钟）"
echo "3. 访问 https://spec-companion.pages.dev 测试"
echo ""
echo "预期结果:"
echo "  - 应用正常加载，无控制台错误"
echo "  - R2 API 不可用时会显示友好提示"
echo "  - 本地文件上传功能正常工作"
