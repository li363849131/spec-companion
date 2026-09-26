import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { DocumentOutline } from './components/DocumentOutline';
import { PdfViewer } from './components/PdfViewer';
import { SpecAnalysisView } from './components/SpecAnalysisView';
import { DeepDiveModal } from './components/DeepDiveModal';
import { ExportNotesModal } from './components/ExportNotesModal';
import { AISettingsModal } from './components/AISettingsModal';
import { BookshelfView } from './components/BookshelfView';
import { R2ConfigModal } from './components/R2ConfigModal';
import { R2SyncModal } from './components/R2SyncModal';
import { R2TestPanel } from './components/R2TestPanel';
import BatchUploadModal from './components/BatchUploadModal';
import { UploadTargetModal } from './components/UploadTargetModal';
import { PRESET_SPECS } from './data/presetSpecs';
import { PRESET_CHAPTER_ANALYSES } from './data/presetChapters';
import {
  SpecDocument,
  CachedAnalysis,
  PresetSpecPage,
  AISettings,
  UserProfile,
  ChapterAnalysis,
  ChapterItem,
  BookCategory
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
  DEFAULT_CATEGORIES,
  getActiveUserId,
  setActiveUserId,
  getAllUserProfiles,
  saveUserProfile,
  getCachedChapterAnalysis,
  saveCachedChapterAnalysis,
  getAllCachedChaptersForDoc,
  updateChapterCustomNotes,
  getAllCategories,
  saveCategory,
  deleteCategory,
  getR2SyncConfig
} from './lib/db';
import { buildChaptersFromOutline } from './lib/chapterService';
import { pdfjsLib } from './lib/pdfWorker';
import { deleteDocumentFromR2, fetchDocumentFromR2IfNeeded, syncDocumentToR2 } from './lib/r2Service';
import { generateSimpleOutline, hasValidOutline } from './lib/outlineGenerator';

