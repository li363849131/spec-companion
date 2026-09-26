import React, { useEffect, useRef, useState, useCallback } from 'react';
import { pdfjsLib } from '../lib/pdfWorker';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MessageSquareShare,
  Target,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Maximize2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ScrollText,
  BookOpen,
  Compass,
  Sparkles
} from 'lucide-react';
import { SpecDocument, PresetSpecPage, PresetSpec, ChapterItem } from '../types';
import { isBufferDetached } from '../lib/db';

interface PdfViewerProps {
  document: SpecDocument;
  currentPage: number;
  onPageChange: (pageNum: number) => void;
  presetPageData?: PresetSpecPage;
  presetSpec?: PresetSpec;
  activeChapter?: ChapterItem | null;
  onDeepDiveQuestion: (selectedText: string) => void;
  onSetUserFocus: (selectedText: string) => void;
  onCaptureSnapshot: (dataUrl: string, extractedText: string) => void;
  isOutlineOpen: boolean;
  onToggleOutline: () => void;
  viewMode?: 'single' | 'continuous';
  onViewModeChange?: (mode: 'single' | 'continuous') => void;
}

// ─── ContinuousPdfPage: self-contained page card that renders its own canvas ───
interface ContinuousPdfPageProps {
  pageNum: number;
  pdfDoc: any;
  scale: number;
  isCurrentPage: boolean;
  docName: string;
  totalPages: number;
}

