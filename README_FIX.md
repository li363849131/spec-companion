# Spec Companion 快速修复指南

## 🚨 问题现象
网页无法打开或显示白屏

## ✅ 快速修复（3步解决）

### 第一步：清理并重装依赖

```bash
# 在项目根目录执行
npm cache clean --force
rmdir /s /q node_modules
del package-lock.json
npm install
```

### 第二步：清除浏览器数据

1. 打开浏览器
2. 按 F12 打开开发者工具
3. 点击 Application（应用程序）标签
4. 左侧找到 Storage → IndexedDB
5. 右键点击 `SpecCompanionDB` → Delete（删除）
6. 左侧找到 Local Storage → 删除 http://localhost:3000 条目
7. 关闭浏览器，重新打开

### 第三步：启动开发服务器

**方式1（推荐）- 使用启动脚本:**
```bash
双击 start-dev.bat
```

**方式2 - 命令行:**
```bash
npm run dev
```

然后打开浏览器访问: http://localhost:3000

---

## 🔍 如果仍然无法打开

### 检查控制台错误

1. 打开浏览器开发者工具 (F12)
2. 查看 Console 标签
3. 截图所有红色错误信息
4. 查看 Network 标签，检查是否有请求失败（红色）

### 常见问题排查

#### 问题1: 端口被占用
**错误信息:** `Port 3000 is already in use`

**解决方法:**
```bash
# 找到占用端口的进程
netstat -ano | findstr :3000

# 杀掉进程（替换 PID 为实际进程号）
taskkill /F /PID <PID>
```

#### 问题2: 依赖安装失败
**错误信息:** `Cannot find module 'xxx'`

**解决方法:**
```bash
# 删除 node_modules 和锁文件
rmdir /s /q node_modules
del package-lock.json

# 使用 npm 重新安装
npm install
```

#### 问题3: TypeScript 编译错误
**解决方法:**
```bash
# 检查 TypeScript 错误
npm run lint

# 如果有错误，会显示具体位置
```

#### 问题4: Vite 构建失败
**解决方法:**
```bash
# 清除 Vite 缓存
rmdir /s /q .vite
rmdir /s /q dist

# 重新启动
npm run dev
```

---

## 🧪 测试项目是否正常

访问 http://localhost:3000 后，检查以下功能：

- [ ] 页面正常加载，无白屏
- [ ] 顶部显示 "Spec Companion" logo
- [ ] 左侧显示文档大纲
- [ ] 中间显示 PDF 内容或预设内容
- [ ] 右侧显示 AI 分析面板
- [ ] 可以点击"藏书阁"切换视图
- [ ] 控制台无严重错误（红色）

---

## 📋 项目文件结构验证

确保以下关键文件存在：

```
spec-companion-main/
├── package.json                    ✓
├── tsconfig.json                   ✓
├── vite.config.ts                  ✓
├── server.ts                       ✓
├── index.html                      ✓
├── .env                            ✓（新创建）
├── src/
│   ├── main.tsx                    ✓
│   ├── App.tsx                     ✓
│   ├── types.ts                    ✓
│   ├── polyfills.ts                ✓
│   ├── index.css                   ？
│   ├── components/
│   │   ├── Header.tsx              ✓
│   │   ├── PdfViewer.tsx           ✓
│   │   ├── BookshelfView.tsx       ✓
│   │   ├── SpecAnalysisView.tsx    ？
│   │   ├── DocumentOutline.tsx     ？
│   │   ├── DeepDiveModal.tsx       ？
│   │   ├── ExportNotesModal.tsx    ？
│   │   ├── AISettingsModal.tsx     ？
│   │   ├── R2SyncModal.tsx         ？
│   │   └── UserSwitcher.tsx        ？
│   ├── lib/
│   │   ├── db.ts                   ✓
│   │   ├── pdfWorker.ts            ✓
│   │   └── chapterService.ts       ✓
│   └── data/
│       ├── presetSpecs.ts          ✓
│       └── presetChapters.ts       ✓
```

---

## 🛠️ 手动创建缺失文件（如果需要）

如果发现缺少某些组件文件，请告知，我会立即创建。

---

## 📝 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- 现代浏览器（Chrome 90+, Firefox 88+, Edge 90+）
- 可用端口 3000

---

## 💡 额外提示

### 1. 使用 Chrome 浏览器测试
推荐使用 Chrome 或 Edge 浏览器，兼容性最好。

### 2. 检查防火墙
确保防火墙没有阻止 localhost:3000

### 3. 重启电脑
如果所有方法都不行，尝试重启电脑后再试

### 4. 查看完整日志
启动时保存完整的终端输出：
```bash
npm run dev > debug.log 2>&1
```

---

## 🆘 仍然无法解决？

请提供以下信息：

1. **浏览器控制台截图**（F12 → Console 标签）
2. **终端输出**（npm run dev 的完整输出）
3. **Network 标签截图**（显示失败的请求）
4. **操作系统版本**
5. **Node.js 版本**（运行 `node -v`）

---

**最后更新**: 2026-09-22
**作者**: Claude (Opus 5)
