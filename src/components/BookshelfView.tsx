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
  FileText,
  FolderOpen,
  Settings,
  Edit3,
  Folder,
  FolderTree
} from 'lucide-react';
import { SpecDocument, ChapterItem, UserProfile, BookCategory } from '../types';
import { CategoryManagerModal } from './CategoryManagerModal';

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
  categories: BookCategory[];
  onSaveCategory: (category: BookCategory) => void;
  onDeleteCategory: (categoryId: string) => void;
  onUpdateDocCategory: (docId: string, categoryId: string) => void;
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
  categories,
  onSaveCategory,
  onDeleteCategory,
  onUpdateDocCategory,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  // Filter documents - only show top-level items (no parent)
  const filteredDocs = useMemo(() => {
    // Helper function to check if a document or its children match search
    const matchesSearchRecursive = (doc: SpecDocument): boolean => {
      // Check if current document matches
      const currentMatches =
        !searchQuery ||
        doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.fullName && doc.fullName.toLowerCase().includes(searchQuery.toLowerCase()));

      if (currentMatches) return true;

      // If it's a collection, check children
      if (doc.isCollection) {
        const children = documents.filter(d => d.parentCollectionId === doc.id);
        return children.some(child => matchesSearchRecursive(child));
      }

      return false;
    };

    const topLevelDocs = documents.filter((doc) => {
      // Skip documents that belong to a collection (have parentCollectionId)
      // UNLESS we're searching and this doc or its ancestors match
      if (doc.parentCollectionId && !searchQuery) return false;

      // If searching, show all matching docs regardless of parent
      if (searchQuery) {
        const currentMatches =
          doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (doc.fullName && doc.fullName.toLowerCase().includes(searchQuery.toLowerCase()));

        if (currentMatches) return true;

        // Don't show parent collections unless they or their children match
        if (doc.parentCollectionId) return false;
      }

      const matchesCategory =
        selectedCategory === 'all' || doc.category === selectedCategory;
      const matchesSearch = matchesSearchRecursive(doc);

      return matchesCategory && matchesSearch;
    });

    // Auto-expand collections that have children (on first load or category change)
    topLevelDocs.forEach(doc => {
      if (doc.isCollection) {
        const children = documents.filter(d => d.parentCollectionId === doc.id);
        if (children.length > 0 && !expandedCollections.has(doc.id)) {
          setExpandedCollections(prev => new Set([...prev, doc.id]));
        }
      }
    });

    return topLevelDocs;
  }, [documents, selectedCategory, searchQuery]);

  const toggleExpand = (docId: string) => {
    setExpandedDocId((prev) => (prev === docId ? null : docId));
  };

  const toggleCollectionExpand = (collectionId: string) => {
    setExpandedCollections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(collectionId)) {
        newSet.delete(collectionId);
      } else {
        newSet.add(collectionId);
      }
      return newSet;
    });
  };

  const handleCategoryChange = (docId: string, newCategoryId: string) => {
    onUpdateDocCategory(docId, newCategoryId);
    setEditingDocId(null);
  };

  // Get children of a collection
  const getCollectionChildren = (collectionId: string): SpecDocument[] => {
    return documents.filter(doc => doc.parentCollectionId === collectionId);
  };

  // Render file tree item (folder or document)
  const renderFileTreeItem = (doc: SpecDocument, depth: number): React.ReactNode => {
    const isSelected = doc.id === activeDocId;
    const isExpanded = expandedCollections.has(doc.id);
    const children = doc.isCollection ? getCollectionChildren(doc.id) : [];
    const indent = depth * 12;

    return (
      <div key={doc.id}>
        <div
          className={`flex items-center space-x-2 px-2 py-1.5 rounded-lg cursor-pointer transition group ${
            isSelected
              ? 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
          style={{ paddingLeft: `${8 + indent}px` }}
          onClick={() => {
            if (doc.isCollection) {
              toggleCollectionExpand(doc.id);
            } else {
              onSelectDoc(doc.id, doc.lastReadPage || 1);
            }
          }}
        >
          {/* Expand/Collapse Icon for Collections */}
          {doc.isCollection && (
            <button
              className="shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleCollectionExpand(doc.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Icon */}
          {doc.isCollection ? (
            <Folder className="w-4 h-4 text-amber-500 shrink-0" />
          ) : (
            <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
          )}

          {/* Name */}
          <span className="flex-1 text-xs font-medium truncate" title={doc.name}>
            {doc.name}
          </span>

          {/* Badge for collections */}
          {doc.isCollection && children.length > 0 && (
            <span className="text-[10px] text-slate-400 shrink-0">
              {children.length}
            </span>
          )}
        </div>

        {/* Render children if expanded */}
        {doc.isCollection && isExpanded && children.length > 0 && (
          <div>
            {children.map(child => renderFileTreeItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Render document details in right panel
  const renderDocumentDetails = (): React.ReactNode => {
    const selectedDoc = documents.find(doc => doc.id === activeDocId);

    if (!selectedDoc) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <BookOpen className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
            选择一个文档
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            从左侧文档树中选择一个文档来查看详细信息
          </p>
        </div>
      );
    }

    const chapters = selectedDoc.chapters || [];
    const cachedChapterSet = cachedChaptersMap[selectedDoc.id] || new Set();
    const cachedCount = cachedChapterSet.size;
    const totalChapterCount = Math.max(1, chapters.length);
    const isFullyCached = cachedCount >= totalChapterCount && totalChapterCount > 0;
    const progress = selectedDoc.readingProgress || (selectedDoc.lastReadPage > 1 ? Math.min(100, Math.round((selectedDoc.lastReadPage / selectedDoc.totalPages) * 100)) : 0);

    if (selectedDoc.isCollection) {
      const children = getCollectionChildren(selectedDoc.id);
      return (
        <div className="max-w-4xl">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
            {/* Collection Header */}
            <div className="flex items-start space-x-4 mb-6">
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                <Folder className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                  {selectedDoc.name}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  集合 · 包含 {children.length} 个项目
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {editingDocId === selectedDoc.id ? (
                  <select
                    value={selectedDoc.category}
                    onChange={(e) => handleCategoryChange(selectedDoc.id, e.target.value)}
                    className="text-xs px-2 py-1 rounded border border-indigo-500 bg-white dark:bg-slate-800"
                    autoFocus
                    onBlur={() => setEditingDocId(null)}
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => setEditingDocId(selectedDoc.id)}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-500"
                    title="更改类别"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
                {onDeleteDoc && (
                  <button
                    onClick={() => onDeleteDoc(selectedDoc.id)}
                    className="p-2 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-500"
                    title="删除集合"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Children List */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                包含项目
              </h3>
              {children.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  此集合为空
                </p>
              ) : (
                <div className="space-y-2">
                  {children.map(child => (
                    <div
                      key={child.id}
                      className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition cursor-pointer"
                      onClick={() => onSelectDoc(child.id, child.lastReadPage || 1)}
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        {child.isCollection ? (
                          <Folder className="w-5 h-5 text-amber-500 shrink-0" />
                        ) : (
                          <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {child.name}
                          </p>
                          {!child.isCollection && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {child.totalPages} 页 · {child.fileSize}
                            </p>
                          )}
                        </div>
                      </div>
                      {!child.isCollection && (
                        <ArrowUpRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Regular document details
    return (
      <div className="max-w-4xl">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          {/* Document Header */}
          <div className="flex items-start space-x-4 mb-6">
            <div className="w-16 h-24 rounded-lg bg-gradient-to-br from-slate-800 to-indigo-950 flex flex-col items-center justify-between p-2 border-l-4 border-indigo-400 shrink-0">
              <span className="text-[10px] text-indigo-200 font-bold uppercase tracking-wide">{selectedDoc.category}</span>
              <Cpu className="w-6 h-6 text-indigo-400" />
              <span className="text-[10px] text-slate-200 font-bold uppercase">{selectedDoc.version || 'REV'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                {selectedDoc.name}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                {selectedDoc.fullName || selectedDoc.name}
              </p>
              <div className="flex items-center space-x-4 text-xs">
                <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-300 font-mono">
                  {selectedDoc.totalPages} 页
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {selectedDoc.fileSize}
                </span>
                {isFullyCached ? (
                  <span className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>已缓存</span>
                  </span>
                ) : cachedCount > 0 ? (
                  <span className="flex items-center space-x-1 text-amber-600 dark:text-amber-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{cachedCount}/{totalChapterCount} 章</span>
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {editingDocId === selectedDoc.id ? (
                <select
                  value={selectedDoc.category}
                  onChange={(e) => handleCategoryChange(selectedDoc.id, e.target.value)}
                  className="text-xs px-2 py-1 rounded border border-indigo-500 bg-white dark:bg-slate-800"
                  autoFocus
                  onBlur={() => setEditingDocId(null)}
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  onClick={() => setEditingDocId(selectedDoc.id)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-500"
                  title="更改类别"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
              {onDeleteDoc && (
                <button
                  onClick={() => onDeleteDoc(selectedDoc.id)}
                  className="p-2 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-500"
                  title="删除文档"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
              <span>阅读进度：第 {selectedDoc.lastReadPage} / {selectedDoc.totalPages} 页</span>
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{progress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(2, progress)}%` }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-3 mb-6">
            <button
              onClick={() => onSelectDoc(selectedDoc.id, selectedDoc.lastReadPage || 1)}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition"
            >
              <BookOpen className="w-4 h-4" />
              <span>进入研读</span>
            </button>
            {onPrecacheAllChapters && !isFullyCached && (
              <button
                onClick={() => onPrecacheAllChapters(selectedDoc)}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>缓存所有章节</span>
              </button>
            )}
          </div>

          {/* Chapters */}
          {chapters.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center justify-between">
                <span>章节目录 ({chapters.length})</span>
              </h3>
              <div className="space-y-1.5 max-h-96 overflow-y-auto custom-scrollbar">
                {chapters.map((ch, idx) => {
                  const isChCached = cachedChapterSet.has(ch.id);
                  return (
                    <div
                      key={ch.id || idx}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition cursor-pointer"
                      onClick={() => onSelectDoc(selectedDoc.id, ch.startPage)}
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        {isChCached ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="已缓存" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" title="未缓存" />
                        )}
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {ch.title}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono shrink-0">
                          P{ch.startPage}-{ch.endPage}
                        </span>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render a single document card (recursive for collections)
  return (
    <div className="flex-1 h-full overflow-hidden bg-slate-100 dark:bg-slate-950 flex">
      {/* Left Sidebar: File Tree */}
      <div className="w-80 h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>文档库</span>
            </h2>
            <button
              onClick={() => setIsCategoryManagerOpen(true)}
              className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-500 transition"
              title="管理类别"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索文档..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2 py-1 rounded text-[10px] font-semibold transition ${
                selectedCategory === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              全部
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2 py-1 rounded text-[10px] font-semibold transition ${
                  selectedCategory === cat.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* File Tree */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {searchQuery ? '未找到匹配的文档' : '暂无文档'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredDocs.map((doc) => renderFileTreeItem(doc, 0))}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button
            onClick={onUploadClick}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>导入新书</span>
          </button>
          {onOpenR2SyncModal && (
            <button
              onClick={onOpenR2SyncModal}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition"
            >
              <Cloud className="w-4 h-4" />
              <span>从 R2 同步</span>
            </button>
          )}
        </div>
      </div>

      {/* Right Panel: Document Details */}
      <div className="flex-1 h-full overflow-y-auto custom-scrollbar p-6">
        {renderDocumentDetails()}
      </div>

      {/* Category Manager Modal */}
      <CategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        categories={categories}
        onSaveCategory={onSaveCategory}
        onDeleteCategory={onDeleteCategory}
      />
    </div>
  );
};
