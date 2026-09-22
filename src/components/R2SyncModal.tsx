import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  HardDrive, 
  Database, 
  FolderTree, 
  ShieldCheck, 
  Download, 
  Upload, 
  Check, 
  X, 
  HelpCircle, 
  ExternalLink,
  Layers,
  ArrowRight,
  Info
} from 'lucide-react';
import { R2SyncConfig, SpecDocument } from '../types';
import { getR2SyncConfig, saveR2SyncConfig } from '../lib/db';

interface R2SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: SpecDocument[];
}

export const R2SyncModal: React.FC<R2SyncModalProps> = ({
  isOpen,
  onClose,
  documents,
}) => {
  const [config, setConfig] = useState<R2SyncConfig>({
    accountId: '',
    bucketName: 'chip-specs-warehouse',
    accessKeyId: '',
    secretAccessKey: '',
    publicDomain: 'https://specs-r2.yourcompany.com',
    autoSync: true,
  });

  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [manifestPreview, setManifestPreview] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'config' | 'architecture' | 'manifest'>('architecture');

  useEffect(() => {
    async function loadConfig() {
      const saved = await getR2SyncConfig();
      if (saved) setConfig(saved);
    }
    if (isOpen) {
      loadConfig();
      // Generate library.json manifest preview
      const manifest = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        totalBooks: documents.length,
        books: documents.map((d) => ({
          id: d.id,
          name: d.name,
          fullName: d.fullName,
          category: d.category,
          totalPages: d.totalPages,
          version: d.version,
          r2Path: `books/${d.id}/original.pdf`,
          metaPath: `books/${d.id}/meta.json`,
          chaptersCount: d.chapters?.length || d.outline?.length || 0,
          chapters: d.chapters || [],
        })),
      };
      setManifestPreview(JSON.stringify(manifest, null, 2));
    }
  }, [isOpen, documents]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveR2SyncConfig(config);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleDownloadManifest = () => {
    const blob = new Blob([manifestPreview], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'library.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
                <span>Cloudflare R2 数据仓库 & 本地 DB 同步体系</span>
                <span className="text-[10px] bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full font-mono">
                  R2 + IndexedDB
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                双层缓存架构：本地小型 DB 缓存目录索引，零流量费用秒级响应
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 px-5 pt-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('architecture')}
            className={`pb-2.5 px-3 border-b-2 transition ${
              activeTab === 'architecture'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            📐 目录结构与极低费用方案
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`pb-2.5 px-3 border-b-2 transition ${
              activeTab === 'config'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            🔑 Cloudflare R2 凭证与连接
          </button>
          <button
            onClick={() => setActiveTab('manifest')}
            className={`pb-2.5 px-3 border-b-2 transition ${
              activeTab === 'manifest'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            📦 仓库清单预览 (library.json)
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar text-xs leading-relaxed">
          {activeTab === 'architecture' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 space-y-2">
                <h4 className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center space-x-1.5 text-sm">
                  <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>解答你的疑问：后续上 Cloudflare R2 需要准备什么？如何组织仓库？</span>
                </h4>
                <p className="text-slate-700 dark:text-slate-300">
                  Cloudflare R2 提供 <strong>0 出口流量费用（Zero Egress Fees）</strong>，非常适合作为硬件规范技术文献的私有对象存储。你只需要在 Cloudflare 控制台获取以下 4 项信息即可无缝对接：
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">1. Account ID</span>
                    <p className="text-slate-500 text-[10px]">Cloudflare 右侧仪表盘概览中的 32 位十六进制串</p>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">2. R2 Bucket Name</span>
                    <p className="text-slate-500 text-[10px]">存储桶名称（如 spec-warehouse）</p>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">3. Access Key ID & Secret</span>
                    <p className="text-slate-500 text-[10px]">在 R2 → Manage API Tokens 中创建具有读写权限的令牌</p>
                  </div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">4. 自定义域 / Worker 路由</span>
                    <p className="text-slate-500 text-[10px]">可选，绑定如 r2.yourcompany.com 获得全球 CDN 加速</p>
                  </div>
                </div>
              </div>

              {/* Directory Tree Mapping */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-950 space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                  <span className="flex items-center space-x-1.5">
                    <FolderTree className="w-4 h-4 text-emerald-500" />
                    <span>与页面图书目录 1:1 对应的 Cloudflare R2 规范目录树</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Bucket Root</span>
                </div>

                <div className="bg-slate-900 text-emerald-400 font-mono text-[11px] p-3 rounded-lg overflow-x-auto leading-relaxed border border-slate-800">
                  <pre>{`spec-warehouse/
├── manifests/
│   └── library.json           # 包含全馆图书索引、版本哈希 (ETag) 与章节映射
├── books/
│   ├── pcie_5_0_iatu/
│   │   ├── meta.json          # 书籍名称、总页数、章节范围 [startPage, endPage]
│   │   ├── original.pdf       # 原始 PDF 规范文件
│   │   └── chapters/
│   │       ├── c1/
│   │       │   ├── analysis.json   # AI架构师深度剖析 Markdown & 寄存器位域
│   │       │   └── diagrams/       # 时序图、SVG波形与逻辑框图
│   │       └── c2/
│   └── arm_axi5_spec/
│       ├── meta.json
│       ├── original.pdf
│       └── chapters/`}</pre>
                </div>
              </div>

              {/* Local DB Cost Saving Mechanism */}
              <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-1.5 text-slate-700 dark:text-slate-300">
                <h5 className="font-bold text-amber-900 dark:text-amber-200 flex items-center space-x-1.5">
                  <Database className="w-4 h-4 text-amber-600" />
                  <span>本地数据库（IndexedDB）零费用降本机制</span>
                </h5>
                <p>
                  1. <strong>目录只校验 ETag</strong>：打开应用时，仅向 R2 请求 <code>manifests/library.json</code> 的 HEAD 头校验哈希。若未变动（HTTP 304），本地数据库直接提供全量图书目录，<strong>0 存储操作费用，0 等待延迟</strong>。
                </p>
                <p>
                  2. <strong>章节按需流式拉取</strong>：只有当工程师真正跳转到某章节时，才从 R2 拉取对应的 <code>analysis.json</code> 并永久写入本地 IndexedDB。第二次打开直接从本地秒开！
                </p>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cloudflare Account ID
                  </label>
                  <input
                    type="text"
                    placeholder="例如: 8a9b2c3d4e5f60718293a4b5c6d7e8f9"
                    value={config.accountId}
                    onChange={(e) => setConfig({ ...config, accountId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      R2 存储桶名称 (Bucket Name)
                    </label>
                    <input
                      type="text"
                      placeholder="chip-specs-warehouse"
                      value={config.bucketName}
                      onChange={(e) => setConfig({ ...config, bucketName: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      公共域名 / Worker 代理 URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://specs-r2.yourcompany.com"
                      value={config.publicDomain}
                      onChange={(e) => setConfig({ ...config, publicDomain: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Access Key ID
                    </label>
                    <input
                      type="password"
                      placeholder="R2 S3-Compatible Access Key"
                      value={config.accessKeyId}
                      onChange={(e) => setConfig({ ...config, accessKeyId: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Secret Access Key
                    </label>
                    <input
                      type="password"
                      placeholder="R2 S3-Compatible Secret Key"
                      value={config.secretAccessKey}
                      onChange={(e) => setConfig({ ...config, secretAccessKey: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="autoSync"
                    checked={config.autoSync}
                    onChange={(e) => setConfig({ ...config, autoSync: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="autoSync" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                    当本地完成新章节研读时，自动将解析与高精架构图备份同步至 R2
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow transition flex items-center space-x-1.5"
                >
                  {isSaved ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>已保存配置</span>
                    </>
                  ) : (
                    <span>保存 R2 连接凭证</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'manifest' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-slate-500 dark:text-slate-400">
                  当前本地图书与章节目录导出的 <code>manifests/library.json</code> 内容：
                </p>
                <button
                  onClick={handleDownloadManifest}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>导出 library.json 文件</span>
                </button>
              </div>

              <pre className="p-3.5 rounded-xl bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-auto max-h-72 border border-slate-800 custom-scrollbar">
                {manifestPreview}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>本地 IndexedDB 数据引擎正常工作</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold"
          >
            关闭面板
          </button>
        </div>
      </div>
    </div>
  );
};
