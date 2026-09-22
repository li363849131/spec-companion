import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Zap, 
  Sparkles, 
  Copy, 
  Check, 
  MessageSquare, 
  Edit3, 
  Save, 
  AlertTriangle, 
  Code2, 
  BookMarked,
  Layers,
  ArrowRight,
  Clock,
  RotateCw,
  Square,
  Pause,
  Compass,
  FileText,
  Bookmark
} from 'lucide-react';
import { CachedAnalysis, ChapterAnalysis, ChapterItem } from '../types';

interface SpecAnalysisViewProps {
  analysis: CachedAnalysis | null;
  isAnalyzing: boolean;
  onTriggerAnalyze: () => void;
  onPauseAnalyze?: () => void;
  autoAnalyze?: boolean;
  onToggleAutoAnalyze?: () => void;
  statusMessage?: string | null;
  onOpenQAPanel: (initialQuestion?: string) => void;
  onUpdateNotes: (notes: string) => void;
  userFocus?: string;
  onClearUserFocus?: () => void;
  currentPage: number;
  chapterTitle?: string;
  activeChapter?: ChapterItem | null;
  chapterAnalysis?: ChapterAnalysis | null;
  isAnalyzingChapter?: boolean;
  onTriggerAnalyzeChapter?: (chapter: ChapterItem) => void;
  scope?: 'chapter' | 'page';
  onScopeChange?: (scope: 'chapter' | 'page') => void;
}

