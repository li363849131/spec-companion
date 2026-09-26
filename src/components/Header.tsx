import React from 'react';
import {
  FileText,
  Upload,
  Download,
  Database,
  Cpu,
  Sparkles,
  Zap,
  BookOpen,
  Settings,
  Loader2,
  Trash2,
  Square,
  Library,
  Cloud,
  TestTube,
  FolderUp
} from 'lucide-react';
import { SpecDocument, UserProfile } from '../types';
import { UserSwitcher } from './UserSwitcher';

interface HeaderProps {
  currentDoc: SpecDocument;
  documents: SpecDocument[];
  onSelectDoc: (docId: string) => void;
  onUploadPdf: (file: File) => void;
  onDeleteDoc?: (docId: string) => void;
  onOpenExportModal: () => void;
  onOpenSettingsModal: () => void;
  isCustomRelayActive: boolean;
  isUploadingPdf: boolean;
  cachedPageCount: number;
  autoAnalyze: boolean;
  onToggleAutoAnalyze: () => void;
  onTriggerAnalyze: () => void;
  onPauseAnalyze?: () => void;
  isAnalyzing: boolean;
  hasCachedCurrentPage: boolean;
  activeTab: 'reader' | 'bookshelf';
  onTabChange: (tab: 'reader' | 'bookshelf') => void;
  currentUser: UserProfile;
  userProfiles: UserProfile[];
  onSelectUser: (user: UserProfile) => void;
  onAddUser?: (name: string, role: string) => void;
  onDeleteUser?: (userId: string) => void;
  onOpenR2Modal?: () => void;
  onOpenBatchUploadModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentDoc,
  documents,
  onSelectDoc,
  onUploadPdf,
  onDeleteDoc,
  onOpenExportModal,
  onOpenSettingsModal,
  isCustomRelayActive,
  isUploadingPdf,
  cachedPageCount,
  autoAnalyze,
  onToggleAutoAnalyze,
  onTriggerAnalyze,
  onPauseAnalyze,
  isAnalyzing,
  hasCachedCurrentPage,
  activeTab,
  onTabChange,
  currentUser,
  userProfiles,
  onSelectUser,
  onAddUser,
  onDeleteUser,
  onOpenR2Modal,
  onOpenBatchUploadModal,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Support multiple file uploads
      Array.from(e.target.files).forEach(file => {
        onUploadPdf(file);
      });
      // Reset so same file can be re-selected
      e.target.value = '';
    }
  };

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 text-slate-100 px-3 sm:px-4 flex items-center justify-between select-none shrink-0 z-30">
      {/* Left: Brand & View Switcher */}
      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
        <div className="flex items-center space-x-2 shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-md shadow-indigo-500/20 text-white shrink-0">
            <Cpu className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-sm sm:text-base tracking-tight text-white leading-none">
                Spec Companion
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                芯片架构
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-none">规范文献研读专家</p>
          </div>
        </div>

        {/* View Switcher: Bookshelf vs Reader */}
        <div className="flex items-center bg-slate-800/90 rounded-lg p-0.5 border border-slate-700 text-xs shrink-0">
          <button
            id="tab-bookshelf"
            onClick={() => onTabChange('bookshelf')}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-md font-semibold transition ${
              activeTab === 'bookshelf'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
            title="书籍库与图书馆视图：管理书籍、浏览章节大纲、监控全书缓存"
          >
            <Library className="w-3.5 h-3.5" />
            <span>藏书阁</span>
          </button>
          <button
            id="tab-reader"
            onClick={() => onTabChange('reader')}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-md font-semibold transition ${
              activeTab === 'reader'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
            title="阅读器模式：双栏连续滚动阅读与 AI 专家章节剖析"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>研读器</span>
          </button>
        </div>

        {/* Document Selector Dropdown (When in reader mode) */}
        {activeTab === 'reader' && currentDoc && (
          <div className="hidden md:flex items-center space-x-1.5">
            <select
              id="doc-selector"
              value={currentDoc.id}
              onChange={(e) => onSelectDoc(e.target.value)}
              className="bg-slate-800/90 text-slate-200 text-xs rounded-md border border-slate-700 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 hover:bg-slate-800 transition max-w-[160px] lg:max-w-[220px] truncate"
            >
              <optgroup label="内置核心协议规范">
                {documents
                  .filter((d) => d.category !== 'custom')
                  .map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name} ({doc.version || 'Spec'})
                    </option>
                  ))}
              </optgroup>
              {documents.some((d) => d.category === 'custom') && (
                <optgroup label="自定义上传书籍">
                  {documents
                    .filter((d) => d.category === 'custom')
                    .map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name} ({doc.totalPages}P)
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>
        )}

        {/* Upload Button */}
        <input
          type="file"
          ref={fileInputRef}
          accept="application/pdf,.pdf,.doc,.docx,.md,.txt,.html,.htm,.epub,.xlsx,.xls,.csv,.pptx,.ppt"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          id="btn-upload-pdf"
          disabled={isUploadingPdf}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 disabled:opacity-50 transition shrink-0"
          title="上传本地芯片 Datasheet 或技术协议 PDF"
        >
          {isUploadingPdf ? (
            <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5 text-slate-300" />
          )}
          <span className="hidden sm:inline">{isUploadingPdf ? '正在解析...' : '导入新书'}</span>
        </button>

        {/* Batch Upload Button */}
        {onOpenBatchUploadModal && (
          <button
            onClick={onOpenBatchUploadModal}
            disabled={isUploadingPdf}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-800 hover:bg-emerald-700 text-slate-200 border border-emerald-700 hover:border-emerald-600 disabled:opacity-50 transition shrink-0"
            title="批量上传目录中的所有 PDF"
          >
            <FolderUp className="w-3.5 h-3.5 text-slate-300" />
            <span className="hidden sm:inline">批量导入</span>
          </button>
        )}
      </div>

      {/* Right: Cloudflare R2, User Switcher, Cache Stats, Actions */}
      <div className="flex items-center space-x-1.5 sm:space-x-2.5">
        {/* R2 Test Page Link */}
        <a
          href="/?test=r2"
          className="flex items-center space-x-1 px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 font-medium transition"
          title="R2 存储测试页面"
        >
          <TestTube className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">R2 测试</span>
        </a>

        {/* Cloudflare R2 Sync Button */}
        {onOpenR2Modal && (
          <button
            id="btn-open-r2-modal"
            onClick={onOpenR2Modal}
            className="flex items-center space-x-1 px-2 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-orange-300 font-semibold transition"
            title="Cloudflare R2 远端数据仓库与 IndexedDB 零费用缓存配置"
          >
            <Cloud className="w-3.5 h-3.5 text-orange-400" />
            <span className="hidden lg:inline">R2 仓库</span>
          </button>
        )}

        {/* User Isolation Switcher */}
        <UserSwitcher
          currentUser={currentUser}
          profiles={userProfiles}
          onSelectUser={onSelectUser}
          onAddUser={onAddUser}
          onDeleteUser={onDeleteUser}
        />

        {/* Cache Counter Badge */}
        <div 
          className="hidden xl:flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs"
          title="已缓存在本地数据库中的页面与章节数。本地秒出，0 Token 消耗。"
        >
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>缓存: <strong>{cachedPageCount}</strong> 页</span>
        </div>

        {/* AI Gateway / Relay Settings Button */}
        <button
          id="btn-ai-settings"
          onClick={onOpenSettingsModal}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition ${
            isCustomRelayActive
              ? 'bg-purple-950/60 border-purple-700/60 text-purple-300 hover:bg-purple-900/60'
              : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
          }`}
          title={isCustomRelayActive ? '当前已启用自定义中转站/代理网关' : '配置自定义中转站或自建 AI 代理服务器'}
        >
          <Settings className={`w-3.5 h-3.5 ${isCustomRelayActive ? 'text-purple-400' : 'text-slate-400'}`} />
          <span className="hidden lg:inline">{isCustomRelayActive ? '自定义中转站' : 'AI 设置'}</span>
        </button>

        {/* Export Notes Button */}
        <button
          id="btn-export-notes"
          onClick={onOpenExportModal}
          className="flex items-center space-x-1 px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-700/20 transition shrink-0"
          title="将已读章节与页面的专家讲解及笔记一键导出为 Markdown"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden md:inline">导出笔记</span>
        </button>
      </div>
    </header>
  );
};

