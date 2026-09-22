import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { DocumentOutline } from './components/DocumentOutline';
import { PdfViewer } from './components/PdfViewer';
import { SpecAnalysisView } from './components/SpecAnalysisView';
import { DeepDiveModal } from './components/DeepDiveModal';
import { ExportNotesModal } from './components/ExportNotesModal';
import { AISettingsModal } from './components/AISettingsModal';
import { BookshelfView } from './components/BookshelfView';
import { R2SyncModal } from './components/R2SyncModal';
import { PRESET_SPECS } from './data/presetSpecs';
import { PRESET_CHAPTER_ANALYSES } from './data/presetChapters';
import { 
  SpecDocument, 
  CachedAnalysis, 
  PresetSpecPage, 
  AISettings, 
  UserProfile, 
  ChapterAnalysis, 
  ChapterItem 
} from './types';
import { 
  getCachedAnalysis, 
  saveCachedAnalysis, 
  getAllCachedForDoc, 
  updateCustomNotes, 
  makeCacheKey,
  getAllDocuments,
  saveDocument,
  deleteDocument,
  isBufferDetached,
  DEFAULT_PROFILES,
  getActiveUserId,
  setActiveUserId,
  getAllUserProfiles,
  saveUserProfile,
  getCachedChapterAnalysis,
  saveCachedChapterAnalysis,
  getAllCachedChaptersForDoc,
  updateChapterCustomNotes
} from './lib/db';
import { buildChaptersFromOutline } from './lib/chapterService';
import { pdfjsLib } from './lib/pdfWorker';