export const SpecAnalysisView: React.FC<SpecAnalysisViewProps> = ({
  analysis,
  isAnalyzing,
  onTriggerAnalyze,
  onPauseAnalyze,
  autoAnalyze = false,
  onToggleAutoAnalyze,
  statusMessage,
  onOpenQAPanel,
  onUpdateNotes,
  userFocus,
  onClearUserFocus,
  currentPage,
  chapterTitle,
  activeChapter,
  chapterAnalysis,
  isAnalyzingChapter = false,
  onTriggerAnalyzeChapter,
  scope = 'chapter',
  onScopeChange,
}) => {
  const [internalScope, setInternalScope] = useState<'chapter' | 'page'>(scope);
  const [copied, setCopied] = useState<boolean>(false);
  const [isEditingNotes, setIsEditingNotes] = useState<boolean>(false);
  const [notesDraft, setNotesDraft] = useState<string>('');

  React.useEffect(() => {
    if (scope) setInternalScope(scope);
  }, [scope]);

  const handleScopeSelect = (newScope: 'chapter' | 'page') => {
    setInternalScope(newScope);
    if (onScopeChange) onScopeChange(newScope);
  };

  // Determine current active analysis content based on scope
  const activeContent = internalScope === 'chapter' 
    ? chapterAnalysis?.markdownContent 
    : analysis?.markdownContent;

  const currentNotes = internalScope === 'chapter'
    ? (chapterAnalysis?.customNotes || '')
    : (analysis?.customNotes || '');

  // Keep notesDraft in sync
  React.useEffect(() => {
    setNotesDraft(currentNotes);
  }, [currentNotes, chapterAnalysis?.id, analysis?.id]);

  const handleCopy = () => {
    if (!activeContent) return;
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveNotes = () => {
    onUpdateNotes(notesDraft);
    setIsEditingNotes(false);
  };

  const isCurrentlyBusy = isAnalyzingChapter || isAnalyzing;

  return (
    <div className="flex-1 h-full flex flex-col bg-white dark:bg-slate-900 overflow-hidden text-slate-800 dark:text-slate-200 select-text">
      {/* Top Status & Context Header */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>AI 架构师 · 深度研读讲解</span>
            </span>
          </div>

          {/* Action buttons & Auto-Analyze Toggle */}
          <div className="flex items-center space-x-2">
            {onToggleAutoAnalyze && (
              <button
                id="panel-toggle-auto-analyze"
                onClick={onToggleAutoAnalyze}
                className={`inline-flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium border transition ${
                  autoAnalyze
                    ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                }`}
                title={autoAnalyze ? '已开启：翻到新章节/页面自动研读' : '已关闭：仅手动点击时研读'}
              >
                <Zap className={`w-3 h-3 ${autoAnalyze ? 'text-amber-500 fill-amber-500' : 'text-slate-400'}`} />
                <span className="hidden sm:inline">{autoAnalyze ? '自动研读: 开' : '自动研读: 关'}</span>
              </button>
            )}

            {isCurrentlyBusy && onPauseAnalyze && (
              <button
                id="btn-pause-analysis-header"
                onClick={onPauseAnalyze}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-semibold transition"
                title="暂停/中断当前正在执行的研读分析"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>中断研读</span>
              </button>
            )}

            {activeContent && (
              <>
                <button
                  onClick={handleCopy}
                  className="flex items-center space-x-1 px-2 py-1 rounded text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                  title="复制解读 Markdown"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>复制解读</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => onOpenQAPanel()}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 text-xs font-medium border border-indigo-200 dark:border-indigo-800 transition"
                  title="向老架构师追问细节"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>提问</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Scope Tabs: Chapter Analysis vs Page Analysis */}
        <div className="mt-2.5 flex items-center justify-between">
          <div className="flex items-center bg-slate-200/80 dark:bg-slate-800/80 rounded-lg p-0.5 border border-slate-300 dark:border-slate-700 text-xs">
            <button
              onClick={() => handleScopeSelect('chapter')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-md font-semibold transition ${
                internalScope === 'chapter'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>本章架构深度剖析</span>
              {chapterAnalysis && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-1" />}
            </button>
            <button
              onClick={() => handleScopeSelect('page')}
              className={`flex items-center space-x-1 px-3 py-1 rounded-md font-semibold transition ${
                internalScope === 'page'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>本页细节精讲</span>
              {analysis && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-1" />}
            </button>
          </div>

          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {internalScope === 'chapter' && activeChapter
              ? `[P${activeChapter.startPage}-P${activeChapter.endPage}]`
              : `[第 ${currentPage} 页]`}
          </span>
        </div>

        {/* Cache status badge */}
        {(internalScope === 'chapter' ? chapterAnalysis : analysis) ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-medium">
              <Zap className="w-3 h-3 text-emerald-500 fill-emerald-500" />
              <span>
                {internalScope === 'chapter' ? '本章已本地秒开 (Cache Hit)' : '本页已本地缓存 (Cache Hit)'}
              </span>
            </div>
            <span className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center space-x-1">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>
                {new Date((internalScope === 'chapter' ? chapterAnalysis?.createdAt : analysis?.createdAt) || Date.now()).toLocaleTimeString()} 缓存
              </span>
            </span>
          </div>
        ) : null}

        {/* Status Message (e.g. paused/interrupted) */}
        {statusMessage && !isCurrentlyBusy && (
          <div className="mt-2 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs flex items-center space-x-2 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="flex-1">{statusMessage}</span>
          </div>
        )}

        {/* User Focus Alert Banner */}
        {userFocus && (
          <div className="mt-2.5 px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs flex items-center justify-between text-amber-800 dark:text-amber-300">
            <div className="flex items-center space-x-2 truncate">
              <span className="font-bold shrink-0">📌 重点关注:</span>
              <span className="truncate italic">"{userFocus}"</span>
            </div>
            {onClearUserFocus && (
              <button
                onClick={onClearUserFocus}
                className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline shrink-0 ml-2"
              >
                清除
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
        {isCurrentlyBusy ? (
          // Loading Skeleton with Engineering Tips and Interrupt/Pause Button
          <div className="py-12 px-4 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border-2 border-indigo-500/30 flex items-center justify-center animate-pulse">
                <Sparkles className="w-7 h-7 text-indigo-500 animate-spin" />
              </div>
            </div>
            <div className="space-y-1.5 max-w-md">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {internalScope === 'chapter'
                  ? `AI 资深架构师正在研读本章：${activeChapter?.title || '当前章节'}...`
                  : `AI 资深架构师正在研读第 ${currentPage} 页图文...`}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                正在多模态梳理时序状态机、寄存器位域读写边界，并结合 Linux 内核与工业界实战 Errata 进行系统级深度剖析...
              </p>
            </div>
            <div className="w-full max-w-sm bg-slate-100 dark:bg-slate-800/60 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-500 via-cyan-400 to-indigo-500 h-full w-2/3 animate-pulse rounded-full" />
            </div>

            {/* Interrupt / Pause Action Button */}
            {onPauseAnalyze && (
              <div className="pt-3">
                <button
                  id="btn-pause-analysis-body"
                  onClick={onPauseAnalyze}
                  className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-semibold shadow-sm transition cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>暂停 / 中断当前研读</span>
                </button>
              </div>
            )}
          </div>
        ) : activeContent ? (
          // Markdown Rendered Expert Explanation
          <div className="space-y-6">
            {/* Chapter header pill if in chapter scope */}
            {internalScope === 'chapter' && activeChapter && (
              <div className="p-3 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    当前章节覆盖页码 P{activeChapter.startPage} - P{activeChapter.endPage}
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {activeChapter.title}
                  </div>
                </div>
                {onTriggerAnalyzeChapter && (
                  <button
                    onClick={() => onTriggerAnalyzeChapter(activeChapter)}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-50 shadow-sm"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>重新研读本章</span>
                  </button>
                )}
              </div>
            )}

            <div className="markdown-body prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed prose-headings:font-bold prose-headings:text-slate-900 dark:prose-headings:text-slate-100 prose-h1:text-base prose-h1:border-b prose-h1:pb-2 prose-h2:text-sm prose-h3:text-sm prose-code:font-mono prose-code:text-xs prose-code:bg-slate-100 dark:prose-code:bg-slate-800/80 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800 prose-pre:text-slate-200">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {activeContent}
              </ReactMarkdown>
            </div>

            {/* Engineer's Personal Notes & Errata Scratchpad */}
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <BookMarked className="w-4 h-4 text-amber-500" />
                  <span>我的工程踩坑与调试随笔 ({internalScope === 'chapter' ? '本章笔记' : '本页笔记'})</span>
                </div>
                {!isEditingNotes && (
                  <button
                    onClick={() => setIsEditingNotes(true)}
                    className="flex items-center space-x-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{notesDraft ? '编辑笔记' : '添加随笔'}</span>
                  </button>
                )}
              </div>

              {isEditingNotes ? (
                <div className="space-y-2">
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="记录该模块在流片中的 Errata、时钟频率限制、或驱动补丁调试心得..."
                    className="w-full h-24 p-2.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => {
                        setNotesDraft(currentNotes);
                        setIsEditingNotes(false);
                      }}
                      className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveNotes}
                      className="flex items-center space-x-1 px-3 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-sm"
                    >
                      <Save className="w-3 h-3" />
                      <span>保存笔记</span>
                    </button>
                  </div>
                </div>
              ) : notesDraft ? (
                <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {notesDraft}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  暂无笔记。点击“添加随笔”记录针对当前模块或寄存器的工程调试经验。
                </p>
              )}
            </div>
          </div>
        ) : (
          // Idle State: Prompt user to trigger chapter or page explanation
          <div className="py-12 px-4 text-center space-y-5 max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400">
              <Layers className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                {internalScope === 'chapter' ? '本章节尚未进行深度研读' : '本页尚未研读解析'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {internalScope === 'chapter'
                  ? `当前在【${activeChapter?.title || '本章节'}】(覆盖第 ${activeChapter?.startPage || currentPage} 至 ${activeChapter?.endPage || currentPage} 页)。点击下方按钮即可让 AI 对整章进行系统化纵向剖析并本地高速缓存！`
                  : '点击下方按钮，由资深体系结构与固件专家为您拆解本页规范：扫除前置背景、精讲位域逻辑、展示 Linux 内核代码并指出避坑要点。'}
              </p>
            </div>

            {internalScope === 'chapter' ? (
              <button
                id="btn-trigger-chapter-analyze"
                onClick={() => {
                  if (activeChapter && onTriggerAnalyzeChapter) {
                    onTriggerAnalyzeChapter(activeChapter);
                  } else {
                    onTriggerAnalyze();
                  }
                }}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>研读本章：{activeChapter?.title ? activeChapter.title.slice(0, 24) + '...' : '当前章节'}</span>
              </button>
            ) : (
              <button
                id="btn-trigger-page-analyze"
                onClick={onTriggerAnalyze}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition active:scale-95"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>立即研读第 {currentPage} 页</span>
              </button>
            )}

            {/* Feature Highlights Card */}
            <div className="mt-8 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-left space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                💡 为什么推荐【按章节研读】？
              </div>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>全局时序串联</strong>：跨越多页讲透协议握手状态机</li>
                <li><strong>本地零延迟秒开</strong>：全章一次分析，后续连续翻页秒读</li>
                <li><strong>无缝沉浸阅读</strong>：滑动到新章节自动切换讲解内容</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

