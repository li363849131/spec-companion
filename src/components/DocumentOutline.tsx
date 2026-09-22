import React from 'react';
import { OutlineItem } from '../types';
import { ChevronRight, ChevronDown, CheckCircle2, Bookmark, Layers } from 'lucide-react';

interface DocumentOutlineProps {
  outline: OutlineItem[];
  currentPage: number;
  onSelectPage: (pageNum: number) => void;
  cachedPages: Set<number>;
  totalPages: number;
}

export const DocumentOutline: React.FC<DocumentOutlineProps> = ({
  outline,
  currentPage,
  onSelectPage,
  cachedPages,
  totalPages,
}) => {
  const [collapsedItems, setCollapsedItems] = React.useState<Set<string>>(new Set());

  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderItem = (item: OutlineItem) => {
    const isCurrent = item.pageNumber === currentPage;
    const isCached = cachedPages.has(item.pageNumber);
    const hasChildren = item.children && item.children.length > 0;
    const isCollapsed = collapsedItems.has(item.id);

    return (
      <div key={item.id} className="w-full">
        <div
          onClick={() => onSelectPage(item.pageNumber)}
          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition select-none ${
            isCurrent
              ? 'bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 font-semibold'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
          style={{ paddingLeft: `${Math.max(10, item.level * 14)}px` }}
        >
          <div className="flex items-center space-x-1.5 min-w-0 pr-1">
            {hasChildren ? (
              <button
                onClick={(e) => toggleCollapse(item.id, e)}
                className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            ) : (
              <div className="w-3" />
            )}
            <span className="truncate">{item.title}</span>
          </div>

          <div className="flex items-center space-x-1 shrink-0 ml-1">
            {isCached && (
              <span title="本页已研读并缓存在本地">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              </span>
            )}
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded font-mono ${
                isCurrent
                  ? 'bg-indigo-500 text-white font-bold'
                  : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
              }`}
            >
              P{item.pageNumber}
            </span>
          </div>
        </div>

        {hasChildren && !isCollapsed && (
          <div className="space-y-0.5 mt-0.5">
            {item.children!.map((child) => renderItem(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 select-none">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Bookmark className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            规范章节目录
          </span>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
          共 {totalPages} 页
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
        {outline.length > 0 ? (
          outline.map((item) => renderItem(item))
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            <Layers className="w-6 h-6 mx-auto mb-2 text-slate-400 opacity-60" />
            <span>无内置目录索引</span>
            <p className="mt-1 text-[11px] text-slate-400">可通过底部翻页栏直接跳转页码</p>
          </div>
        )}
      </div>
    </div>
  );
};