export default function App() {
  // Convert presets to SpecDocuments with structured chapters
  const presetDocs: SpecDocument[] = useMemo(() => {
    return PRESET_SPECS.map((p) => ({
      id: p.id,
      name: p.name,
      fullName: p.fullName,
      category: p.category,
      totalPages: p.totalPages,
      version: p.version,
      createdAt: new Date().toISOString(),
      lastReadPage: 1,
      outline: p.outline,
      chapters: buildChaptersFromOutline(p.outline, p.totalPages),
    }));
  }, []);

  // Main UI Mode: 'reader' or 'bookshelf'
  const [viewTab, setViewTab] = useState<'reader' | 'bookshelf'>('reader');

  // Documents state
  const [documents, setDocuments] = useState<SpecDocument[]>(presetDocs);
  const [currentDocId, setCurrentDocId] = useState<string>(presetDocs[0]?.id || 'pcie_6_0');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // User Profile state
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>(DEFAULT_PROFILES);
  const [currentUser, setCurrentUser] = useState<UserProfile>(DEFAULT_PROFILES[0]);

  // Page Analysis state
  const [cachedAnalysis, setCachedAnalysis] = useState<CachedAnalysis | null>(null);
  const [cachedPagesSet, setCachedPagesSet] = useState<Set<number>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Chapter Analysis state
  const [cachedChapterAnalysis, setCachedChapterAnalysis] = useState<ChapterAnalysis | null>(null);
  const [cachedChaptersMap, setCachedChaptersMap] = useState<Record<string, Set<string>>>({});
  const [isAnalyzingChapter, setIsAnalyzingChapter] = useState<boolean>(false);
  const [analysisScope, setAnalysisScope] = useState<'chapter' | 'page'>('chapter');

  // Control state
  const [autoAnalyze, setAutoAnalyze] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isOutlineOpen, setIsOutlineOpen] = useState<boolean>(true);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isR2ModalOpen, setIsR2ModalOpen] = useState<boolean>(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState<boolean>(false);
  const [userFocus, setUserFocus] = useState<string>('');

  const abortControllerRef = useRef<AbortController | null>(null);

  // AI custom relay / proxy settings stored in localStorage
  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    try {
      const saved = localStorage.getItem('spec_companion_ai_settings');
      return saved ? JSON.parse(saved) : { provider: 'gemini', baseUrl: '', apiKey: '', model: 'gemini-3.1-flash-lite' };
    } catch {
      return { provider: 'gemini', baseUrl: '', apiKey: '', model: 'gemini-3.1-flash-lite' };
    }
  });

  const handleSaveAISettings = (newSettings: AISettings) => {
    setAiSettings(newSettings);
    try {
      localStorage.setItem('spec_companion_ai_settings', JSON.stringify(newSettings));
    } catch (e) {
      console.warn('Failed to save AI settings to localStorage', e);
    }
  };

  // Deep dive Q&A modal state
  const [deepDiveState, setDeepDiveState] = useState<{
    isOpen: boolean;
    selectedText?: string;
  }>({ isOpen: false });

  // Snapshot from current page
  const currentSnapshotRef = useRef<{ dataUrl: string; text: string }>({ dataUrl: '', text: '' });
  const debounceTimerRef = useRef<any>(null);

  // Active document object
  const currentDoc = documents.find((d) => d.id === currentDocId) || documents[0] || presetDocs[0];

  // Active preset page if applicable
  const activePreset = PRESET_SPECS.find((p) => p.id === currentDoc?.id);
  const presetPageData: PresetSpecPage | undefined = activePreset?.pages.find(
    (pg) => pg.pageNum === currentPage
  );

  // Active chapter based on current page position
  const activeChapter: ChapterItem | null = useMemo(() => {
    if (!currentDoc?.chapters || currentDoc.chapters.length === 0) return null;
    const match = currentDoc.chapters.find(
      (ch) => currentPage >= ch.startPage && currentPage <= ch.endPage
    );
    return match || currentDoc.chapters[0] || null;
  }, [currentDoc?.chapters, currentPage]);

  // Refresh cached pages and chapters for the active document
  const refreshCacheIndicators = useCallback(async (docId: string, userId = currentUser.id) => {
    const cachedPages = await getAllCachedForDoc(docId);
    setCachedPagesSet(new Set(cachedPages.map((i) => i.pageNum)));

    const cachedChaps = await getAllCachedChaptersForDoc(docId, userId);
    setCachedChaptersMap((prev) => ({
      ...prev,
      [docId]: new Set(cachedChaps.map((c) => c.chapterId)),
    }));
  }, [currentUser.id]);

  // 1. Initial Load: Load user profiles, custom documents from IndexedDB, pre-seed presets
  useEffect(() => {
    async function initDB() {
      try {
        // Load user profiles
        const profiles = await getAllUserProfiles();
        const safeProfiles = profiles && profiles.length > 0 ? profiles : DEFAULT_PROFILES;
        setUserProfiles(safeProfiles);
        const activeId = getActiveUserId();
        const current = safeProfiles.find((p) => p.id === activeId) || safeProfiles[0] || DEFAULT_PROFILES[0];
        setCurrentUser(current);

        // Load saved custom documents
        const customDocs = await getAllDocuments();
        if (customDocs.length > 0) {
          const validCustomDocs = customDocs.filter((d) => {
            if (d.category !== 'custom') return true;
            if (d.pdfData) return true;
            if (d.pdfBuffer) {
              return !isBufferDetached(d.pdfBuffer) && d.pdfBuffer.byteLength > 0;
            }
            return false;
          });

          // Ensure custom docs have chapters
          const hydratedCustomDocs = validCustomDocs.map((doc) => {
            if (!doc.chapters || doc.chapters.length === 0) {
              return {
                ...doc,
                chapters: buildChaptersFromOutline(doc.outline, doc.totalPages),
              };
            }
            return doc;
          });

          setDocuments([...presetDocs, ...hydratedCustomDocs]);
        }

        // Pre-seed preset samples to IndexedDB so user gets instant cache hit experience
        for (const spec of PRESET_SPECS) {
          for (const page of spec.pages) {
            const key = makeCacheKey(spec.id, page.pageNum, 'v1');
            const existing = await getCachedAnalysis(spec.id, page.pageNum, 'v1');
            if (!existing && page.sampleExplanation) {
              await saveCachedAnalysis({
                id: key,
                docId: spec.id,
                pageNum: page.pageNum,
                chapterTitle: page.chapterTitle,
                markdownContent: page.sampleExplanation,
                promptVersion: 'v1.0',
                createdAt: '2026-03-30T10:00:00.000Z',
                updatedAt: '2026-03-30T10:00:00.000Z',
                hitCount: 1,
              });
            }
          }
        }

        // Pre-seed preset chapter analyses
        for (const [key, analysis] of Object.entries(PRESET_CHAPTER_ANALYSES)) {
          const existingChapter = await getCachedChapterAnalysis(
            analysis.docId,
            analysis.chapterId,
            current.id
          );
          if (!existingChapter) {
            await saveCachedChapterAnalysis({
              ...analysis,
              userId: current.id,
            });
          }
        }

        refreshCacheIndicators(currentDocId, current.id);
      } catch (err) {
        console.warn('Non-fatal error in initDB:', err);
      }
    }

    initDB();
  }, [presetDocs]);

  // 2. Whenever doc, page, or activeChapter changes: synchronize cache
  useEffect(() => {
    let isMounted = true;

    async function loadContent() {
      // Check page-level cache
      const cachedPage = await getCachedAnalysis(currentDocId, currentPage, 'v1');
      if (isMounted) setCachedAnalysis(cachedPage);

      // Check chapter-level cache if activeChapter exists
      if (activeChapter) {
        const cachedChap = await getCachedChapterAnalysis(
          currentDocId,
          activeChapter.id,
          currentUser.id
        );
        if (isMounted) setCachedChapterAnalysis(cachedChap);

        // Auto-analyze chapter if enabled and not cached
        if (!cachedChap && autoAnalyze && analysisScope === 'chapter') {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            if (isMounted) {
              triggerChapterAnalysis(activeChapter, false);
            }
          }, 1200);
        }
      }

      // Auto-analyze page if enabled, in page scope, and not cached
      if (!cachedPage && autoAnalyze && analysisScope === 'page') {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          if (isMounted) {
            triggerAnalysis(false);
          }
        }, 1200);
      }
    }

    loadContent();
    refreshCacheIndicators(currentDocId, currentUser.id);

    return () => {
      isMounted = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [currentDocId, currentPage, activeChapter?.id, currentUser.id, autoAnalyze, analysisScope]);

  // Handle pause / abort of ongoing analysis
  const handlePauseAnalyze = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsAnalyzing(false);
    setIsAnalyzingChapter(false);
    setStatusMessage('已手动暂停/中断正在执行的 AI 研读分析');
  }, []);

  // Toggle auto analyze
  const handleToggleAutoAnalyze = useCallback(() => {
    setAutoAnalyze((prev) => {
      const next = !prev;
      if (!next && (isAnalyzing || isAnalyzingChapter)) {
        handlePauseAnalyze();
      }
      return next;
    });
  }, [isAnalyzing, isAnalyzingChapter, handlePauseAnalyze]);

  // Handle snapshot capture from PdfViewer
  const handleCaptureSnapshot = useCallback((dataUrl: string, text: string) => {
    currentSnapshotRef.current = { dataUrl, text };
  }, []);

  // Trigger Gemini Page-level Analysis
  const triggerAnalysis = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = await getCachedAnalysis(currentDocId, currentPage, 'v1');
      if (cached) {
        setCachedAnalysis(cached);
        setStatusMessage(null);
        return;
      }
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsAnalyzing(true);
    setStatusMessage(null);

    try {
      const chapterTitle = presetPageData?.chapterTitle || `${currentDoc.name} - Page ${currentPage}`;
      const pageText = currentSnapshotRef.current.text || presetPageData?.text || '';
      const pageImage = currentSnapshotRef.current.dataUrl || undefined;

      let prevPageSummary = '';
      if (currentPage > 1 && activePreset) {
        const prevPage = activePreset.pages.find((p) => p.pageNum === currentPage - 1);
        if (prevPage) {
          prevPageSummary = `${prevPage.chapterTitle}: ${prevPage.summary} ${prevPage.text.slice(0, 300)}`;
        }
      }

      const response = await fetch('/api/spec/explain', {
        method: 'POST',
        signal: abortController.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageImage,
          pageText,
          chapterTitle,
          docName: currentDoc.name,
          pageNum: currentPage,
          prevPageSummary,
          userFocus: userFocus || undefined,
          aiSettings,
        }),
      });

      if (abortController.signal.aborted) return;
      const data = await response.json();
      if (abortController.signal.aborted) return;

      if (data.success && data.markdown) {
        const newCacheItem: CachedAnalysis = {
          id: makeCacheKey(currentDocId, currentPage, 'v1'),
          docId: currentDocId,
          pageNum: currentPage,
          chapterTitle,
          markdownContent: data.markdown,
          promptVersion: 'v1.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          hitCount: 1,
        };

        await saveCachedAnalysis(newCacheItem);
        setCachedAnalysis(newCacheItem);
        await refreshCacheIndicators(currentDocId, currentUser.id);
        setStatusMessage(null);
      } else {
        if (presetPageData?.sampleExplanation) {
          const fallbackItem: CachedAnalysis = {
            id: makeCacheKey(currentDocId, currentPage, 'v1'),
            docId: currentDocId,
            pageNum: currentPage,
            chapterTitle,
            markdownContent: presetPageData.sampleExplanation,
            promptVersion: 'v1.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            hitCount: 1,
          };
          await saveCachedAnalysis(fallbackItem);
          setCachedAnalysis(fallbackItem);
          await refreshCacheIndicators(currentDocId, currentUser.id);
        } else {
          setStatusMessage(`分析未完成: ${data.error || '请检查后端配置或自定义中转站连通性'}`);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || abortController.signal.aborted) {
        setStatusMessage(`已手动暂停第 ${currentPage} 页的研读`);
        return;
      }
      console.error('Analysis failed:', err);
      if (presetPageData?.sampleExplanation) {
        const fallbackItem: CachedAnalysis = {
          id: makeCacheKey(currentDocId, currentPage, 'v1'),
          docId: currentDocId,
          pageNum: currentPage,
          chapterTitle: presetPageData.chapterTitle,
          markdownContent: presetPageData.sampleExplanation,
          promptVersion: 'v1.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          hitCount: 1,
        };
        await saveCachedAnalysis(fallbackItem);
        setCachedAnalysis(fallbackItem);
        await refreshCacheIndicators(currentDocId, currentUser.id);
      } else {
        setStatusMessage('网络请求超时，可点击【重新研读】再次尝试');
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        setIsAnalyzing(false);
        abortControllerRef.current = null;
      }
    }
  };

  // Trigger Gemini Chapter-level Analysis
  const triggerChapterAnalysis = async (chapter: ChapterItem, forceRefresh = false) => {
    if (!chapter) return;

    if (!forceRefresh) {
      const cached = await getCachedChapterAnalysis(currentDocId, chapter.id, currentUser.id);
      if (cached) {
        setCachedChapterAnalysis(cached);
        setStatusMessage(null);
        return;
      }
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsAnalyzingChapter(true);
    setStatusMessage(null);

    try {
      let chapterPagesText = '';
      if (activePreset) {
        const pgs = activePreset.pages.filter(
          (p) => p.pageNum >= chapter.startPage && p.pageNum <= chapter.endPage
        );
        chapterPagesText = pgs
          .map((p) => `--- Page ${p.pageNum} (${p.chapterTitle}) ---\n${p.text}`)
          .join('\n\n');
      }

      const response = await fetch('/api/spec/chapter-explain', {
        method: 'POST',
        signal: abortController.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docName: currentDoc.name,
          docCategory: currentDoc.category,
          chapterTitle: chapter.title,
          chapterId: chapter.id,
          startPage: chapter.startPage,
          endPage: chapter.endPage,
          chapterPagesText: chapterPagesText || undefined,
          userFocus: userFocus || undefined,
          aiSettings,
        }),
      });

      if (abortController.signal.aborted) return;
      const data = await response.json();
      if (abortController.signal.aborted) return;

      if (data.success && data.markdown) {
        const newChapterAnalysis: ChapterAnalysis = {
          id: `user_${currentUser.id}_${currentDocId}_ch_${chapter.id}_v1`,
          docId: currentDocId,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          startPage: chapter.startPage,
          endPage: chapter.endPage,
          markdownContent: data.markdown,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          hitCount: 1,
          userId: currentUser.id,
        };

        await saveCachedChapterAnalysis(newChapterAnalysis);
        setCachedChapterAnalysis(newChapterAnalysis);
        await refreshCacheIndicators(currentDocId, currentUser.id);
        setStatusMessage(null);
      } else {
        const presetCh = PRESET_CHAPTER_ANALYSES[`${currentDocId}_${chapter.id}`];
        if (presetCh) {
          setCachedChapterAnalysis(presetCh);
          await saveCachedChapterAnalysis({ ...presetCh, userId: currentUser.id });
          await refreshCacheIndicators(currentDocId, currentUser.id);
        } else {
          setStatusMessage(`章节研读分析未完成: ${data.error || '可检查网络或直接点击研读'}`);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || abortController.signal.aborted) {
        setStatusMessage(`已手动中断【${chapter.title}】的研读`);
        return;
      }
      const presetCh = PRESET_CHAPTER_ANALYSES[`${currentDocId}_${chapter.id}`];
      if (presetCh) {
        setCachedChapterAnalysis(presetCh);
        await saveCachedChapterAnalysis({ ...presetCh, userId: currentUser.id });
        await refreshCacheIndicators(currentDocId, currentUser.id);
      } else {
        setStatusMessage('章节研读请求超时或异常，可点击【重新研读本章】重试');
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        setIsAnalyzingChapter(false);
        abortControllerRef.current = null;
      }
    }
  };

  // Pre-cache all chapters of a document in sequence
  const handlePrecacheAllChapters = async (doc: SpecDocument) => {
    if (!doc.chapters || doc.chapters.length === 0) return;
    setStatusMessage(`正在后台逐章研读《${doc.name}》...`);
    for (const ch of doc.chapters) {
      const existing = await getCachedChapterAnalysis(doc.id, ch.id, currentUser.id);
      if (!existing) {
        await triggerChapterAnalysis(ch, false);
      }
    }
    setStatusMessage(`《${doc.name}》全书章节研读完成并已存入本地高速缓存！`);
  };

  // Select document and optionally jump to page
  const handleSelectDoc = (docId: string, pageNum = 1) => {
    setCurrentDocId(docId);
    setCurrentPage(pageNum);
    setUserFocus('');
    setViewTab('reader'); // Jump to reader mode seamlessly
    refreshCacheIndicators(docId, currentUser.id);
  };

  // Switch user profile
  const handleSelectUser = async (user: UserProfile) => {
    setCurrentUser(user);
    setActiveUserId(user.id);
    await refreshCacheIndicators(currentDocId, user.id);
  };

  // Add custom user profile
  const handleAddUser = async (name: string, role: string) => {
    const newProfile: UserProfile = {
      id: `user_${Date.now()}`,
      name,
      role,
      avatarColor: 'from-purple-600 to-pink-600',
    };
    await saveUserProfile(newProfile);
    setUserProfiles((prev) => [...prev, newProfile]);
    handleSelectUser(newProfile);
  };

  // Upload Custom PDF
  const handleUploadPdf = async (file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('请选择有效的 PDF 文件');
      return;
    }

    setIsUploadingPdf(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bufferForMetadata = arrayBuffer.slice(0);
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(bufferForMetadata),
        cMapPacked: true,
      });

      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      let outlineItems: any[] = [];
      try {
        const rawOutline = await pdf.getOutline();
        if (rawOutline && rawOutline.length > 0) {
          outlineItems = rawOutline.map((item, idx) => ({
            id: `out_${idx}`,
            title: item.title,
            pageNumber: 1,
            level: 1,
          }));
        }
      } catch (e) {
        // Outline is optional
      }

      // Auto-build chapters from outline or fallback
      const generatedChapters = buildChaptersFromOutline(outlineItems, totalPages);

      const newDoc: SpecDocument = {
        id: `custom_${Date.now()}`,
        name: file.name.replace(/\.pdf$/i, ''),
        fullName: file.name,
        category: 'custom',
        totalPages,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        createdAt: new Date().toISOString(),
        lastReadPage: 1,
        pdfBuffer: arrayBuffer.slice(0),
        outline: outlineItems,
        chapters: generatedChapters,
      };

      await saveDocument(newDoc);
      setDocuments((prev) => [...prev, newDoc]);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsAnalyzing(false);
      setIsAnalyzingChapter(false);
      setAutoAnalyze(false);

      setCurrentDocId(newDoc.id);
      setCurrentPage(1);
      setUserFocus('');
      setViewTab('reader');
      setStatusMessage('新书导入成功！已自动扫描识别章节大纲。可连续翻阅或点击【本章架构深度剖析】开启研读。');
      await refreshCacheIndicators(newDoc.id, currentUser.id);
    } catch (err: any) {
      console.error('Failed to parse uploaded PDF:', err);
      alert(`导入 PDF 失败: ${err?.message || '文件可能损坏或受密码保护'}`);
    } finally {
      setIsUploadingPdf(false);
    }
  };

  // Delete custom document
  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('确定要从本地藏书阁中移除此文档吗？')) return;
    await deleteDocument(docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    if (currentDocId === docId) {
      setCurrentDocId(presetDocs[0]?.id || 'pcie_5_0_iatu');
      setCurrentPage(1);
      setUserFocus('');
    }
  };

  // Save engineer's custom notes
  const handleUpdateNotes = async (notes: string) => {
    if (analysisScope === 'chapter' && activeChapter && cachedChapterAnalysis) {
      const cacheKey = cachedChapterAnalysis.id;
      await updateChapterCustomNotes(cacheKey, notes);
      setCachedChapterAnalysis((prev) => (prev ? { ...prev, customNotes: notes } : null));
    } else if (cachedAnalysis) {
      const cacheKey = makeCacheKey(currentDocId, currentPage, 'v1');
      await updateCustomNotes(cacheKey, notes);
      setCachedAnalysis((prev) => (prev ? { ...prev, customNotes: notes } : null));
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-900 text-slate-100 font-sans">
      {/* Top Header */}
      <Header
        currentDoc={currentDoc}
        documents={documents}
        onSelectDoc={(id) => handleSelectDoc(id, 1)}
        onUploadPdf={handleUploadPdf}
        onDeleteDoc={handleDeleteDoc}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        isCustomRelayActive={Boolean(aiSettings.baseUrl)}
        isUploadingPdf={isUploadingPdf}
        cachedPageCount={cachedPagesSet.size}
        autoAnalyze={autoAnalyze}
        onToggleAutoAnalyze={handleToggleAutoAnalyze}
        onTriggerAnalyze={() => {
          if (analysisScope === 'chapter' && activeChapter) {
            triggerChapterAnalysis(activeChapter, true);
          } else {
            triggerAnalysis(true);
          }
        }}
        onPauseAnalyze={handlePauseAnalyze}
        isAnalyzing={isAnalyzing || isAnalyzingChapter}
        hasCachedCurrentPage={
          analysisScope === 'chapter'
            ? Boolean(cachedChapterAnalysis)
            : cachedPagesSet.has(currentPage)
        }
        activeTab={viewTab}
        onTabChange={(tab) => setViewTab(tab)}
        currentUser={currentUser}
        userProfiles={userProfiles}
        onSelectUser={handleSelectUser}
        onAddUser={handleAddUser}
        onOpenR2Modal={() => setIsR2ModalOpen(true)}
      />

      {/* Main View Area: Bookshelf vs Reader */}
      {viewTab === 'bookshelf' ? (
        <div className="flex-1 overflow-hidden">
          <BookshelfView
            documents={documents}
            activeDocId={currentDocId}
            onSelectDoc={(docId, pNum) => handleSelectDoc(docId, pNum || 1)}
            onUploadClick={() => {
              const el = document.getElementById('btn-upload-pdf');
              if (el) el.click();
            }}
            onDeleteDoc={handleDeleteDoc}
            currentUser={currentUser}
            cachedChaptersMap={cachedChaptersMap}
            onPrecacheAllChapters={handlePrecacheAllChapters}
            onOpenR2SyncModal={() => setIsR2ModalOpen(true)}
          />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Document Outline Sidebar */}
          {isOutlineOpen && (
            <aside className="w-56 lg:w-64 h-full shrink-0 hidden md:block">
              <DocumentOutline
                outline={currentDoc.outline}
                currentPage={currentPage}
                onSelectPage={(p) => setCurrentPage(p)}
                cachedPages={cachedPagesSet}
                totalPages={currentDoc.totalPages}
              />
            </aside>
          )}

          {/* Center: PDF / Document Viewport (Continuous & Single Layout) */}
          <section className="flex-1 h-full flex flex-col min-w-0">
            <PdfViewer
              document={currentDoc}
              currentPage={currentPage}
              onPageChange={(p) => setCurrentPage(p)}
              presetPageData={presetPageData}
              presetSpec={activePreset}
              activeChapter={activeChapter}
              onDeepDiveQuestion={(text) => {
                setDeepDiveState({ isOpen: true, selectedText: text });
              }}
              onSetUserFocus={(text) => {
                setUserFocus(text);
                if (analysisScope === 'chapter' && activeChapter) {
                  triggerChapterAnalysis(activeChapter, true);
                } else {
                  triggerAnalysis(true);
                }
              }}
              onCaptureSnapshot={handleCaptureSnapshot}
              isOutlineOpen={isOutlineOpen}
              onToggleOutline={() => setIsOutlineOpen(!isOutlineOpen)}
            />
          </section>

          {/* Right: AI Spec 讲解专家 Rich Chapter & Page Breakdown Panel */}
          <section className="w-full sm:w-[480px] lg:w-[540px] xl:w-[600px] h-full flex flex-col shrink-0 border-l border-slate-800">
            <SpecAnalysisView
              analysis={cachedAnalysis}
              isAnalyzing={isAnalyzing}
              onTriggerAnalyze={() => triggerAnalysis(true)}
              onPauseAnalyze={handlePauseAnalyze}
              autoAnalyze={autoAnalyze}
              onToggleAutoAnalyze={handleToggleAutoAnalyze}
              statusMessage={statusMessage}
              onOpenQAPanel={(initialQ) => {
                setDeepDiveState({ isOpen: true, selectedText: initialQ });
              }}
              onUpdateNotes={handleUpdateNotes}
              userFocus={userFocus}
              onClearUserFocus={() => setUserFocus('')}
              currentPage={currentPage}
              chapterTitle={activeChapter?.title || presetPageData?.chapterTitle || currentDoc.name}
              activeChapter={activeChapter}
              chapterAnalysis={cachedChapterAnalysis}
              isAnalyzingChapter={isAnalyzingChapter}
              onTriggerAnalyzeChapter={(ch) => triggerChapterAnalysis(ch, true)}
              scope={analysisScope}
              onScopeChange={(s) => setAnalysisScope(s)}
            />
          </section>
        </div>
      )}

      {/* Floating / Drawer Targeted Q&A Modal */}
      <DeepDiveModal
        isOpen={deepDiveState.isOpen}
        onClose={() => setDeepDiveState({ isOpen: false })}
        docId={currentDocId}
        docName={currentDoc.name}
        pageNum={currentPage}
        chapterTitle={activeChapter?.title || presetPageData?.chapterTitle || currentDoc.name}
        selectedText={deepDiveState.selectedText}
        pageContext={
          analysisScope === 'chapter'
            ? cachedChapterAnalysis?.markdownContent
            : cachedAnalysis?.markdownContent || currentSnapshotRef.current.text
        }
        aiSettings={aiSettings}
      />

      {/* Export All Read Notes to Markdown Modal */}
      <ExportNotesModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        document={currentDoc}
      />

      {/* AI Server Relay & Gateway Settings Modal */}
      <AISettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={aiSettings}
        onSave={handleSaveAISettings}
      />

      {/* Cloudflare R2 Sync Hub Modal */}
      <R2SyncModal
        isOpen={isR2ModalOpen}
        onClose={() => setIsR2ModalOpen(false)}
        documents={documents}
      />
    </div>
  );
}