const ContinuousPdfPage: React.FC<ContinuousPdfPageProps> = ({
  pageNum, pdfDoc, scale, isCurrentPage, docName, totalPages,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const viewport = page.getViewport({ scale: scale * 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.width = `${viewport.width / 1.5}px`;
        canvas.style.height = `${viewport.height / 1.5}px`;

        const renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        if (!cancelled) setRendered(true);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNum} render error:`, err);
        }
      }
    };

    render();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, scale]);

  return (
    <div
      data-page-num={pageNum}
      id={`pdf-page-${pageNum}`}
      className={`w-full bg-white dark:bg-slate-900 border rounded-lg shadow-sm transition-all ${
        isCurrentPage
          ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800">
        <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[60%]">{docName}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
          isCurrentPage ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
        }`}>
          {pageNum} / {totalPages}
        </span>
      </div>
      <div className="flex justify-center p-2 overflow-x-auto bg-slate-50 dark:bg-slate-950/50">
        {!rendered && (
          <div className="flex items-center justify-center h-48 text-slate-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="block max-w-full"
          style={{ display: rendered ? 'block' : 'none' }}
        />
      </div>
    </div>
  );
};
export const PdfViewer: React.FC<PdfViewerProps> = ({
  document: doc,
  currentPage,
  onPageChange,
  presetPageData,
  presetSpec,
  activeChapter,
  onDeepDiveQuestion,
  onSetUserFocus,
  onCaptureSnapshot,
  isOutlineOpen,
  onToggleOutline,
  viewMode = 'continuous',
  onViewModeChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const presetContentRef = useRef<HTMLDivElement>(null);
  const currentRenderTaskRef = useRef<any>(null);

  const [scale, setScale] = useState<number>(1.1);
  const [internalViewMode, setInternalViewMode] = useState<'single' | 'continuous'>(viewMode);
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState<string>(String(currentPage));

  // Sync internal mode with prop if provided
  useEffect(() => {
    if (viewMode) setInternalViewMode(viewMode);
  }, [viewMode]);

  const handleModeChange = (mode: 'single' | 'continuous') => {
    setInternalViewMode(mode);
    if (onViewModeChange) onViewModeChange(mode);
    // When switching back to single page, force a re-render of the canvas
    if (mode === 'single') {
      setTimeout(() => {
        if (pdfDoc) renderPdfPage();
      }, 50);
    }
  };

  // Track programmatic scrolls so we don't fight the scroll handler
  const isProgrammaticScrollRef = useRef(false);

  // Scroll to current page in continuous mode
  const lastScrolledPageRef = useRef<number>(-1);
  useEffect(() => {
    if (internalViewMode === 'continuous' && scrollViewportRef.current && lastScrolledPageRef.current !== currentPage) {
      lastScrolledPageRef.current = currentPage;
      const targetEl = scrollViewportRef.current.querySelector(`[data-page-num="${currentPage}"]`);
      if (targetEl) {
        isProgrammaticScrollRef.current = true;
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // Release the lock after scroll settles
        setTimeout(() => { isProgrammaticScrollRef.current = false; }, 600);
      }
    }
  }, [currentPage, internalViewMode]);

  // Keep page input in sync
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Load custom PDF if available
  useEffect(() => {
    let isCancelled = false;
    setPdfLoadError(null);

    if (doc.pdfBuffer || doc.pdfData) {
      setIsLoadingPdf(true);

      try {
        let source: any;
        if (doc.pdfBuffer) {
          if (isBufferDetached(doc.pdfBuffer)) {
            console.warn('doc.pdfBuffer is detached or invalid');
            setPdfLoadError('PDF 数据已被释放，请重新导入此文档');
            setIsLoadingPdf(false);
            return;
          }
          // Pass a sliced clone to prevent detach and supply CMap/Fonts
          const clonedBuffer = doc.pdfBuffer.slice(0);
          source = {
            data: new Uint8Array(clonedBuffer),
            cMapPacked: true,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
            standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
          };
        } else {
          source = {
            url: doc.pdfData,
            cMapPacked: true,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
            standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
          };
        }

        const loadingTask = pdfjsLib.getDocument(source);

        loadingTask.promise.then(
          (loadedPdf) => {
            if (!isCancelled) {
              setPdfDoc(loadedPdf);
              setIsLoadingPdf(false);
            }
          },
          (error) => {
            console.error('Error loading PDF document:', error);
            if (!isCancelled) {
              setPdfLoadError(error?.message || 'PDF 解析失败，请确认文件完整有效');
              setIsLoadingPdf(false);
            }
          }
        );
      } catch (err: any) {
        console.error('Exception setting up PDF document:', err);
        if (!isCancelled) {
          setPdfLoadError(err?.message || 'PDF 加载出错');
          setIsLoadingPdf(false);
        }
      }
    } else {
      setPdfDoc(null);
      setIsLoadingPdf(false);
    }
    return () => {
      isCancelled = true;
    };
  }, [doc.id, doc.pdfBuffer, doc.pdfData, doc.category]);

  // Render PDF Page when page or zoom changes (for both single and continuous modes)
  const renderPdfPage = useCallback(async (pageNum?: number) => {
    if (!pdfDoc) return;

    const targetPage = pageNum || currentPage;

    // If canvas ref is not yet mounted in the DOM, schedule retry on next animation frame
    const targetCanvas = pageNum ?
      document.querySelector(`canvas[data-page-num="${pageNum}"]`) as HTMLCanvasElement :
      canvasRef.current;

    if (!targetCanvas) {
      requestAnimationFrame(() => {
        const retryCanvas = pageNum ?
          document.querySelector(`canvas[data-page-num="${pageNum}"]`) as HTMLCanvasElement :
          canvasRef.current;
        if (retryCanvas) {
          renderPdfPage(pageNum);
        }
      });
      return;
    }

    setIsRenderingPage(true);
    setPdfLoadError(null);

    try {
      const validPage = Math.max(1, Math.min(targetPage, pdfDoc.numPages || 1));
      const page = await pdfDoc.getPage(validPage);
      const canvas = targetCanvas;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const viewport = page.getViewport({ scale: scale * 1.5 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.width = `${viewport.width / 1.5}px`;
      canvas.style.height = `${viewport.height / 1.5}px`;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      const renderTask = page.render(renderContext);
      currentRenderTaskRef.current = renderTask;

      await renderTask.promise;
      currentRenderTaskRef.current = null;

      // Extract text content for text layer and multimodal context safely
      try {
        const textContent = await page.getTextContent();
        const extractedText = textContent.items
          .map((item: any) => item.str || '')
          .join(' ');

        // Use JPEG snapshot (much lighter than PNG, prevents network choke)
        const snapshot = canvas.toDataURL('image/jpeg', 0.82);
        onCaptureSnapshot(snapshot, extractedText);

        // Render text layer for text selection
        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = '';
          textLayerRef.current.style.width = `${viewport.width / 1.5}px`;
          textLayerRef.current.style.height = `${viewport.height / 1.5}px`;

          textContent.items.forEach((item: any) => {
            if (!item.str) return;
            const span = window.document.createElement('span');
            span.textContent = item.str + ' ';
            span.className = 'pdf-text-item select-text inline cursor-text hover:bg-indigo-100/30';
            textLayerRef.current?.appendChild(span);
          });
        }
      } catch (textErr) {
        console.warn('Text extraction minor warning:', textErr);
        const snapshot = canvas.toDataURL('image/jpeg', 0.82);
        onCaptureSnapshot(snapshot, '');
      }
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Failed to render PDF page:', err);
        setPdfLoadError('渲染本页失败: ' + (err?.message || '未知异常'));
      }
    } finally {
      setIsRenderingPage(false);
    }
  }, [pdfDoc, currentPage, scale, onCaptureSnapshot]);

  // Check if this is a custom uploaded PDF (not a preset spec)
  const isCustomPdf = !presetSpec || !presetSpec.pages || presetSpec.pages.length === 0;

  useEffect(() => {
    if (pdfDoc) {
      renderPdfPage();
    }
  }, [pdfDoc, currentPage, scale, renderPdfPage]);

  // For Presets: capture snapshot from SVG/preset content
  useEffect(() => {
    if (doc.category !== 'custom' && presetPageData) {
      // Pass the text content and a generated canvas representation
      const timer = setTimeout(() => {
        try {
          const offscreenCanvas = window.document.createElement('canvas');
          offscreenCanvas.width = 800;
          offscreenCanvas.height = 1000;
          const ctx = offscreenCanvas.getContext('2d');
          if (ctx) {
            // Draw clean background and page heading for AI vision
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 800, 1000);
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText(doc.name, 40, 50);
            ctx.fillStyle = '#334155';
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText(`${presetPageData.sectionNumber} ${presetPageData.pageHeading}`, 40, 90);
            ctx.fillStyle = '#64748b';
            ctx.font = '14px sans-serif';
            ctx.fillText(presetPageData.summary, 40, 125);
            ctx.fillStyle = '#1e293b';
            ctx.font = '13px monospace';
            const lines = presetPageData.text.split('\n').slice(0, 20);
            lines.forEach((line, idx) => {
              ctx.fillText(line.slice(0, 75), 40, 170 + idx * 22);
            });
            const dataUrl = offscreenCanvas.toDataURL('image/png');
            onCaptureSnapshot(dataUrl, presetPageData.text);
          }
        } catch (e) {
          onCaptureSnapshot('', presetPageData.text);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [doc.id, doc.category, presetPageData, currentPage, onCaptureSnapshot]);

  // Handle Text Selection for Floating Toolbar
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectedText('');
      setSelectionPosition(null);
      return;
    }

    const text = selection.toString().trim();
    if (text.length > 2) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectedText(text);
      setSelectionPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      });
    } else {
      setSelectedText('');
      setSelectionPosition(null);
    }
  };

  // Page Jump handler
  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= doc.totalPages) {
      onPageChange(pageNum);
      if (internalViewMode === 'continuous' && scrollViewportRef.current) {
        const targetEl = scrollViewportRef.current.querySelector(`[data-page-num="${pageNum}"]`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    } else {
      setPageInput(String(currentPage));
    }
  };

  // Continuous scroll listener to detect visible page and active chapter
  const handleContinuousScroll = useCallback(() => {
    if (internalViewMode !== 'continuous' || !scrollViewportRef.current) return;
    // Don't update page during programmatic scrolls (e.g. outline click)
    if (isProgrammaticScrollRef.current) return;
    const container = scrollViewportRef.current;
    const pageElements = container.querySelectorAll('[data-page-num]');
    const containerRect = container.getBoundingClientRect();
    const triggerOffset = containerRect.top + 140;

    for (let i = 0; i < pageElements.length; i++) {
      const el = pageElements[i] as HTMLElement;
      const rect = el.getBoundingClientRect();
      if (rect.top <= triggerOffset && rect.bottom >= triggerOffset) {
        const pageNum = parseInt(el.getAttribute('data-page-num') || '1', 10);
        if (pageNum !== currentPage) {
          onPageChange(pageNum);
        }
        break;
      }
    }
  }, [internalViewMode, currentPage, onPageChange]);

  return (
    <div
      ref={containerRef}
      onMouseUp={handleMouseUp}
      className="relative flex-1 h-full flex flex-col bg-slate-100 dark:bg-slate-950 overflow-hidden select-text border-r border-slate-200 dark:border-slate-800"
    >
      {/* Top Document Toolbar */}
      <div className="h-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 z-10 shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <button
            onClick={onToggleOutline}
            className={`p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0 ${
              isOutlineOpen ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40' : 'text-slate-500'
            }`}
            title={isOutlineOpen ? '收起目录' : '展开目录'}
          >
            {isOutlineOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>

          {/* Active Chapter Badge */}
          {activeChapter && (
            <span className="hidden sm:inline-flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 shrink-0">
              <Compass className="w-3 h-3 text-indigo-500" />
              <span>P{activeChapter.startPage}-P{activeChapter.endPage}</span>
            </span>
          )}

          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[160px] sm:max-w-[280px]">
            {activeChapter?.title || presetPageData?.chapterTitle || doc.name}
          </span>
        </div>

        {/* View Mode & Zoom controls */}
        <div className="flex items-center space-x-1.5">
          {/* Layout Mode Switcher (Continuous vs Single) */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => handleModeChange('continuous')}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-semibold transition ${
                internalViewMode === 'continuous'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="连续滚动版式：上下滑动连续浏览，跨章节自动同步右侧讲解"
            >
              <ScrollText className="w-3.5 h-3.5" />
              <span className="hidden md:inline">连续滚动</span>
            </button>
            <button
              onClick={() => handleModeChange('single')}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-semibold transition ${
                internalViewMode === 'single'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="单页专注版式：单页翻阅"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden md:inline">单页翻页</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

          {/* Zoom controls */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setScale((s) => Math.max(0.7, s - 0.1))}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
              title="缩小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] w-10 text-center text-slate-500">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => Math.min(2.0, s + 0.1))}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
              title="放大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setScale(1.1)}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
              title="还原缩放"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Viewport Content */}
      <div
        ref={scrollViewportRef}
        onScroll={handleContinuousScroll}
        className="flex-1 overflow-auto p-4 flex flex-col items-center custom-scrollbar space-y-6"
      >
        {isCustomPdf ? (
          // ── Custom uploaded PDF (no preset rich-text pages) ──────────────
          pdfDoc && internalViewMode === 'continuous' ? (
            <div className="w-full max-w-4xl space-y-4">
              {(() => {
                // Virtual scrolling: only render visible pages + buffer
                const totalPages = pdfDoc.numPages;
                const bufferPages = 5; // Render 5 pages before and after visible area
                const startPage = Math.max(1, currentPage - bufferPages);
                const endPage = Math.min(totalPages, currentPage + bufferPages);

                return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map((pageNum) => (
                  <ContinuousPdfPage
                    key={pageNum}
                    pageNum={pageNum}
                    pdfDoc={pdfDoc}
                    scale={scale}
                    isCurrentPage={pageNum === currentPage}
                    docName={doc.name}
                    totalPages={pdfDoc.numPages}
                  />
                ));
              })()}
            </div>
          ) : pdfDoc ? (
            // Single page mode
            <div
              data-page-num={currentPage}
              className="relative shadow-xl rounded-md bg-white border border-slate-300 dark:border-slate-800 overflow-hidden min-w-[320px] min-h-[460px] flex items-center justify-center transition-transform origin-top"
              style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
            >
              {(isLoadingPdf || isRenderingPage) && (
                <div className="absolute inset-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-[1.5px] flex flex-col items-center justify-center space-y-3 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {isLoadingPdf ? '正在载入高保真 PDF 页面...' : `正在渲染第 ${currentPage} 页...`}
                  </p>
                </div>
              )}
              {pdfLoadError ? (
                <div className="w-[500px] h-[360px] flex flex-col items-center justify-center space-y-3 text-center p-6">
                  <AlertCircle className="w-12 h-12 text-rose-500" />
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">PDF 渲染或解析出现异常</h4>
                  <p className="text-xs text-rose-600 dark:text-rose-400 max-w-sm">{pdfLoadError}</p>
                  <button
                    onClick={() => { setPdfLoadError(null); renderPdfPage(); }}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>重新尝试渲染</span>
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <canvas ref={canvasRef} className="block" />
                  <div
                    ref={textLayerRef}
                    className="absolute inset-0 select-text pointer-events-auto leading-relaxed overflow-hidden text-transparent"
                    style={{ userSelect: 'text' }}
                  />
                </div>
              )}
            </div>
          ) : (
            // PDF not loaded yet
            <div className="flex items-center justify-center h-96 text-slate-400">
              {isLoadingPdf ? <Loader2 className="w-8 h-8 animate-spin" /> : <p>无法加载 PDF</p>}
            </div>
          )
        ) : (
          // ── Preset spec with rich text pages ──────────────────────────────
          (internalViewMode === 'continuous' && presetSpec?.pages && presetSpec.pages.length > 0) ? (
            <div className="w-full max-w-3xl space-y-8">
              {presetSpec.pages.map((pg) => {
                const isCurrent = pg.pageNum === currentPage;
                return (
                  <div
                    key={pg.pageNum}
                    data-page-num={pg.pageNum}
                    id={`page-card-${pg.pageNum}`}
                    className={`w-full bg-white dark:bg-slate-900 border rounded-lg shadow-sm p-6 sm:p-8 space-y-6 transition-all origin-top ${
                      isCurrent
                        ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                        : 'border-slate-200 dark:border-slate-800 opacity-95'
                    }`}
                    style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
                  >
                    <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-mono mb-1.5">
                        <span>{doc.fullName}</span>
                        <span className={`px-2 py-0.5 rounded font-bold ${isCurrent ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                          PAGE {pg.pageNum} OF {doc.totalPages}
                        </span>
                      </div>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                        {pg.sectionNumber} {pg.pageHeading}
                      </h2>
                      <p className="text-xs text-indigo-700 dark:text-indigo-400 font-medium mt-1">{pg.summary}</p>
                    </div>
                    {pg.diagramSvg && (
                      <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 shadow-inner">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-2">
                          <span>FIGURE {pg.sectionNumber}-1</span>
                          <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">Vector Interactive</span>
                        </div>
                        <div className="w-full overflow-x-auto" dangerouslySetInnerHTML={{ __html: pg.diagramSvg }} />
                      </div>
                    )}
                    <div className="space-y-3 text-slate-700 dark:text-slate-300 text-sm leading-relaxed font-sans">
                      {pg.text.split('\n\n').map((paragraph, idx) => (
                        <p key={idx} className="whitespace-pre-line">{paragraph}</p>
                      ))}
                    </div>
                    {pg.tableData && (
                      <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
                        <div className="bg-slate-100 dark:bg-slate-800/80 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300">{pg.tableData.title}</div>
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                            <tr>{pg.tableData.headers.map((h, i) => <th key={i} className="p-2.5 font-semibold">{h}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                            {pg.tableData.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                {row.map((cell, cIdx) => <td key={cIdx} className="p-2.5 font-mono text-[11px]">{cell}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                      <span>CONFIDENTIAL & PROPRIETARY · HARDWARE SPECIFICATION</span>
                      <span>SECTION {pg.sectionNumber}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Single page preset view
            <div
              ref={presetContentRef}
              data-page-num={currentPage}
              className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm p-6 sm:p-8 space-y-6 transition-transform origin-top"
              style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
            >
              <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-mono mb-1.5">
                  <span>{doc.fullName}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                    PAGE {currentPage} OF {doc.totalPages}
                  </span>
                </div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  {presetPageData?.sectionNumber} {presetPageData?.pageHeading}
                </h1>
                <p className="text-xs text-indigo-700 dark:text-indigo-400 font-medium mt-1">{presetPageData?.summary}</p>
              </div>
              {presetPageData?.diagramSvg && (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 shadow-inner">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-2">
                    <span>FIGURE {presetPageData.sectionNumber}-1: HARDWARE LOGIC / BITFIELD SCHEMATIC</span>
                    <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">Vector Interactive</span>
                  </div>
                  <div className="w-full overflow-x-auto" dangerouslySetInnerHTML={{ __html: presetPageData.diagramSvg }} />
                </div>
              )}
              <div className="space-y-3 text-slate-700 dark:text-slate-300 text-sm leading-relaxed font-sans">
                {presetPageData?.text.split('\n\n').map((paragraph, idx) => (
                  <p key={idx} className="whitespace-pre-line">{paragraph}</p>
                ))}
              </div>
              {presetPageData?.tableData && (
                <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
                  <div className="bg-slate-100 dark:bg-slate-800/80 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300">{presetPageData.tableData.title}</div>
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <tr>{presetPageData.tableData.headers.map((h, i) => <th key={i} className="p-2.5 font-semibold">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {presetPageData.tableData.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          {row.map((cell, cIdx) => <td key={cIdx} className="p-2.5 font-mono text-[11px]">{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[11px] text-slate-600 dark:text-slate-400 font-mono">
                <span>CONFIDENTIAL & PROPRIETARY · HARDWARE SPECIFICATION</span>
                <span>SECTION {presetPageData?.sectionNumber}</span>
              </div>
            </div>
          )
        )}
      </div>

      {/* Floating Action Bar for Text Selection */}
      {selectedText && selectionPosition && (
        <div
          className="fixed z-50 transform -translate-x-1/2 -translate-y-full bg-slate-900 text-white rounded-lg shadow-2xl border border-slate-700 p-1.5 flex items-center space-x-1 text-xs backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: `${selectionPosition.x}px`,
            top: `${selectionPosition.y}px`,
          }}
        >
          <button
            id="btn-deepdive-ask"
            onClick={(e) => {
              e.stopPropagation();
              onDeepDiveQuestion(selectedText);
              setSelectedText('');
              setSelectionPosition(null);
            }}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
          >
            <MessageSquareShare className="w-3.5 h-3.5 text-amber-300" />
            <span>追问老架构师</span>
          </button>

          <button
            id="btn-set-focus"
            onClick={(e) => {
              e.stopPropagation();
              onSetUserFocus(selectedText);
              setSelectedText('');
              setSelectionPosition(null);
            }}
            className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition"
            title="将该句或寄存器定义标记为本页重点研读对象"
          >
            <Target className="w-3 h-3 text-cyan-400" />
            <span>设为重点</span>
          </button>
        </div>
      )}

      {/* Bottom Navigation & Page Turner Bar (High Contrast) */}
      <div className="h-12 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between text-xs shrink-0 select-none z-10 shadow-sm">
        <div className="flex items-center space-x-2">
          {/* Previous Page Button: High-contrast Dark/Indigo background */}
          <button
            id="btn-prev-page"
            disabled={currentPage <= 1}
            onClick={() => {
              const targetPage = currentPage - 1;
              onPageChange(targetPage);
              if (internalViewMode === 'continuous' && scrollViewportRef.current) {
                const targetEl = scrollViewportRef.current.querySelector(`[data-page-num="${targetPage}"]`);
                if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 font-bold shadow-md transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-xs"
            title="上一页"
          >
            <ChevronLeft className="w-4 h-4 text-white" />
            <span>上一页</span>
          </button>

          <form onSubmit={handlePageSubmit} className="flex items-center space-x-1.5 font-mono px-1">
            <span className="text-slate-600 dark:text-slate-400 font-medium">第</span>
            <input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              className="w-12 text-center py-1 rounded-md border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 text-xs shadow-inner"
            />
            <span className="text-slate-600 dark:text-slate-400 font-medium">/ {doc.totalPages} 页</span>
          </form>

          {/* Next Page Button: High-contrast Dark/Indigo background */}
          <button
            id="btn-next-page"
            disabled={currentPage >= doc.totalPages}
            onClick={() => {
              const targetPage = currentPage + 1;
              onPageChange(targetPage);
              if (internalViewMode === 'continuous' && scrollViewportRef.current) {
                const targetEl = scrollViewportRef.current.querySelector(`[data-page-num="${targetPage}"]`);
                if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 font-bold shadow-md transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-xs"
            title="下一页"
          >
            <span>下一页</span>
            <ChevronRight className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:flex items-center space-x-2">
          {internalViewMode === 'continuous' ? (
            <span className="flex items-center space-x-1 text-indigo-600 dark:text-indigo-400 font-medium">
              <ScrollText className="w-3.5 h-3.5" />
              <span>连续滚动版式：滚动即可浏览前后页，右侧讲解联动更新</span>
            </span>
          ) : (
            <span>💡 提示: 划选任意文本或寄存器可直接触发<strong>追问老架构师</strong></span>
          )}
        </div>
      </div>
    </div>
  );
};
