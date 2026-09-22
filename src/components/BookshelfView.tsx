import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  Search, 
  Plus, 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  ChevronDown, 
  Layers, 
  Cpu, 
  Sparkles, 
  Trash2, 
  ArrowUpRight, 
  BookMarked,
  Filter,
  HardDrive,
  Cloud,
  FileText
} from 'lucide-react';
import { SpecDocument, ChapterItem, UserProfile } from '../types';

interface BookshelfViewProps {
  documents: SpecDocument[];
  activeDocId: string;
  onSelectDoc: (docId: string, pageNum?: number) => void;
  onUploadClick: () => void;
  onDeleteDoc?: (docId: string) => void;
  currentUser: UserProfile;
  cachedChaptersMap: Record<string, Set<string>>; // docId -> Set of cached chapterIds
  onPrecacheAllChapters?: (doc: SpecDocument) => void;
  onOpenR2SyncModal?: () => void;
}

export const BookshelfView: React.FC<BookshelfViewProps> = ({
  documents,
  activeDocId,
  onSelectDoc,
  onUploadClick,
  onDeleteDoc,
  currentUser,
  cachedChaptersMap,
  onPrecacheAllChapters,
  onOpenR2SyncModal,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: '全部藏书' },
    { id: 'pcie', label: 'PCIe 互连协议' },
    { id: 'arm', label: 'ARM 体系结构' },
    { id: 'cxl', label: 'CXL 内存池化' },
    { id: 'usb', label: 'USB/外设接口' },
    { id: 'custom', label: '我上传的书籍' },
  ];

  // Filter documents
  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      const matchesCategory =
        selectedCategory === 'all' ||
        (selectedCategory === 'custom' ? doc.category === 'custom' : doc.category === selectedCategory);
      const matchesSearch =
        !searchQuery ||
        doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.fullName && doc.fullName.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [documents, selectedCategory, searchQuery]);

  const toggleExpand = (docId: string) => {
    setExpandedDocId((prev) => (prev === docId ? null : docId));
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-100 dark:bg-slate-950 p-4 sm:p-6 lg:p-8 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header & Intro Banner */}
        <div className="bg-white dark:bg-slate-900 rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 text-xs font-bold border border-indigo-200 dark:border-indigo-800">
                {currentUser?.name || 'Jerry (资深芯片架构师)'} 的个人书斋
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {currentUser?.role || '芯片与系统总线架构负责人'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center space-x-2">
              <BookOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              <span>芯片规范与系统架构图书馆</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
              支持按章节扫描与全局索引，配合 AI 架构师深度解读与本地数据库零延迟缓存。可随时跳转任意章节无缝研读。
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center flex-wrap gap-2.5">
            {onOpenR2SyncModal && (
              <button
                id="btn-open-r2-bookshelf"
                onClick={onOpenR2SyncModal}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition"
                title="配置 Cloudflare R2 数据仓库同步与本地缓存目录"
              >
                <Cloud className="w-4 h-4 text-orange-500" />
                <span>Cloudflare R2 同步</span>
              </button>
            )}

            <button
              id="btn-upload-bookshelf"
              onClick={onUploadClick}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md hover:shadow-indigo-500/20 active:scale-95 transition"
            >
              <Plus className="w-4 h-4" />
              <span>导入新书 (PDF)</span>
            </button>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  selectedCategory === cat.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索书籍名称或章节..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Bookshelf Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDocs.map((doc) => {
            const isSelected = doc.id === activeDocId;
            const isExpanded = expandedDocId === doc.id;
            const chapters = doc.chapters || [];
            const cachedChapterSet = cachedChaptersMap[doc.id] || new Set();
            const cachedCount = cachedChapterSet.size;
            const totalChapterCount = Math.max(1, chapters.length);
            const isFullyCached = cachedCount >= totalChapterCount && totalChapterCount > 0;

            // Reading progress percentage
            const progress = doc.readingProgress || (doc.lastReadPage > 1 ? Math.min(100, Math.round((doc.lastReadPage / doc.totalPages) * 100)) : 0);

            return (
              <div
                key={doc.id}
                className={`flex flex-col bg-white dark:bg-slate-900 rounded-xl border transition shadow-sm hover:shadow-md ${
                  isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-500/20 dark:border-indigo-500'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Book Card Top Banner / Spine */}
                <div className="p-5 flex items-start space-x-4">
                  {/* Book 3D Cover Icon */}
                  <div className="relative w-14 h-20 rounded-md shadow-md flex-shrink-0 flex flex-col justify-between p-2 overflow-hidden bg-gradient-to-br from-slate-800 to-indigo-950 text-white border-l-4 border-indigo-400">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-indigo-300 truncate">
                      {doc.category}
                    </div>
                    <Cpu className="w-5 h-5 text-indigo-400 mx-auto my-auto" />
                    <div className="text-[8px] font-bold text-slate-300 text-center truncate">
                      {doc.version || 'REV'}
                    </div>
                  </div>

                  {/* Book Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {doc.totalPages} 页
                      </span>
                      {isFullyCached ? (
                        <span className="inline-flex items-center space-x-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>全书已缓存</span>
                        </span>
                      ) : cachedCount > 0 ? (
                        <span className="inline-flex items-center space-x-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded">
                          <Clock className="w-3 h-3" />
                          <span>已缓存 {cachedCount}/{totalChapterCount} 章</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">
                          未预缓存
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-snug line-clamp-1" title={doc.name}>
                      {doc.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed" title={doc.fullName}>
                      {doc.fullName || doc.name}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="px-5 pb-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span>阅读进度: 第 {doc.lastReadPage} 页</span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(4, progress)}%` }}
                    />
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="mt-auto border-t border-slate-100 dark:border-slate-800/80 p-3 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between">
                  <button
                    onClick={() => toggleExpand(doc.id)}
                    className="flex items-center space-x-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                  >
                    <span>章节大纲 ({chapters.length || (doc.outline ? doc.outline.length : 0)}章)</span>
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <div className="flex items-center space-x-2">
                    {doc.category === 'custom' && onDeleteDoc && (
                      <button
                        onClick={() => onDeleteDoc(doc.id)}
                        className="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-500 transition"
                        title="从书架移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      id={`btn-read-doc-${doc.id}`}
                      onClick={() => onSelectDoc(doc.id, doc.lastReadPage || 1)}
                      className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${
                        isSelected
                          ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                          : 'bg-slate-800 hover:bg-slate-900 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500'
                      }`}
                    >
                      <span>进入研读</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Chapter Drawer */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-950/70 space-y-2 text-xs animate-in fade-in duration-150">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 font-semibold">
                      <span>快速跳转与章节缓存状态</span>
                      {onPrecacheAllChapters && !isFullyCached && (
                        <button
                          onClick={() => onPrecacheAllChapters(doc)}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-1"
                        >
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          <span>一键缓存所有章节</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {chapters.map((ch, idx) => {
                        const isChCached = cachedChapterSet.has(ch.id);
                        return (
                          <div
                            key={ch.id || idx}
                            className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition"
                          >
                            <div className="flex items-center space-x-2 min-w-0 pr-2">
                              {isChCached ? (
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="已本地缓存" />
                              ) : (
                                <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" title="未缓存" />
                              )}
                              <span className="font-medium text-slate-800 dark:text-slate-200 truncate" title={ch.title}>
                                {ch.title}
                              </span>
                              <span className="text-[10px] text-slate-600 dark:text-slate-400 font-mono shrink-0">
                                P{ch.startPage}-P{ch.endPage}
                              </span>
                            </div>

                            <button
                              onClick={() => onSelectDoc(doc.id, ch.startPage)}
                              className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold shrink-0 text-[11px] transition"
                            >
                              跳转研读
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
