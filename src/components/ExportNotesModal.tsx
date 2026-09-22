import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Copy, 
  Check, 
  FileText, 
  BookOpen, 
  Sparkles,
  Layers,
  Calendar
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SpecDocument, CachedAnalysis } from '../types';
import { getAllCachedForDoc } from '../lib/db';

interface ExportNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: SpecDocument;
}

export const ExportNotesModal: React.FC<ExportNotesModalProps> = ({
  isOpen,
  onClose,
  document: doc,
}) => {
  const [cachedItems, setCachedItems] = useState<CachedAnalysis[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [compiledMarkdown, setCompiledMarkdown] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'raw'>('preview');

  // Load all cached analyses for this document
  useEffect(() => {
    if (isOpen) {
      getAllCachedForDoc(doc.id).then((items) => {
        setCachedItems(items);
        // By default select all read pages
        setSelectedPages(new Set(items.map((i) => i.pageNum)));
      });
    }
  }, [isOpen, doc.id]);

  // Compile combined Markdown whenever selection changes
  useEffect(() => {
    const selectedList = cachedItems.filter((item) => selectedPages.has(item.pageNum));
    selectedList.sort((a, b) => a.pageNum - b.pageNum);

    let md = `# ${doc.fullName || doc.name} · 架构与驱动精读笔记\n\n`;
    md += `> 📅 导出日期：${new Date().toLocaleDateString()} | 📚 文档版本：${doc.version || 'v1.0'} | 💡 研读页数：${selectedList.length} / ${doc.totalPages} 页\n\n`;
    md += `---\n\n`;

    md += `## 📑 已读章节导览目录\n\n`;
    selectedList.forEach((item) => {
      md += `- [第 ${item.pageNum} 页：${item.chapterTitle || '未命名章节'}](#page-${item.pageNum})\n`;
    });
    md += `\n---\n\n`;

    selectedList.forEach((item) => {
      md += `<a id="page-${item.pageNum}"></a>\n\n`;
      md += `## 【第 ${item.pageNum} 页】${item.chapterTitle || doc.name}\n\n`;
      md += `${item.markdownContent}\n\n`;

      if (item.customNotes) {
        md += `### 📌 工程师实战调试心得与 Errata 笔记\n`;
        md += `> ${item.customNotes.replace(/\n/g, '\n> ')}\n\n`;
      }
      md += `---\n\n`;
    });

    md += `\n*由 Spec Companion (芯片与协议Spec精读伴侣) 自动生成于 ${new Date().toLocaleString()}*\n`;
    setCompiledMarkdown(md);
  }, [cachedItems, selectedPages, doc]);

  if (!isOpen) return null;

  const togglePageSelection = (pageNum: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPages(new Set(cachedItems.map((i) => i.pageNum)));
  };

  const deselectAll = () => {
    setSelectedPages(new Set());
  };

  const handleDownload = () => {
    const blob = new Blob([compiledMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    const safeDocName = doc.name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
    link.download = `${safeDocName}_Spec精读笔记_${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(compiledMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-text">
      <div 
        className="w-full max-w-4xl h-[88vh] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-950/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                <span>导出全书已读 Markdown 读书笔记</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-normal">
                  已收录 {cachedItems.length} 页
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {doc.fullName || doc.name}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-500 font-semibold">已复制全文</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>复制 Markdown</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载 .md 文件</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter and Tab Bar */}
        <div className="px-6 py-2.5 bg-slate-100/60 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between text-xs gap-2 shrink-0">
          <div className="flex items-center space-x-3">
            <span className="text-slate-500 font-medium">包含页面：</span>
            <div className="flex items-center space-x-1">
              <button
                onClick={selectAll}
                className="px-2 py-0.5 rounded text-[11px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
              >
                全选
              </button>
              <button
                onClick={deselectAll}
                className="px-2 py-0.5 rounded text-[11px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
              >
                清空
              </button>
            </div>

            {/* Checkbox pills */}
            <div className="flex flex-wrap items-center gap-1.5 max-h-16 overflow-y-auto">
              {cachedItems.map((item) => {
                const isSelected = selectedPages.has(item.pageNum);
                return (
                  <button
                    key={item.pageNum}
                    onClick={() => togglePageSelection(item.pageNum)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition border ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400'
                    }`}
                  >
                    P{item.pageNum}
                  </button>
                );
              })}
            </div>
          </div>

          {/* View toggle */}
          <div className="flex items-center space-x-1 bg-slate-200 dark:bg-slate-800 p-0.5 rounded-md">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                activeTab === 'preview'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              富文本预览
            </button>
            <button
              onClick={() => setActiveTab('raw')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                activeTab === 'raw'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              原始 Markdown
            </button>
          </div>
        </div>

        {/* Content Preview Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50 dark:bg-slate-950/40">
          {cachedItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3 text-slate-400">
              <FileText className="w-12 h-12 stroke-[1.5] text-slate-400" />
              <h3 className="text-sm font-semibold">当前文档尚无已解析页面</h3>
              <p className="text-xs max-w-sm">
                在左侧翻阅并研读任意规范页面后，此处将自动汇编您读过的所有章节与工程笔记。
              </p>
            </div>
          ) : activeTab === 'preview' ? (
            <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 p-8 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800">
              <div className="markdown-body prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {compiledMarkdown}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              <textarea
                readOnly
                value={compiledMarkdown}
                className="w-full h-[600px] p-4 font-mono text-xs bg-slate-900 text-slate-100 rounded-lg border border-slate-800 focus:outline-none custom-scrollbar leading-relaxed"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