export default function App() {
  // Check URL for R2 test mode
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('test') === 'r2') {
    return <R2TestPanel />;
  }

  // Convert presets to SpecDocuments with structured chapters
  // Disabled: No preset documents, users must upload their own
  const presetDocs: SpecDocument[] = useMemo(() => {
    return [];
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

  // Categories state
  const [categories, setCategories] = useState<BookCategory[]>([]);

  // Page Analysis state — keyed by docId so switching docs preserves prior analysis
  const [analysisCache, setAnalysisCache] = useState<Record<string, CachedAnalysis>>({});
  const cachedAnalysis = analysisCache[`${currentDocId}_${currentPage}`] ?? null;
  const setCachedAnalysis = (updater: CachedAnalysis | null | ((prev: CachedAnalysis | null) => CachedAnalysis | null)) => {
    setAnalysisCache(prev => {
      const key = `${currentDocId}_${currentPage}`;
      const current = prev[key] ?? null;
      const next = typeof updater === 'function' ? updater(current) : updater;
      if (next === null) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: next };
    });
  };
  const [cachedPagesSet, setCachedPagesSet] = useState<Set<number>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Load cached analysis when currentPage changes (with debounce to avoid excessive loading during continuous scroll)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      async function loadPageCache() {
        const key = `${currentDocId}_${currentPage}`;
        if (!analysisCache[key]) {
          // Not in memory, try to load from IndexedDB (using 'v1' as version)
          const cached = await getCachedAnalysis(currentDocId, currentPage, 'v1');
          if (cached) {
            setAnalysisCache(prev => ({ ...prev, [key]: cached }));
          }
        }
      }
      loadPageCache();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [currentDocId, currentPage]);

  // Chapter Analysis state — keyed by docId_chapterId
  const [chapterAnalysisCache, setChapterAnalysisCache] = useState<Record<string, ChapterAnalysis>>({});

  const setCachedChapterAnalysis = useCallback((
    updater: ChapterAnalysis | null | ((prev: ChapterAnalysis | null) => ChapterAnalysis | null),
    chapterId: string = ''
  ) => {
    setChapterAnalysisCache(prev => {
      const key = `${currentDocId}_${chapterId}`;
      const current = prev[key] ?? null;
      const next = typeof updater === 'function' ? updater(current) : updater;
      if (next === null) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: next };
    });
  }, [currentDocId]);
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
  const [isBatchUploadModalOpen, setIsBatchUploadModalOpen] = useState<boolean>(false);
  const [isR2SyncModalOpen, setIsR2SyncModalOpen] = useState<boolean>(false);
  const [r2ConfigForSync, setR2ConfigForSync] = useState<any>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState<boolean>(false);
  const [userFocus, setUserFocus] = useState<string>('');
  const [isUploadTargetModalOpen, setIsUploadTargetModalOpen] = useState<boolean>(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // AI custom relay / proxy settings stored in localStorage
  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    try {
      const saved = localStorage.getItem('spec_companion_ai_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      provider: 'gemini',
      baseUrl: 'https://www.sui-xiang.vip',
      apiKey: 'sk-28bcbfab936e26b5e63e3d90744b736ac5d9b165f3471335abb3292fb29c98d7',
      model: 'gemini-3.8-flash',
    };
  });

  const handleSaveAISettings = (newSettings: AISettings) => {
    setAiSettings(newSettings);
    try {
      localStorage.setItem('spec_companion_ai_settings', JSON.stringify(newSettings));
    } catch (e) {
      console.warn('Failed to save AI settings to localStorage', e);
    }
  };

  // Auto-sync metadata bundle to R2 after document changes
  const syncMetadataBundleToR2 = async () => {
    try {
      const r2Config = await getR2SyncConfig();
      if (!r2Config || !r2Config.accountId || !r2Config.accessKeyId) {
        console.log('R2 not configured, skipping metadata bundle sync');
        return;
      }

      console.log('Syncing metadata bundle to R2...');
      const { uploadAllMetadataToR2 } = await import('./lib/r2Service');
      const allDocs = await getAllDocuments();
      const result = await uploadAllMetadataToR2(allDocs, r2Config);

      if (result.success) {
        console.log('✓ Metadata bundle synced to R2 successfully');
      } else {
        console.error('Failed to sync metadata bundle to R2:', result.error);
      }
    } catch (err) {
      console.error('Error syncing metadata bundle:', err);
    }
  };

  // Handle upload target selection
  const handleUploadTargetConfirm = (categoryId: string, parentCollectionId?: string) => {
    if (pendingUploadFile) {
      handleUploadPdf(pendingUploadFile, categoryId, parentCollectionId);
      setPendingUploadFile(null);
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

  // Derive cachedChapterAnalysis after activeChapter is defined
  const cachedChapterAnalysis = chapterAnalysisCache[`${currentDocId}_${activeChapter?.id || ''}`] ?? null;

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
        // Load categories
        const loadedCategories = await getAllCategories();

        // If no categories exist, save defaults to DB first time
        if (loadedCategories.length === DEFAULT_CATEGORIES.length) {
          for (const cat of DEFAULT_CATEGORIES) {
            await saveCategory(cat);
          }
        }

        setCategories(loadedCategories);

        // Load user profiles
        const profiles = await getAllUserProfiles();
        const safeProfiles = profiles && profiles.length > 0 ? profiles : DEFAULT_PROFILES;
        setUserProfiles(safeProfiles);
        const activeId = getActiveUserId();
        const current = safeProfiles.find((p) => p.id === activeId) || safeProfiles[0] || DEFAULT_PROFILES[0];
        setCurrentUser(current);

        // Load saved custom documents
        const customDocs = await getAllDocuments();
        console.log('[App Init] Documents loaded from IndexedDB:', customDocs.length);
        if (customDocs.length > 0) {
          console.log('[App Init] First doc outline sample:', JSON.stringify(customDocs[0]?.outline?.slice(0, 3), null, 2));
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
        if (isMounted) setCachedChapterAnalysis(cachedChap, activeChapter.id);

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

      const response = await fetch('/api/spec/explain/stream', {
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
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      // Stream the response as SSE
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamedMarkdown = '';

      // Create a preliminary cache item to stream into
      const cacheKey = makeCacheKey(currentDocId, currentPage, 'v1');
      const streamingItem: CachedAnalysis = {
        id: cacheKey,
        docId: currentDocId,
        pageNum: currentPage,
        chapterTitle,
        markdownContent: '',
        promptVersion: 'v1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hitCount: 1,
        userId: currentUser.id,
      };
      setCachedAnalysis({ ...streamingItem });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (abortController.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.chunk) {
              streamedMarkdown += parsed.chunk;
              setCachedAnalysis((prev) => prev ? { ...prev, markdownContent: streamedMarkdown } : null);
            }
            if (parsed.done) {
              // Save complete result to IndexedDB
              const finalItem = { ...streamingItem, markdownContent: streamedMarkdown, updatedAt: new Date().toISOString() };
              await saveCachedAnalysis(finalItem);
              setCachedAnalysis(finalItem);
              await refreshCacheIndicators(currentDocId, currentUser.id);
              setStatusMessage(null);
            }
          } catch (parseErr) {
            // ignore JSON parse errors in stream
          }
        }
      }

      if (abortController.signal.aborted) return;

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
          userId: currentUser.id,
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

    console.log('triggerChapterAnalysis called for chapter:', chapter.id);

    if (!forceRefresh) {
      const cached = await getCachedChapterAnalysis(currentDocId, chapter.id, currentUser.id);
      console.log('Checking cached chapter analysis:', { docId: currentDocId, chapterId: chapter.id, userId: currentUser.id, found: !!cached });
      if (cached) {
        console.log('Found cached chapter analysis, loading:', cached.id);
        setCachedChapterAnalysis(cached, chapter.id);
        setStatusMessage(null);
        return;
      } else {
        console.log('No cached chapter analysis found for this chapter');
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

      const chapterResponse = await fetch('/api/spec/chapter-explain/stream', {
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
      if (!chapterResponse.ok || !chapterResponse.body) throw new Error(`HTTP ${chapterResponse.status}`);

      const chapterReader = chapterResponse.body.getReader();
      const chapterDecoder = new TextDecoder();
      let chapterBuffer = '';
      let streamedChapterMarkdown = '';

      const chapterCacheId = `user_${currentUser.id}_${currentDocId}_ch_${chapter.id}_v1`;
      const streamingChapterItem: ChapterAnalysis = {
        id: chapterCacheId,
        docId: currentDocId,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        startPage: chapter.startPage,
        endPage: chapter.endPage,
        markdownContent: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: currentUser.id,
      };
      setCachedChapterAnalysis({ ...streamingChapterItem }, chapter.id);

      while (true) {
        const { done, value } = await chapterReader.read();
        if (done) break;
        if (abortController.signal.aborted) break;

        chapterBuffer += chapterDecoder.decode(value, { stream: true });
        const lines = chapterBuffer.split('\n');
        chapterBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.chunk) {
              streamedChapterMarkdown += parsed.chunk;
              setCachedChapterAnalysis((prev) => prev ? { ...prev, markdownContent: streamedChapterMarkdown } : null, chapter.id);
            }
            if (parsed.done) {
              const finalChapterItem = { ...streamingChapterItem, markdownContent: streamedChapterMarkdown, updatedAt: new Date().toISOString() };
              await saveCachedChapterAnalysis(finalChapterItem);
              setCachedChapterAnalysis(finalChapterItem, chapter.id);
              await refreshCacheIndicators(currentDocId, currentUser.id);
              setStatusMessage(null);

              // Upload chapter analysis to R2 if configured
              console.log('Uploading chapter analysis to R2...', finalChapterItem.id);
              const r2Config = await getR2SyncConfig();
              if (r2Config && r2Config.accountId && r2Config.accessKeyId && r2Config.secretAccessKey) {
                try {
                  const { uploadJsonToR2 } = await import('./lib/r2Service');
                  // Use user ID instead of username (which doesn't exist)
                  const userId = currentUser.id.replace('user_', ''); // Convert 'user_jerry' to 'jerry'
                  const r2Path = `analysis/${currentDoc.category}/${currentDocId}/chapter_${chapter.id}_${userId}.json`;
                  const uploadResult = await uploadJsonToR2(r2Path, finalChapterItem, r2Config);
                  if (uploadResult.success) {
                    console.log('Chapter analysis uploaded to R2:', r2Path);
                  } else {
                    console.warn('Failed to upload chapter analysis to R2:', uploadResult.error);
                  }
                } catch (err) {
                  console.error('Error uploading chapter analysis to R2:', err);
                }
              } else {
                console.log('R2 not configured, skipping chapter analysis upload');
              }
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || abortController.signal.aborted) {
        setStatusMessage(`已手动中断【${chapter.title}】的研读`);
        return;
      }
      const presetCh = PRESET_CHAPTER_ANALYSES[`${currentDocId}_${chapter.id}`];
      if (presetCh) {
        setCachedChapterAnalysis(presetCh, chapter.id);
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
  const handleSelectDoc = async (docId: string, pageNum = 1) => {
    // Abort any ongoing analysis
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsAnalyzing(false);
    setIsAnalyzingChapter(false);
    setStatusMessage(null);

    // Check if document has pdfBuffer, if not, download from R2
    const doc = documents.find(d => d.id === docId);
    if (doc && !doc.pdfBuffer) {
      console.log('Document has no PDF buffer, downloading from R2...', docId);

      try {
        const r2Config = await getR2SyncConfig();
        if (!r2Config) {
          alert('无法下载文档：R2 配置未找到');
          return;
        }

        // Show loading indicator
        setStatusMessage('正在从云端下载 PDF...');

        const r2Path = `${doc.category}/${docId}.pdf`;
        const { downloadDocumentFromR2 } = await import('./lib/r2Service');
        const result = await downloadDocumentFromR2(r2Path, r2Config);

        if (!result.success || !result.data) {
          alert(`下载失败: ${result.error || '未知错误'}`);
          setStatusMessage(null);
          return;
        }

        console.log('PDF downloaded from R2, size:', result.data.byteLength);

        // Update document with pdfBuffer
        const updatedDoc = { ...doc, pdfBuffer: result.data };
        await saveDocument(updatedDoc);
        setDocuments(prev => prev.map(d => d.id === docId ? updatedDoc : d));

        // Download analysis results for this document
        console.log('Downloading analysis results from R2...');
        const analysisPrefix = `analysis/${doc.category}/${docId}/`;
        console.log('Looking for analysis files with prefix:', analysisPrefix);

        // Use server-side list to find analysis files
        const { downloadJsonFromR2 } = await import('./lib/r2Service');
        const listResponse = await fetch('/api/r2/list-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: r2Config }),
        });

        console.log('List response status:', listResponse.status);

        if (listResponse.ok) {
          const listData = await listResponse.json();
          console.log('List data:', listData);

          if (listData.success && listData.keys) {
            console.log('All keys from R2:', listData.keys);
            const analysisFiles = listData.keys.filter((key: string) => key.startsWith(analysisPrefix));
            console.log(`Found ${analysisFiles.length} analysis files for document ${docId}:`, analysisFiles);

            for (const analysisPath of analysisFiles) {
              try {
                console.log('Downloading analysis file:', analysisPath);
                const analysisResult = await downloadJsonFromR2(analysisPath, r2Config);
                if (analysisResult.success && analysisResult.data) {
                  // Check if this is a chapter analysis or page analysis
                  const isChapterAnalysis = analysisPath.includes('/chapter_');

                  if (isChapterAnalysis) {
                    // Save as chapter analysis
                    await saveCachedChapterAnalysis(analysisResult.data);
                    console.log('Downloaded and saved chapter analysis:', analysisPath);
                  } else {
                    // Save as page analysis
                    await saveCachedAnalysis(analysisResult.data);
                    console.log('Downloaded and saved page analysis:', analysisPath);
                  }
                } else {
                  console.warn('Failed to download analysis:', analysisPath, analysisResult.error);
                }
              } catch (err) {
                console.warn('Failed to download analysis:', analysisPath, err);
              }
            }

            // Refresh cache indicators after downloading all analyses
            await refreshCacheIndicators(currentDocId, currentUser.id);
            console.log('Refreshed cache indicators after downloading analyses');
          } else {
            console.warn('No keys found in list response');
          }
        } else {
          console.error('List request failed:', listResponse.status);
        }

        setStatusMessage(null);
        console.log('Document and analysis results updated');
      } catch (err: any) {
        console.error('Failed to download PDF from R2:', err);
        alert(`下载失败: ${err.message}`);
        setStatusMessage(null);
        return;
      }
    }

    setCurrentDocId(docId);
    setCurrentPage(pageNum);
    setUserFocus('');
    setViewTab('reader');
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

  // Delete user profile and all associated documents
  const handleDeleteUser = async (userId: string) => {
    // Don't allow deleting the last user
    if (userProfiles.length <= 1) {
      alert('不能删除最后一个用户');
      return;
    }

    // Find documents belonging to this user
    const userDocs = documents.filter(doc => doc.userId === userId);

    console.log(`Deleting user ${userId} and ${userDocs.length} documents`);

    // Delete documents from IndexedDB
    for (const doc of userDocs) {
      await deleteDocument(doc.id);
    }

    // Delete documents from R2 if configured
    const r2Config = await getR2SyncConfig();
    if (r2Config && r2Config.accountId && r2Config.accessKeyId && r2Config.secretAccessKey) {
      const { deleteFromR2 } = await import('./lib/r2Service');

      for (const doc of userDocs) {
        try {
          // Delete PDF
          const docCategory = doc.category || 'uncategorized';
          const pdfPath = `${docCategory}/${doc.id}.pdf`;
          await deleteFromR2(pdfPath, r2Config);

          // Delete metadata
          const metadataPath = `metadata/${docCategory}/${doc.id}.json`;
          await deleteFromR2(metadataPath, r2Config);

          // Delete analysis results
          const analysisPrefix = `analysis/${docCategory}/${doc.id}/`;
          // Note: This would need a listFiles and delete loop, simplified for now
          console.log(`Deleted R2 files for document: ${doc.id}`);
        } catch (err) {
          console.warn(`Failed to delete R2 files for ${doc.id}:`, err);
        }
      }
    }

    // Delete user profile
    await deleteUserProfile(userId);

    // Update state
    setDocuments((prev) => prev.filter(doc => doc.userId !== userId));
    setUserProfiles((prev) => prev.filter(p => p.id !== userId));

    // Switch to another user if the deleted user was current
    if (currentUser.id === userId) {
      const remainingUsers = userProfiles.filter(p => p.id !== userId);
      if (remainingUsers.length > 0) {
        handleSelectUser(remainingUsers[0]);
      }
    }

    alert(`用户 "${userId}" 及其 ${userDocs.length} 个文档已删除`);
  };

  // Upload Custom PDF or Word document
  const handleUploadPdf = async (file: File, targetCategory?: string, targetCollectionId?: string) => {
    if (!file) return;

    // If no target specified, show target selection modal
    if (!targetCategory) {
      setPendingUploadFile(file);
      setIsUploadTargetModalOpen(true);
      return;
    }

    const fileName = file.name.toLowerCase();
    const isDocx = fileName.endsWith('.docx') || fileName.endsWith('.doc');
    const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
    const isMd = fileName.endsWith('.md');
    const isTxt = fileName.endsWith('.txt');
    const isHtml = fileName.endsWith('.html') || fileName.endsWith('.htm');
    const isEpub = fileName.endsWith('.epub');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isCsv = fileName.endsWith('.csv');
    const isPpt = fileName.endsWith('.pptx') || fileName.endsWith('.ppt');

    if (!isPdf && !isDocx && !isMd && !isTxt && !isHtml && !isEpub && !isExcel && !isCsv && !isPpt) {
      alert('请选择支持的文件格式：PDF, Word, Markdown, TXT, HTML, ePub, Excel, CSV, PowerPoint');
      return;
    }

    setIsUploadingPdf(true);
    try {
      let htmlContent = '';
      let docType = 'pdf';

      // ─── Handle Markdown files ───
      if (isMd) {
        const text = await file.text();
        // Simple markdown to HTML conversion (you can use a library like marked.js for better rendering)
        htmlContent = `
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
              pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; }
              code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
              h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; }
              h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
              h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
              blockquote { border-left: 4px solid #dfe2e5; padding-left: 16px; color: #6a737d; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #dfe2e5; padding: 6px 13px; }
              th { background: #f6f8fa; font-weight: 600; }
            </style>
          </head>
          <body>${text.replace(/\n/g, '<br>').replace(/#{1,6} (.+)/g, (match, p1) => `<h${match.split('#').length - 1}>${p1}</h${match.split('#').length - 1}>`)}</body>
          </html>
        `;
        docType = 'markdown';
      }
      // ─── Handle Plain Text files ───
      else if (isTxt) {
        const text = await file.text();
        htmlContent = `
          <html>
          <head>
            <style>
              body { font-family: 'Courier New', monospace; line-height: 1.6; padding: 20px; white-space: pre-wrap; }
            </style>
          </head>
          <body>${text}</body>
          </html>
        `;
        docType = 'text';
      }
      // ─── Handle HTML files ───
      else if (isHtml) {
        htmlContent = await file.text();
        docType = 'html';
      }
      // ─── Handle ePub files ───
      else if (isEpub) {
        // ePub parsing in browser is complex, show placeholder for now
        // Full implementation would need a browser-compatible ePub library
        htmlContent = `
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
            </style>
          </head>
          <body>
            <h1>ePub 文件：${file.name}</h1>
            <p>ePub 格式支持开发中。目前已保存文件信息。</p>
            <p>文件大小：${(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            <p style="color: #666; font-size: 14px;">提示：建议使用专业的 ePub 阅读器获得最佳体验。</p>
          </body>
          </html>
        `;
        docType = 'epub';
      }
      // ─── Handle CSV files ───
      else if (isCsv) {
        const text = await file.text();
        const rows = text.split('\n').map(row => row.split(','));
        const tableHtml = `
          <table>
            <thead><tr>${rows[0].map(cell => `<th>${cell.trim()}</th>`).join('')}</tr></thead>
            <tbody>${rows.slice(1).map(row => `<tr>${row.map(cell => `<td>${cell.trim()}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        `;
        htmlContent = `
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
              th { background: #f4f4f4; font-weight: 600; }
              tr:nth-child(even) { background: #f9f9f9; }
            </style>
          </head>
          <body>${tableHtml}</body>
          </html>
        `;
        docType = 'csv';
      }
      // ─── Handle Excel files ───
      else if (isExcel) {
        try {
          const XLSX = await import('xlsx');
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });

          let tablesHtml = '';
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const htmlTable = XLSX.utils.sheet_to_html(worksheet);
            tablesHtml += `<h2>${sheetName}</h2>${htmlTable}<br>`;
          });

          htmlContent = `
            <html>
            <head>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; }
                h2 { margin-top: 30px; color: #1e40af; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
                th { background: #f4f4f4; font-weight: 600; }
                tr:nth-child(even) { background: #f9f9f9; }
              </style>
            </head>
            <body>
              <h1>${file.name}</h1>
              ${tablesHtml}
            </body>
            </html>
          `;
          docType = 'excel';
        } catch (err) {
          console.error('Failed to parse Excel:', err);
          htmlContent = `
            <html>
            <body style="padding: 20px;">
              <h1>Excel 文件：${file.name}</h1>
              <p style="color: orange;">Excel 解析失败，显示文件信息</p>
              <p>文件大小：${(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            </body>
            </html>
          `;
          docType = 'excel';
        }
      }
      // ─── Handle PowerPoint files ───
      else if (isPpt) {
        // PowerPoint parsing is complex, for now show placeholder
        // Full implementation would require a specialized PPTX parser
        htmlContent = `
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
            </style>
          </head>
          <body>
            <h1>PowerPoint 文件：${file.name}</h1>
            <p>PowerPoint 完整解析功能开发中。目前已保存文件信息。</p>
            <p>文件大小：${(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            <p style="color: #666; font-size: 14px;">提示：建议导出为PDF格式以获得最佳阅读体验。</p>
          </body>
          </html>
        `;
        docType = 'powerpoint';
      }
      // ─── Handle Word .docx files ───
      else if (isDocx) {
        const mammoth = await import('mammoth');
        const arrayBuffer = await file.arrayBuffer();
        const result = await (mammoth as any).convertToHtml({ arrayBuffer });
        htmlContent = result.value || '';
        docType = 'word';
      }

      // ─── Handle non-PDF documents (create HTML-based document) ───
      if (docType !== 'pdf') {
        const newDoc: SpecDocument = {
          id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name.replace(/\.(docx?|doc|md|txt|html?|epub|xlsx?|xls|csv|pptx?|ppt)$/i, ''),
          fullName: file.name,
          category: targetCategory || 'custom',
          totalPages: 1,
          fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          createdAt: new Date().toISOString(),
          lastReadPage: 1,
          pdfData: `data:text/html;base64,${btoa(unescape(encodeURIComponent(htmlContent)))}`,
          readingProgress: 0,
          outline: generateSimpleOutline(1),
          chapters: buildChaptersFromOutline([], 1),
          version: docType.toUpperCase(),
          parentCollectionId: targetCollectionId,
        };
        await saveDocument(newDoc);
        setDocuments((prev) => [...prev, newDoc]);

        // Don't auto-switch to reader view
        setUserFocus('');
        setStatusMessage(`文档「${newDoc.name}」(${docType.toUpperCase()})导入成功！在书架中查看。`);
        await refreshCacheIndicators(newDoc.id, currentUser.id);
        setIsUploadingPdf(false);
        return;
      }

      // ─── Handle PDF files ───
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
          // PDF has built-in outline, parse it properly
          const parseOutlineItem = async (item: any, level = 0): Promise<OutlineItem> => {
            let pageNumber = 1;
            console.log(`[Outline Debug] Parsing: "${item.title}"`, {
              dest: item.dest,
              destType: typeof item.dest,
              isArray: Array.isArray(item.dest)
            });

            try {
              let dest = item.dest;
              // dest can be a named string or an array
              if (typeof dest === 'string') {
                console.log(`[Outline Debug] Resolving named destination: ${dest}`);
                dest = await pdf.getDestination(dest);
                console.log(`[Outline Debug] Resolved to:`, dest);
              }
              if (Array.isArray(dest) && dest.length > 0) {
                console.log(`[Outline Debug] Getting page index for:`, dest[0]);
                const pageIndex = await pdf.getPageIndex(dest[0]);
                console.log(`[Outline Debug] Page index: ${pageIndex}`);
                pageNumber = pageIndex + 1;
              } else {
                console.warn(`[Outline Debug] No valid dest array for "${item.title}"`);
              }
            } catch (err) {
              console.error(`[Outline Debug] Failed to resolve page for "${item.title}":`, err);
            }

            // Ensure pageNumber is a valid number
            if (isNaN(pageNumber) || pageNumber < 1) {
              console.warn(`[Outline Debug] Invalid pageNumber for "${item.title}", defaulting to 1`);
              pageNumber = 1;
            }

            console.log(`[Outline Debug] Final pageNumber for "${item.title}": ${pageNumber}`);

            const children: OutlineItem[] = [];
            if (item.items && item.items.length > 0) {
              for (const child of item.items) {
                children.push(await parseOutlineItem(child, level + 1));
              }
            }
            return {
              id: `outline_${Math.random().toString(36).slice(2)}`,
              title: item.title || `Page ${pageNumber}`,
              pageNumber,
              level,
              children,
            };
          };
          for (const item of rawOutline) {
            outlineItems.push(await parseOutlineItem(item));
          }
        } else {
          // No outline, generate simple page-based outline
          outlineItems = generateSimpleOutline(totalPages);
        }
      } catch (e) {
        // If outline extraction fails, generate simple outline
        console.warn('Failed to extract outline, generating simple index:', e);
        outlineItems = generateSimpleOutline(totalPages);
      }

      // Auto-build chapters from outline or fallback
      const generatedChapters = buildChaptersFromOutline(outlineItems, totalPages);

      // Calculate file hash for deduplication
      const { calculateFileHash } = await import('./lib/fileHash');
      const fileHash = await calculateFileHash(arrayBuffer);

      // Check if this file already exists (by hash)
      const existingDoc = documents.find(doc => doc.fileHash === fileHash);
      if (existingDoc) {
        alert(`文件已存在: ${existingDoc.name}\n\n如需替换，请先删除旧文档。`);
        setIsUploadingPdf(false);
        return;
      }

      const newDoc: SpecDocument = {
        id: `custom_${Date.now()}`,
        name: file.name.replace(/\.pdf$/i, ''),
        fullName: file.name,
        category: targetCategory || 'custom',
        totalPages,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        createdAt: new Date().toISOString(),
        lastReadPage: 1,
        pdfBuffer: arrayBuffer.slice(0),
        outline: outlineItems,
        chapters: generatedChapters,
        fileHash, // Store the hash
        parentCollectionId: targetCollectionId,
      };

      // Debug: Log outline before saving
      console.log('[handleUploadPdf] Outline before saving to IndexedDB:', JSON.stringify(outlineItems.slice(0, 3), null, 2));

      await saveDocument(newDoc);
      setDocuments((prev) => [...prev, newDoc]);

      // Upload to R2 if configured (async, don't block UI)
      const r2Config = await getR2SyncConfig();
      if (r2Config && r2Config.accountId && r2Config.accessKeyId && r2Config.secretAccessKey) {
        console.log('Uploading document to R2...', newDoc.id);
        // Get document category for R2 path
        const docCategory = newDoc.category || 'uncategorized';
        syncDocumentToR2(newDoc.id, arrayBuffer.slice(0), r2Config, docCategory)
          .then(async (result) => {
            if (result.success) {
              console.log('Document uploaded to R2:', result.r2Path);

              // Upload metadata JSON
              const metadata = {
                id: newDoc.id,
                name: newDoc.name,
                fullName: newDoc.fullName,
                category: newDoc.category,
                totalPages: newDoc.totalPages,
                fileSize: newDoc.fileSize,
                createdAt: newDoc.createdAt,
                lastReadPage: newDoc.lastReadPage,
                outline: newDoc.outline,
                chapters: newDoc.chapters,
              };

              const { uploadJsonToR2 } = await import('./lib/r2Service');
              const metadataPath = `metadata/${docCategory}/${newDoc.id}.json`;
              const metadataResult = await uploadJsonToR2(metadataPath, metadata, r2Config);

              if (metadataResult.success) {
                console.log('Metadata uploaded to R2:', metadataPath);
              } else {
                console.warn('Metadata upload failed:', metadataResult.error);
              }
            } else {
              console.warn('R2 upload failed:', result.error);
            }
          })
          .catch((err) => {
            console.error('R2 upload error:', err);
          });
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsAnalyzing(false);
      setIsAnalyzingChapter(false);
      setAutoAnalyze(false);

      // Don't auto-switch to reader view, stay on bookshelf
      // setCurrentDocId(newDoc.id);
      // setCurrentPage(1);
      setUserFocus('');
      // setViewTab('reader');
      setStatusMessage(`文档「${newDoc.name}」导入成功！在书架中查看。`);
      await refreshCacheIndicators(newDoc.id, currentUser.id);

      // Auto-sync metadata bundle to R2
      syncMetadataBundleToR2();
    } catch (err: any) {
      console.error('Failed to parse uploaded PDF:', err);
      alert(`导入 PDF 失败: ${err?.message || '文件可能损坏或受密码保护'}`);
    } finally {
      setIsUploadingPdf(false);
    }
  };

  // Handle batch upload
  const handleBatchUpload = async (files: File[], category: string) => {
    for (const file of files) {
      // Temporarily set the category for this upload
      const originalCategory = categories.find(c => c.id === category);
      if (!originalCategory) {
        throw new Error(`Category ${category} not found`);
      }

      // Upload the file using the existing handleUploadPdf logic
      // But we need to modify it to accept a category parameter
      // For now, we'll duplicate the core PDF parsing logic here

      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        console.warn('Skipping non-PDF file:', file.name);
        continue;
      }

      const arrayBuffer = await file.arrayBuffer();

      // Calculate file hash for deduplication
      const { calculateFileHash } = await import('./lib/fileHash');
      const fileHash = await calculateFileHash(arrayBuffer);

      // Check if this file already exists (by hash)
      const existingDoc = documents.find(doc => doc.fileHash === fileHash);
      if (existingDoc) {
        console.log(`Skipping duplicate file: ${file.name} (matches ${existingDoc.name})`);
        throw new Error(`文件已存在: ${existingDoc.name}`);
      }

      // Create a copy to avoid detached buffer issues
      const arrayBufferCopy = arrayBuffer.slice(0);

      const pdf = await pdfjsLib.getDocument({ data: arrayBufferCopy }).promise;
      const rawOutline = await pdf.getOutline();

      // Parse outline properly to extract page numbers
      let outlineItems: OutlineItem[] = [];
      if (rawOutline && rawOutline.length > 0) {
        const parseOutlineItem = async (item: any, level = 0): Promise<OutlineItem> => {
          let pageNumber = 1;

          try {
            let dest = item.dest;
            if (typeof dest === 'string') {
              dest = await pdf.getDestination(dest);
            }
            if (Array.isArray(dest) && dest.length > 0) {
              const pageIndex = await pdf.getPageIndex(dest[0]);
              pageNumber = pageIndex + 1;
            }
          } catch (err) {
            console.warn('Failed to resolve outline destination:', err);
          }

          const children: OutlineItem[] = [];
          if (item.items && item.items.length > 0) {
            for (const child of item.items) {
              children.push(await parseOutlineItem(child, level + 1));
            }
          }

          return {
            id: `outline_${Math.random().toString(36).slice(2)}`,
            title: item.title || `Page ${pageNumber}`,
            pageNumber,
            level,
            children,
          };
        };

        for (const item of rawOutline) {
          outlineItems.push(await parseOutlineItem(item));
        }
      } else {
        outlineItems = generateSimpleOutline(pdf.numPages);
      }

      const chapters = buildChaptersFromOutline(outlineItems, pdf.numPages);

      const newDoc: SpecDocument = {
        id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name.replace(/\.pdf$/i, ''),
        fullName: file.name,
        category: category, // Use the selected category
        totalPages: pdf.numPages,
        fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        createdAt: new Date().toISOString(),
        lastReadPage: 1,
        readingProgress: 0,
        pdfBuffer: arrayBuffer.slice(0), // Another copy for storage
        outline: outlineItems,
        chapters,
        fileHash, // Store the hash
      };

      // Save to IndexedDB
      await saveDocument(newDoc);
      setDocuments((prev) => [...prev, newDoc]);

      // Upload to R2 if configured
      const r2Config = await getR2SyncConfig();
      if (r2Config && r2Config.accountId && r2Config.accessKeyId && r2Config.secretAccessKey) {
        // Use the syncDocumentToR2 function instead
        const docCategory = newDoc.category || 'uncategorized';
        syncDocumentToR2(newDoc.id, arrayBuffer.slice(0), r2Config, docCategory)
          .then(async (result) => {
            if (result.success) {
              console.log('Document uploaded to R2:', result.r2Path);

              // Upload metadata
              const { uploadJsonToR2 } = await import('./lib/r2Service');
              const metadata = {
                id: newDoc.id,
                name: newDoc.name,
                fullName: newDoc.fullName,
                category: newDoc.category,
                totalPages: newDoc.totalPages,
                fileSize: newDoc.fileSize,
                createdAt: newDoc.createdAt,
                lastReadPage: newDoc.lastReadPage,
                outline: newDoc.outline,
                chapters: newDoc.chapters,
                fileHash: newDoc.fileHash,
              };

              const metadataPath = `metadata/${docCategory}/${newDoc.id}.json`;
              const metadataResult = await uploadJsonToR2(metadataPath, metadata, r2Config);

              if (metadataResult.success) {
                console.log('Metadata uploaded to R2:', metadataPath);
              }
            }
          })
          .catch((err) => {
            console.error('Failed to upload document to R2:', err);
          });
      }

      // Small delay between uploads to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  // Handle batch upload with directory structure (nested collections)
  const handleBatchUploadWithStructure = async (
    fileTree: any,
    category: string,
    parentCollectionId?: string,
    onFileStart?: (filePath: string) => void,
    onFileComplete?: (filePath: string, success: boolean, error?: string) => void
  ) => {
    // Import necessary functions
    const { addDocumentToCollection } = await import('./lib/db');

    // Cache for collections to avoid duplicates (key: category_parentId_name)
    const collectionCache = new Map<string, string>();

    // Recursive function to process directory tree
    const processNode = async (node: any, parentId?: string, skipNodeItself: boolean = false): Promise<string[]> => {
      if (!node.children || node.children.length === 0) {
        return [];
      }

      const createdDocIds: string[] = [];

      for (const child of node.children) {
        if (child.isDirectory) {
          // Don't skip directory creation - always create collection for directories
          const cacheKey = `${category}_${parentId || 'root'}_${child.name}`;
          let collectionId = collectionCache.get(cacheKey);

          if (!collectionId) {
            // Check in existing documents
            const existingCollection = documents.find(
              (doc) =>
                doc.isCollection &&
                doc.name === child.name &&
                doc.category === category &&
                doc.parentCollectionId === parentId
            );

            if (existingCollection) {
              collectionId = existingCollection.id;
              collectionCache.set(cacheKey, collectionId);
            } else {
              // Create a new collection for this directory
              const collectionDoc: SpecDocument = {
                id: `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: child.name,
                fullName: child.name,
                category: category,
                totalPages: 0,
                fileSize: '0 MB',
                createdAt: new Date().toISOString(),
                lastReadPage: 1,
                readingProgress: 0,
                outline: [],
                chapters: [],
                isCollection: true,
                childDocIds: [],
                parentCollectionId: parentId,
              };

              await saveDocument(collectionDoc);
              setDocuments((prev) => [...prev, collectionDoc]);
              collectionId = collectionDoc.id;
              collectionCache.set(cacheKey, collectionId);
              createdDocIds.push(collectionId);
            }
          }

          // Process children recursively - always pass collectionId as parent
          const childDocIds = await processNode(child, collectionId, false);

          // Update collection with child IDs
          if (childDocIds.length > 0) {
            const existingDoc = documents.find((d) => d.id === collectionId);
            const updatedChildIds = Array.from(new Set([...(existingDoc?.childDocIds || []), ...childDocIds]));

            await saveDocument({
              ...existingDoc!,
              childDocIds: updatedChildIds,
            });

            setDocuments((prev) =>
              prev.map((doc) =>
                doc.id === collectionId ? { ...doc, childDocIds: updatedChildIds } : doc
              )
            );
          }
        } else if (child.file) {
          // It's a document file, upload it
          const file = child.file;
          const filePath = child.path; // Define filePath from child.path
          const fileName = file.name.toLowerCase();
          const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
          const isSupported = isPdf || fileName.endsWith('.doc') || fileName.endsWith('.docx') ||
                              fileName.endsWith('.md') || fileName.endsWith('.txt') ||
                              fileName.endsWith('.html') || fileName.endsWith('.htm') ||
                              fileName.endsWith('.epub') || fileName.endsWith('.xlsx') ||
                              fileName.endsWith('.xls') || fileName.endsWith('.csv') ||
                              fileName.endsWith('.pptx') || fileName.endsWith('.ppt');

          if (!isSupported) {
            console.warn('Skipping unsupported file:', file.name);
            continue;
          }

          // Notify upload start
          if (onFileStart) {
            onFileStart(filePath);
          }

          try {
            // Determine file type
            const isDocx = fileName.endsWith('.docx') || fileName.endsWith('.doc');
            const isMd = fileName.endsWith('.md');
            const isTxt = fileName.endsWith('.txt');
            const isHtml = fileName.endsWith('.html') || fileName.endsWith('.htm');
            const isEpub = fileName.endsWith('.epub');
            const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
            const isCsv = fileName.endsWith('.csv');
            const isPpt = fileName.endsWith('.pptx') || fileName.endsWith('.ppt');

            // Process non-PDF files
            if (!isPdf) {
              let htmlContent = '';
              let docType = 'document';

              if (isMd) {
                const text = await file.text();
                htmlContent = `
                  <html>
                  <head>
                    <style>
                      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
                      pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; }
                      code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
                      h1, h2, h3 { margin-top: 24px; }
                    </style>
                  </head>
                  <body>${text.replace(/\n/g, '<br>')}</body>
                  </html>
                `;
                docType = 'markdown';
              } else if (isTxt) {
                const text = await file.text();
                htmlContent = `<html><body style="font-family: monospace; white-space: pre-wrap; padding: 20px;">${text}</body></html>`;
                docType = 'text';
              } else if (isHtml) {
                htmlContent = await file.text();
                docType = 'html';
              } else if (isDocx) {
                const mammoth = await import('mammoth');
                const arrayBuffer = await file.arrayBuffer();
                const result = await (mammoth as any).convertToHtml({ arrayBuffer });
                htmlContent = result.value || '';
                docType = 'word';
              } else {
                // Placeholder for other formats
                htmlContent = `<html><body style="padding: 20px;"><h1>${file.name}</h1><p>文件格式：${fileName.split('.').pop()?.toUpperCase()}</p><p>大小：${(file.size / (1024 * 1024)).toFixed(2)} MB</p></body></html>`;
                docType = fileName.split('.').pop() || 'document';
              }

              const newDoc: SpecDocument = {
                id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: file.name.replace(/\.[^.]+$/, ''),
                fullName: file.name,
                category: category,
                totalPages: 1,
                fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
                createdAt: new Date().toISOString(),
                lastReadPage: 1,
                readingProgress: 0,
                pdfData: `data:text/html;base64,${btoa(unescape(encodeURIComponent(htmlContent)))}`,
                outline: [],
                chapters: [],
                parentCollectionId: parentId,  // Fixed: use parentId instead of parentCollectionId
                version: docType.toUpperCase(),
              };

              await saveDocument(newDoc);
              setDocuments((prev) => [...prev, newDoc]);
              createdDocIds.push(newDoc.id);

              if (onFileComplete) {
                onFileComplete(filePath, true);
              }

              await new Promise(resolve => setTimeout(resolve, 100));
              continue;
            }

            // Handle PDF files
            const arrayBuffer = await file.arrayBuffer();

            // Calculate file hash for deduplication
            const { calculateFileHash } = await import('./lib/fileHash');
            const fileHash = await calculateFileHash(arrayBuffer);

            // Check if this file already exists (by hash)
            const existingDoc = documents.find(doc => doc.fileHash === fileHash);
            if (existingDoc) {
              console.log(`Skipping duplicate file: ${file.name} (matches ${existingDoc.name})`);
              if (onFileComplete) {
                onFileComplete(filePath, false, '文件已存在');
              }
              continue;
            }

            const arrayBufferCopy = arrayBuffer.slice(0);
            const pdf = await pdfjsLib.getDocument({ data: arrayBufferCopy }).promise;
            const rawOutline = await pdf.getOutline();

            // Parse outline
            let outlineItems: OutlineItem[] = [];
            if (rawOutline && rawOutline.length > 0) {
              const parseOutlineItem = async (item: any, level = 0): Promise<OutlineItem> => {
                let pageNumber = 1;

                try {
                  let dest = item.dest;
                  if (typeof dest === 'string') {
                    dest = await pdf.getDestination(dest);
                  }
                  if (Array.isArray(dest) && dest.length > 0) {
                    const pageIndex = await pdf.getPageIndex(dest[0]);
                    pageNumber = pageIndex + 1;
                  }
                } catch (err) {
                  console.warn('Failed to resolve outline destination:', err);
                }

                const children: OutlineItem[] = [];
                if (item.items && item.items.length > 0) {
                  for (const subItem of item.items) {
                    children.push(await parseOutlineItem(subItem, level + 1));
                  }
                }

                return {
                  id: `outline_${Math.random().toString(36).slice(2)}`,
                  title: item.title || `Page ${pageNumber}`,
                  pageNumber,
                  level,
                  children,
                };
              };

              for (const item of rawOutline) {
                outlineItems.push(await parseOutlineItem(item));
              }
            } else {
              outlineItems = generateSimpleOutline(pdf.numPages);
            }

            const chapters = buildChaptersFromOutline(outlineItems, pdf.numPages);

            const newDoc: SpecDocument = {
              id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: file.name.replace(/\.pdf$/i, ''),
              fullName: file.name,
              category: category,
              totalPages: pdf.numPages,
              fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
              createdAt: new Date().toISOString(),
              lastReadPage: 1,
              readingProgress: 0,
              pdfBuffer: arrayBuffer.slice(0),
              outline: outlineItems,
              chapters,
              fileHash,
              parentCollectionId: parentId,  // Fixed: use parentId instead of parentCollectionId
            };

            await saveDocument(newDoc);
            setDocuments((prev) => [...prev, newDoc]);
            createdDocIds.push(newDoc.id);

            // Notify upload complete
            if (onFileComplete) {
              onFileComplete(filePath, true);
            }

            // Upload to R2 if configured (don't wait for it)
            const r2Config = await getR2SyncConfig();
            if (r2Config && r2Config.accountId && r2Config.accessKeyId && r2Config.secretAccessKey) {
              const docCategory = newDoc.category || 'uncategorized';
              syncDocumentToR2(newDoc.id, arrayBuffer.slice(0), r2Config, docCategory)
                .then(async (result) => {
                  if (result.success) {
                    console.log('Document uploaded to R2:', result.r2Path);

                    const { uploadJsonToR2 } = await import('./lib/r2Service');
                    const metadata = {
                      id: newDoc.id,
                      name: newDoc.name,
                      fullName: newDoc.fullName,
                      category: newDoc.category,
                      totalPages: newDoc.totalPages,
                      fileSize: newDoc.fileSize,
                      createdAt: newDoc.createdAt,
                      lastReadPage: newDoc.lastReadPage,
                      outline: newDoc.outline,
                      chapters: newDoc.chapters,
                      fileHash: newDoc.fileHash,
                      parentCollectionId: newDoc.parentCollectionId,
                    };

                    const metadataPath = `metadata/${docCategory}/${newDoc.id}.json`;
                    await uploadJsonToR2(metadataPath, metadata, r2Config);
                  }
                })
                .catch((err) => {
                  console.error('Failed to upload document to R2:', err);
                });
            }

            // Small delay between uploads to prevent blocking
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (err: any) {
            console.error('Failed to upload file:', file.name, err);
            if (onFileComplete) {
              onFileComplete(filePath, false, err.message || '上传失败');
            }
          }
        }
      }

      return createdDocIds;
    };

    // Start processing from root
    // Important: fileTree is the root node with name 'root', we need to process its children
    // If parentCollectionId is provided, use it as the parent, otherwise use undefined (root level)
    await processNode(fileTree, parentCollectionId, false);

    // Auto-sync metadata bundle to R2 after batch upload
    syncMetadataBundleToR2();
  };

  // Sync books from R2
  const handleSyncFromR2 = async () => {
    const r2Config = await getR2SyncConfig();
    if (!r2Config || !r2Config.accountId || !r2Config.accessKeyId) {
      alert('请先配置 R2 存储设置');
      return;
    }

    try {
      setStatusMessage('正在从 R2 下载元数据...');

      // Try to download the metadata bundle first (fast path)
      const { downloadAllMetadataFromR2 } = await import('./lib/r2Service');
      const bundleResult = await downloadAllMetadataFromR2(r2Config);

      if (bundleResult.success && bundleResult.data) {
        console.log('Using metadata bundle for sync');
        const metadataBundle = bundleResult.data;
        const allDocuments = metadataBundle.documents || [];

        setStatusMessage(`正在同步 ${allDocuments.length} 个文档...`);

        let syncedCount = 0;
        let skippedCount = 0;

        for (let i = 0; i < allDocuments.length; i++) {
          const metadata = allDocuments[i];

          // Check if document already exists locally
          const existingDoc = documents.find(d => d.id === metadata.id);
          if (existingDoc && existingDoc.pdfBuffer) {
            skippedCount++;
            continue;
          }

          // Check for duplicates by fileHash
          if (metadata.fileHash) {
            const duplicateDoc = documents.find(d => d.fileHash === metadata.fileHash);
            if (duplicateDoc) {
              console.log('Duplicate file detected by hash, skipping:', metadata.id);
              skippedCount++;
              continue;
            }
          }

          const virtualDoc: SpecDocument = {
            id: metadata.id,
            name: metadata.name,
            fullName: metadata.fullName,
            category: metadata.category,
            totalPages: metadata.totalPages,
            fileSize: metadata.fileSize,
            createdAt: metadata.createdAt,
            lastReadPage: metadata.lastReadPage,
            readingProgress: 0,
            pdfBuffer: undefined as any,
            outline: metadata.outline || [],
            chapters: metadata.chapters || [],
            fileHash: metadata.fileHash,
            parentCollectionId: metadata.parentCollectionId,
            isCollection: metadata.isCollection,
            childDocIds: metadata.childDocIds || [],
            version: metadata.version,
          };

          await saveDocument(virtualDoc);
          syncedCount++;

          // Update progress every 5 documents
          if (i % 5 === 0) {
            setStatusMessage(`正在同步 ${i + 1}/${allDocuments.length}...`);
          }
        }

        setStatusMessage('同步完成，正在刷新...');

        // Reload all documents from IndexedDB
        const allDocs = await getAllDocuments();
        console.log('Reloaded documents after sync:', allDocs.length);

        // Check for orphaned documents and create missing collections
        const collectionIds = new Set(allDocs.filter(d => d.isCollection).map(d => d.id));
        const orphanedDocs = allDocs.filter(d => d.parentCollectionId && !collectionIds.has(d.parentCollectionId));

        if (orphanedDocs.length > 0) {
          console.warn(`Found ${orphanedDocs.length} orphaned documents (missing parent collections)`);

          const missingCollectionIds = new Set(orphanedDocs.map(d => d.parentCollectionId).filter(Boolean));

          for (const collectionId of missingCollectionIds) {
            const collectionDoc: SpecDocument = {
              id: collectionId as string,
              name: '未命名集合',
              fullName: '未命名集合',
              category: 'custom',
              totalPages: 0,
              fileSize: '0 MB',
              createdAt: new Date().toISOString(),
              lastReadPage: 1,
              readingProgress: 0,
              outline: [],
              chapters: [],
              isCollection: true,
              childDocIds: orphanedDocs.filter(d => d.parentCollectionId === collectionId).map(d => d.id),
            };

            await saveDocument(collectionDoc);
            console.log('Created missing collection:', collectionId);
          }

          const finalDocs = await getAllDocuments();
          setDocuments(finalDocs);
          console.log('Final document count after creating missing collections:', finalDocs.length);
        } else {
          setDocuments(allDocs);
        }

        setStatusMessage('');
        alert(`同步完成！\n成功同步: ${syncedCount} 个文档\n跳过: ${skippedCount} 个文档`);
        return;
      }

      // Fallback to old method if bundle doesn't exist
      console.log('Metadata bundle not found, using legacy sync method');
      setStatusMessage('正在列出 R2 中的文档...');

      const { listDocumentsFromR2 } = await import('./lib/r2Service');
      const result = await listDocumentsFromR2(r2Config);

      if (!result.success || !result.documents) {
        alert(`从 R2 同步失败: ${result.error || '未知错误'}`);
        return;
      }

      console.log('Found', result.documents.length, 'documents in R2');

      let syncedCount = 0;
      let skippedCount = 0;
      const totalDocs = result.documents.length;

      setStatusMessage(`正在同步文档 0/${totalDocs}...`);

      for (let i = 0; i < result.documents.length; i++) {
        const doc = result.documents[i];

        setStatusMessage(`正在同步 ${i + 1}/${totalDocs}: ${doc.fileName}`);

        const existingDoc = documents.find(d => d.id === doc.docId);
        if (existingDoc && existingDoc.pdfBuffer) {
          console.log('Document already exists locally:', doc.docId);
          skippedCount++;
          continue;
        }

        const metadataPath = `metadata/${doc.category}/${doc.docId}.json`;
        const { downloadJsonFromR2 } = await import('./lib/r2Service');
        const metadataResult = await downloadJsonFromR2(metadataPath, r2Config);

        if (metadataResult.success && metadataResult.data) {
          const metadata = metadataResult.data;

          if (metadata.fileHash) {
            const duplicateDoc = documents.find(d => d.fileHash === metadata.fileHash);
            if (duplicateDoc) {
              console.log('Duplicate file detected by hash, skipping:', doc.docId);
              skippedCount++;
              continue;
            }
          }

          const virtualDoc: SpecDocument = {
            id: metadata.id || doc.docId,
            name: metadata.name || doc.fileName.replace(/\.pdf$/i, ''),
            fullName: metadata.fullName || doc.fileName,
            category: metadata.category || doc.category,
            totalPages: metadata.totalPages || 0,
            fileSize: metadata.fileSize || `${(doc.size / (1024 * 1024)).toFixed(1)} MB`,
            createdAt: metadata.createdAt || new Date().toISOString(),
            lastReadPage: metadata.lastReadPage || 1,
            readingProgress: 0,
            pdfBuffer: undefined as any,
            outline: metadata.outline || [],
            chapters: metadata.chapters || [],
            fileHash: metadata.fileHash,
            parentCollectionId: metadata.parentCollectionId,
            isCollection: metadata.isCollection,
            childDocIds: metadata.childDocIds || [],
            version: metadata.version,
          };

          await saveDocument(virtualDoc);
          setDocuments((prev) => {
            const filtered = prev.filter(d => d.id !== virtualDoc.id);
            return [...filtered, virtualDoc];
          });

          syncedCount++;
          console.log('Synced metadata for:', doc.docId);
        } else {
          console.warn('Failed to download metadata for:', doc.docId, metadataResult.error);
          skippedCount++;
        }

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      setStatusMessage('同步完成，正在刷新...');

      const allDocs = await getAllDocuments();
      console.log('Reloaded documents after sync:', allDocs.length);

      const collectionIds = new Set(allDocs.filter(d => d.isCollection).map(d => d.id));
      const orphanedDocs = allDocs.filter(d => d.parentCollectionId && !collectionIds.has(d.parentCollectionId));

      if (orphanedDocs.length > 0) {
        console.warn(`Found ${orphanedDocs.length} orphaned documents (missing parent collections)`);

        const missingCollectionIds = new Set(orphanedDocs.map(d => d.parentCollectionId).filter(Boolean));

        for (const collectionId of missingCollectionIds) {
          const collectionDoc: SpecDocument = {
            id: collectionId as string,
            name: '未命名集合',
            fullName: '未命名集合',
            category: 'custom',
            totalPages: 0,
            fileSize: '0 MB',
            createdAt: new Date().toISOString(),
            lastReadPage: 1,
            readingProgress: 0,
            outline: [],
            chapters: [],
            isCollection: true,
            childDocIds: orphanedDocs.filter(d => d.parentCollectionId === collectionId).map(d => d.id),
          };

          await saveDocument(collectionDoc);
          console.log('Created missing collection:', collectionId);
        }

        const finalDocs = await getAllDocuments();
        setDocuments(finalDocs);
        console.log('Final document count after creating missing collections:', finalDocs.length);
      } else {
        setDocuments(allDocs);
      }

      setStatusMessage('');
      alert(`同步完成！\n成功同步: ${syncedCount} 个文档\n跳过: ${skippedCount} 个文档`);
    } catch (err: any) {
      console.error('Sync from R2 failed:', err);
      setStatusMessage('');
      alert(`同步失败: ${err.message}`);
    }
  };

  // Handle document download from R2
  const handleDownloadFromR2 = async (
    docId: string,
    pdfBuffer: ArrayBuffer,
    category: string,
    fileName: string
  ) => {
    try {
      // Parse PDF to get outline and metadata
      const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
      const pdfDoc = await loadingTask.promise;
      const totalPages = pdfDoc.numPages;

      // Extract outline
      const rawOutline = await pdfDoc.getOutline();
      let outlineItems: OutlineItem[] = [];

      if (rawOutline && rawOutline.length > 0) {
        const parseOutlineItem = async (item: any, level = 0): Promise<OutlineItem> => {
          const dest = item.dest;
          let pageNumber = 1;

          if (typeof dest === 'string') {
            try {
              const ref = await pdfDoc.getDestination(dest);
              if (ref && ref[0]) {
                const pageIndex = await pdfDoc.getPageIndex(ref[0]);
                pageNumber = pageIndex + 1;
              }
            } catch (err) {
              console.warn('Failed to resolve destination:', err);
            }
          } else if (Array.isArray(dest) && dest[0]) {
            try {
              const pageIndex = await pdfDoc.getPageIndex(dest[0]);
              pageNumber = pageIndex + 1;
            } catch (err) {
              console.warn('Failed to resolve destination:', err);
            }
          }

          const children = item.items && item.items.length > 0
            ? await Promise.all(item.items.map((child: any) => parseOutlineItem(child, level + 1)))
            : [];

          return {
            id: `outline_${Date.now()}_${Math.random()}`,
            title: item.title || 'Untitled',
            pageNumber,
            level,
            children,
          };
        };

        outlineItems = await Promise.all(rawOutline.map((item) => parseOutlineItem(item, 0)));
      } else {
        outlineItems = generateSimpleOutline(totalPages);
      }

      const generatedChapters = buildChaptersFromOutline(outlineItems, totalPages);

      const newDoc: SpecDocument = {
        id: docId,
        name: fileName.replace(/\.pdf$/i, ''),
        fullName: fileName,
        category,
        totalPages,
        fileSize: `${(pdfBuffer.byteLength / (1024 * 1024)).toFixed(1)} MB`,
        createdAt: new Date().toISOString(),
        lastReadPage: 1,
        pdfBuffer: pdfBuffer, // Don't call slice again, already copied in R2SyncModal
        outline: outlineItems,
        chapters: generatedChapters,
      };

      // Debug: Log outline before saving
      console.log('[handleDownloadFromR2] Outline before saving:', JSON.stringify(outlineItems.slice(0, 3), null, 2));

      await saveDocument(newDoc);
      setDocuments((prev) => [...prev, newDoc]);
      setCurrentDocId(newDoc.id);
      setCurrentPage(1);
      setIsR2SyncModalOpen(false);

      alert(`文档 "${fileName}" 已成功下载到本地`);
    } catch (err: any) {
      console.error('Failed to parse downloaded PDF:', err);
      alert(`下载失败: ${err.message}`);
    }
  };

  // Delete custom document
  const handleDeleteDoc = async (docId: string) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;

    const isPreset = presetDocs.some((p) => p.id === docId);
    const confirmMsg = isPreset
      ? '确定要删除这个预设图书吗？删除后可以重新刷新页面恢复。'
      : '确定要从本地藏书阁中移除此文档吗？此操作将同时删除 R2 云端的文件。';

    if (!confirm(confirmMsg)) return;

    // Step 1: Delete from local IndexedDB and update UI immediately
    await deleteDocument(docId);
    setDocuments((prev) => {
      const filtered = prev.filter((d) => d.id !== docId);
      console.log('✓ Local document deleted, UI updated:', filtered.length, 'docs remaining');
      return filtered;
    });

    // If the deleted document was currently open, switch to another document
    if (currentDocId === docId) {
      const remaining = documents.filter((d) => d.id !== docId);
      const nextDoc = remaining[0] || presetDocs[0];
      if (nextDoc) {
        setCurrentDocId(nextDoc.id);
        setCurrentPage(1);
      }
      setUserFocus('');
    }

    // Step 2: Delete from R2 in background (async, non-blocking)
    (async () => {
      try {
        const r2Config = await getR2SyncConfig();
        if (r2Config && r2Config.accountId && r2Config.accessKeyId && r2Config.secretAccessKey) {
          const { deleteDocumentFromR2 } = await import('./lib/r2Service');
          const docCategory = doc.category || 'uncategorized';

          // Delete PDF file
          const pdfPath = `${docCategory}/${docId}.pdf`;
          const pdfResult = await deleteDocumentFromR2(pdfPath, r2Config);
          if (pdfResult.success) {
            console.log('✓ Deleted PDF from R2:', pdfPath);
          } else {
            console.warn('✗ Failed to delete PDF from R2:', pdfResult.error);
          }

          // Delete metadata file
          const metadataPath = `metadata/${docCategory}/${docId}.json`;
          const metadataResult = await deleteDocumentFromR2(metadataPath, r2Config);
          if (metadataResult.success) {
            console.log('✓ Deleted metadata from R2:', metadataPath);
          } else {
            console.warn('✗ Failed to delete metadata from R2:', metadataResult.error);
          }

          // Delete analysis results (chapter and page level)
          if (doc.chapters) {
            for (const chapter of doc.chapters) {
              const userId = currentUser.id.replace('user_', '');
              const chapterAnalysisPath = `analysis/${docCategory}/${docId}/chapter_${chapter.id}_${userId}.json`;
              await deleteDocumentFromR2(chapterAnalysisPath, r2Config);
            }
          }

          console.log('✓ R2 cleanup completed for:', docId);

          // Auto-sync metadata bundle to R2 after deletion
          syncMetadataBundleToR2();
        }
      } catch (err) {
        console.warn('Error deleting from R2:', err);
      }
    })();
  };

  // Save category
  const handleSaveCategory = async (category: BookCategory) => {
    await saveCategory(category);
    const updatedCategories = await getAllCategories();
    setCategories(updatedCategories);
  };

  // Delete category
  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await deleteCategory(categoryId);

      // Move all documents from deleted category to 'custom'
      const docsInCategory = documents.filter((d) => d.category === categoryId);
      for (const doc of docsInCategory) {
        const updatedDoc = { ...doc, category: 'custom' };
        await saveDocument(updatedDoc);
      }

      // Refresh categories and documents
      const updatedCategories = await getAllCategories();
      setCategories(updatedCategories);

      const customDocs = await getAllDocuments();
      setDocuments([...presetDocs, ...customDocs]);
    } catch (err: any) {
      alert(err.message || '删除类别失败');
    }
  };

  // Update document category
  const handleUpdateDocCategory = async (docId: string, newCategoryId: string) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;

    const updatedDoc = { ...doc, category: newCategoryId };
    await saveDocument(updatedDoc);

    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? updatedDoc : d))
    );
  };

  // Save engineer's custom notes
  const handleUpdateNotes = async (notes: string) => {
    if (analysisScope === 'chapter' && activeChapter && cachedChapterAnalysis) {
      const cacheKey = cachedChapterAnalysis.id;
      await updateChapterCustomNotes(cacheKey, notes);
      setCachedChapterAnalysis((prev) => (prev ? { ...prev, customNotes: notes } : null), activeChapter?.id || '');
    } else if (cachedAnalysis) {
      const cacheKey = makeCacheKey(currentDocId, currentPage, 'v1');
      await updateCustomNotes(cacheKey, notes);
      setCachedAnalysis((prev) => (prev ? { ...prev, customNotes: notes } : null));
    }
  };

  // Resizable panel state
  const [rightPanelWidth, setRightPanelWidth] = useState(520);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = rightPanelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = dragStartXRef.current - e.clientX;
      const newWidth = Math.max(160, Math.min(1000, dragStartWidthRef.current + delta));
      setRightPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
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
        onDeleteUser={handleDeleteUser}
        onOpenR2Modal={() => setIsR2ModalOpen(true)}
        onOpenBatchUploadModal={() => setIsBatchUploadModalOpen(true)}
      />

      {/* Global Status Message Bar */}
      {statusMessage && (
        <div className="bg-indigo-600 text-white px-4 py-2 text-sm font-medium text-center flex items-center justify-center space-x-2">
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>{statusMessage}</span>
        </div>
      )}

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
            onOpenR2SyncModal={handleSyncFromR2}
            categories={categories}
            onSaveCategory={handleSaveCategory}
            onDeleteCategory={handleDeleteCategory}
            onUpdateDocCategory={handleUpdateDocCategory}
          />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Document Outline Sidebar */}
          {isOutlineOpen && currentDoc && (
            <aside className="w-56 lg:w-64 h-full shrink-0 hidden md:block">
              <DocumentOutline
                outline={currentDoc.outline}
                currentPage={currentPage}
                onSelectPage={(p) => setCurrentPage(p)}
                cachedPages={cachedPagesSet}
                cachedChapters={cachedChaptersMap[currentDocId] || new Set()}
                totalPages={currentDoc.totalPages}
              />
            </aside>
          )}

          {/* Center: PDF / Document Viewport (Continuous & Single Layout) */}
          <section className="flex-1 h-full flex flex-col min-w-0">
            {currentDoc ? (
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
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-slate-500 dark:text-slate-400">
                  <p className="text-lg font-medium mb-2">暂无文档</p>
                  <p className="text-sm">请点击"导入新书 (PDF)"或"从 R2 同步"来添加文档</p>
                </div>
              </div>
            )}
          </section>

          {/* Drag divider */}
          <div
            onMouseDown={handleDividerMouseDown}
            className="w-1 h-full bg-slate-800 hover:bg-indigo-500 cursor-col-resize transition-colors shrink-0 relative group"
            title="拖拽调整面板宽度"
          >
            <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-indigo-500/10" />
          </div>

          {/* Right: AI Spec 讲解专家 Rich Chapter & Page Breakdown Panel */}
          <section
            style={{ width: rightPanelWidth }}
            className="h-full flex flex-col shrink-0 border-l border-slate-800"
          >
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
              chapterTitle={activeChapter?.title || presetPageData?.chapterTitle || currentDoc?.name || ''}
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
        docName={currentDoc?.name || ''}
        pageNum={currentPage}
        chapterTitle={activeChapter?.title || presetPageData?.chapterTitle || currentDoc?.name || ''}
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

      {/* Batch Upload Modal */}
      <BatchUploadModal
        isOpen={isBatchUploadModalOpen}
        onClose={() => setIsBatchUploadModalOpen(false)}
        categories={categories}
        documents={documents}
        onBatchUpload={handleBatchUpload}
        onBatchUploadWithStructure={handleBatchUploadWithStructure}
      />

      {/* Cloudflare R2 Config Modal */}
      <R2ConfigModal
        isOpen={isR2ModalOpen}
        onClose={() => setIsR2ModalOpen(false)}
      />

      {/* Cloudflare R2 Sync Hub Modal */}
      {isR2SyncModalOpen && r2ConfigForSync && (
        <R2SyncModal
          isOpen={isR2SyncModalOpen}
          onClose={() => setIsR2SyncModalOpen(false)}
          r2Config={r2ConfigForSync}
          onDownloadComplete={handleDownloadFromR2}
        />
      )}

      {/* Upload Target Selection Modal */}
      <UploadTargetModal
        isOpen={isUploadTargetModalOpen}
        onClose={() => {
          setIsUploadTargetModalOpen(false);
          setPendingUploadFile(null);
        }}
        onConfirm={handleUploadTargetConfirm}
        documents={documents}
        categories={categories}
      />
    </div>
  );
}

