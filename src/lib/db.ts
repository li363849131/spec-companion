import { CachedAnalysis, ChapterAnalysis, QAInteraction, R2SyncConfig, SpecDocument, UserProfile, BookCategory } from '../types';

const DB_NAME = 'SpecCompanionDB';
const DB_VERSION = 4;

let dbPromise: Promise<IDBDatabase> | null = null;

function hasStore(db: IDBDatabase, storeName: string): boolean {
  return db.objectStoreNames.contains(storeName);
}

export const DEFAULT_PROFILES: UserProfile[] = [
  {
    id: 'user_jerry',
    name: 'Jerry (资深芯片架构师)',
    role: '芯片与系统总线架构负责人',
    avatarColor: 'from-indigo-600 to-blue-600',
  },
  {
    id: 'user_firmware',
    name: '固件与Linux内核开发组',
    role: '底层驱动与BIOS工程师',
    avatarColor: 'from-emerald-600 to-teal-600',
  },
  {
    id: 'user_guest',
    name: '访客工程师 (默认视窗)',
    role: '芯片验证与技术调研',
    avatarColor: 'from-amber-600 to-orange-600',
  },
];

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    // Request persistent storage to prevent data loss
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then((persistent) => {
        if (persistent) {
          console.log('Persistent storage granted');
        } else {
          console.warn('Persistent storage not granted - data may be cleared by browser');
        }
      });
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Store for cached page analyses
      if (!db.objectStoreNames.contains('page_cache')) {
        const cacheStore = db.createObjectStore('page_cache', { keyPath: 'id' });
        cacheStore.createIndex('docId', 'docId', { unique: false });
        cacheStore.createIndex('docId_pageNum', ['docId', 'pageNum'], { unique: true });
      }

      // 2. Store for custom uploaded documents
      if (!db.objectStoreNames.contains('documents')) {
        const docStore = db.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('userId', 'userId', { unique: false });
      }

      // 3. Store for Q&A interactions
      if (!db.objectStoreNames.contains('qa_interactions')) {
        const qaStore = db.createObjectStore('qa_interactions', { keyPath: 'id' });
        qaStore.createIndex('docId', 'docId', { unique: false });
        qaStore.createIndex('docId_pageNum', ['docId', 'pageNum'], { unique: false });
      }

      // 4. Store for Chapter-level Analysis cache
      if (!db.objectStoreNames.contains('chapter_cache')) {
        const chapterStore = db.createObjectStore('chapter_cache', { keyPath: 'id' });
        chapterStore.createIndex('docId', 'docId', { unique: false });
        chapterStore.createIndex('userId', 'userId', { unique: false });
        chapterStore.createIndex('docId_chapterId', ['docId', 'chapterId'], { unique: false });
      }

      // 5. Store for User Profiles
      if (!db.objectStoreNames.contains('user_profiles')) {
        db.createObjectStore('user_profiles', { keyPath: 'id' });
      }

      // 6. Store for R2 Sync Config
      if (!db.objectStoreNames.contains('r2_config')) {
        db.createObjectStore('r2_config', { keyPath: 'id' });
      }

      // 7. Store for Custom Categories
      if (!db.objectStoreNames.contains('categories')) {
        const catStore = db.createObjectStore('categories', { keyPath: 'id' });
        catStore.createIndex('userId', 'userId', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

export function makeCacheKey(docId: string, pageNum: number, version = 'v1'): string {
  return `${docId}_p${pageNum}_${version}`;
}

export function makeChapterCacheKey(docId: string, chapterId: string, userId = 'default', version = 'v1'): string {
  return `user_${userId}_${docId}_ch_${chapterId}_${version}`;
}

// ================= USER PROFILES =================

export function getActiveUserId(): string {
  if (typeof window === 'undefined') return 'user_jerry';
  const saved = localStorage.getItem('spec_active_user_id');
  return saved || 'user_jerry';
}

export function setActiveUserId(userId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('spec_active_user_id', userId);
  }
}

export async function getAllUserProfiles(): Promise<UserProfile[]> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'user_profiles')) {
      return DEFAULT_PROFILES;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('user_profiles', 'readonly');
        const store = tx.objectStore('user_profiles');
        const req = store.getAll();
        req.onsuccess = () => {
          const list = (req.result || []) as UserProfile[];
          if (!list || list.length === 0) {
            // Initialize defaults
            DEFAULT_PROFILES.forEach((p) => saveUserProfile(p));
            resolve(DEFAULT_PROFILES);
          } else {
            resolve(list);
          }
        };
        req.onerror = () => resolve(DEFAULT_PROFILES);
      } catch {
        resolve(DEFAULT_PROFILES);
      }
    });
  } catch {
    return DEFAULT_PROFILES;
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'user_profiles')) return;
    const tx = db.transaction('user_profiles', 'readwrite');
    tx.objectStore('user_profiles').put(profile);
  } catch (err) {
    console.warn('Failed to save profile', err);
  }
}

// ================= CHAPTER LEVEL CACHE =================

export async function getCachedChapterAnalysis(
  docId: string,
  chapterId: string,
  userId = getActiveUserId(),
  version = 'v1'
): Promise<ChapterAnalysis | null> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'chapter_cache')) return null;
    const key = makeChapterCacheKey(docId, chapterId, userId, version);

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('chapter_cache', 'readwrite');
        const store = tx.objectStore('chapter_cache');
        const request = store.get(key);

        request.onsuccess = () => {
          const item = request.result as ChapterAnalysis | undefined;
          if (item) {
            item.hitCount = (item.hitCount || 0) + 1;
            store.put(item);
            resolve(item);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch (err) {
    console.warn('Failed to read chapter analysis from IndexedDB', err);
    return null;
  }
}

export async function saveCachedChapterAnalysis(analysis: ChapterAnalysis): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'chapter_cache')) return;
    await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('chapter_cache', 'readwrite');
        const store = tx.objectStore('chapter_cache');
        const request = store.put(analysis);

        request.onsuccess = () => resolve(undefined);
        request.onerror = () => reject(request.error);
      } catch (e) {
        resolve(undefined);
      }
    });

    // Auto-sync to R2 if configured
    try {
      const r2Config = await getR2SyncConfig();
      if (r2Config && r2Config.autoSync && r2Config.accountId && r2Config.accessKeyId) {
        const { uploadAnalysisToR2 } = await import('./r2AnalysisService');
        // Get document to find its category (query from IndexedDB)
        const db = await getDB();
        if (hasStore(db, 'documents')) {
          const doc = await new Promise<any>((resolve) => {
            const tx = db.transaction('documents', 'readonly');
            const store = tx.objectStore('documents');
            const request = store.get(analysis.docId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
          });
          const category = doc?.category || 'uncategorized';
          uploadAnalysisToR2(analysis, r2Config, 'chapter', category).catch(err => {
            console.warn('R2 auto-sync failed for chapter analysis:', err);
          });
        }
      }
    } catch (err) {
      console.warn('R2 auto-sync check failed:', err);
    }
  } catch (err) {
    console.error('Failed to save chapter analysis', err);
  }
}

export async function getAllCachedChaptersForDoc(
  docId: string,
  userId = getActiveUserId()
): Promise<ChapterAnalysis[]> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'chapter_cache')) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('chapter_cache', 'readonly');
        const store = tx.objectStore('chapter_cache');
        const index = store.index('docId');
        const request = index.getAll(docId);

        request.onsuccess = () => {
          const all = (request.result || []) as ChapterAnalysis[];
          // Filter by user if userId matches
          const filtered = all.filter((c) => !c.userId || c.userId === userId);
          resolve(filtered);
        };

        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  } catch {
    return [];
  }
}

export async function updateChapterCustomNotes(cacheKey: string, notes: string): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'chapter_cache')) return;
    const tx = db.transaction('chapter_cache', 'readwrite');
    const store = tx.objectStore('chapter_cache');
    const getReq = store.get(cacheKey);

    getReq.onsuccess = () => {
      const item = getReq.result as ChapterAnalysis | undefined;
      if (item) {
        item.customNotes = notes;
        item.updatedAt = new Date().toISOString();
        store.put(item);
      }
    };
  } catch (err) {
    console.error('Error updating chapter notes', err);
  }
}

// ================= R2 SYNC CONFIG =================

export async function getR2SyncConfig(): Promise<R2SyncConfig | null> {
  // Use hardcoded config from config file
  try {
    const { R2_CONFIG } = await import('../config/r2Config');
    return R2_CONFIG;
  } catch (err) {
    console.error('Failed to load R2 config:', err);
    return null;
  }
}

export async function saveR2SyncConfig(config: R2SyncConfig): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'r2_config')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('r2_config', 'readwrite');
        const req = tx.objectStore('r2_config').put({ id: 'default_r2', config });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (err) {
    console.error('Error saving R2 config', err);
  }
}

// ================= CATEGORY MANAGEMENT =================

export const DEFAULT_CATEGORIES: BookCategory[] = [
  {
    id: 'pcie',
    name: 'PCIe 互连协议',
    description: 'PCI Express 总线协议规范',
    color: 'from-blue-600 to-cyan-600',
    icon: 'Cpu',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'arm',
    name: 'ARM 体系结构',
    description: 'ARM 架构与 AMBA 总线协议',
    color: 'from-emerald-600 to-teal-600',
    icon: 'Layers',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cxl',
    name: 'CXL 内存池化',
    description: 'Compute Express Link 协议',
    color: 'from-purple-600 to-pink-600',
    icon: 'Database',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'usb',
    name: 'USB/外设接口',
    description: 'USB 与其他外设接口协议',
    color: 'from-amber-600 to-orange-600',
    icon: 'Zap',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'custom',
    name: '自定义上传',
    description: '用户上传的文档',
    color: 'from-slate-600 to-gray-600',
    icon: 'Upload',
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export async function getAllCategories(): Promise<BookCategory[]> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'categories')) return DEFAULT_CATEGORIES;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('categories', 'readonly');
        const store = tx.objectStore('categories');
        const request = store.getAll();

        request.onsuccess = () => {
          const userCategories = (request.result || []) as BookCategory[];

          // Only return user categories, don't auto-merge DEFAULT_CATEGORIES
          // This allows built-in categories to be deleted
          if (userCategories.length > 0) {
            resolve(userCategories);
          } else {
            // First time, return defaults
            resolve(DEFAULT_CATEGORIES);
          }
        };

        request.onerror = () => resolve(DEFAULT_CATEGORIES);
      } catch {
        resolve(DEFAULT_CATEGORIES);
      }
    });
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export async function saveCategory(category: BookCategory): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'categories')) return;

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('categories', 'readwrite');
        const store = tx.objectStore('categories');
        const request = store.put(category);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (err) {
    console.error('Failed to save category', err);
  }
}

export async function deleteCategory(categoryId: string): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'categories')) return;

    // Allow deleting any category, including built-in ones
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('categories', 'readwrite');
        const store = tx.objectStore('categories');
        const request = store.delete(categoryId);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        reject(e);
      }
    });
  } catch (err) {
    console.error('Failed to delete category', err);
    throw err;
  }
}

export async function getCachedAnalysis(docId: string, pageNum: number, version = 'v1'): Promise<CachedAnalysis | null> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'page_cache')) return null;
    const key = makeCacheKey(docId, pageNum, version);

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('page_cache', 'readwrite');
        const store = tx.objectStore('page_cache');
        const request = store.get(key);

        request.onsuccess = () => {
          const item = request.result as CachedAnalysis | undefined;
          if (item) {
            // Increment hit counter
            item.hitCount = (item.hitCount || 0) + 1;
            store.put(item);
            resolve(item);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  } catch (err) {
    console.warn('Failed to read from IndexedDB, falling back to null', err);
    return null;
  }
}

export async function saveCachedAnalysis(analysis: CachedAnalysis): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'page_cache')) return;
    await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('page_cache', 'readwrite');
        const store = tx.objectStore('page_cache');
        const request = store.put(analysis);

        request.onsuccess = () => {
          console.log('✓ Saved cached analysis:', analysis.docId, 'page', analysis.pageNum);
          resolve(undefined);
        };
        request.onerror = () => {
          console.error('✗ Failed to save cached analysis:', request.error);
          reject(request.error);
        };
      } catch (err) {
        console.error('✗ Exception saving cached analysis:', err);
        resolve(undefined);
      }
    });

    // Auto-sync to R2 if configured
    try {
      const r2Config = await getR2SyncConfig();
      if (r2Config && r2Config.autoSync && r2Config.accountId && r2Config.accessKeyId) {
        const { uploadAnalysisToR2 } = await import('./r2AnalysisService');
        // Get document to find its category (query from IndexedDB)
        const db = await getDB();
        if (hasStore(db, 'documents')) {
          const doc = await new Promise<any>((resolve) => {
            const tx = db.transaction('documents', 'readonly');
            const store = tx.objectStore('documents');
            const request = store.get(analysis.docId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
          });
          const category = doc?.category || 'uncategorized';
          uploadAnalysisToR2(analysis, r2Config, 'page', category).catch(err => {
            console.warn('R2 auto-sync failed for page analysis:', err);
          });
        }
      }
    } catch (err) {
      console.warn('R2 auto-sync check failed:', err);
    }
  } catch (err) {
    console.error('Failed to save analysis to IndexedDB', err);
  }
}

export async function getAllCachedForDoc(docId: string): Promise<CachedAnalysis[]> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'page_cache')) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('page_cache', 'readonly');
        const store = tx.objectStore('page_cache');
        const index = store.index('docId');
        const request = index.getAll(docId);

        request.onsuccess = () => {
          const results = (request.result || []) as CachedAnalysis[];
          results.sort((a, b) => a.pageNum - b.pageNum);
          resolve(results);
        };

        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  } catch (err) {
    console.warn('Error reading cached pages for doc', err);
    return [];
  }
}

export async function updateCustomNotes(cacheKey: string, notes: string): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'page_cache')) return;
    const tx = db.transaction('page_cache', 'readwrite');
    const store = tx.objectStore('page_cache');
    const getReq = store.get(cacheKey);

    getReq.onsuccess = () => {
      const item = getReq.result as CachedAnalysis | undefined;
      if (item) {
        item.customNotes = notes;
        item.updatedAt = new Date().toISOString();
        store.put(item);
      }
    };
  } catch (err) {
    console.error('Error updating custom notes', err);
  }
}

export function isBufferDetached(buffer?: ArrayBuffer): boolean {
  if (!buffer) return false;
  try {
    new Uint8Array(buffer, 0, 0);
    return buffer.byteLength === 0 && Boolean((buffer as any).detached);
  } catch {
    return true;
  }
}

export async function saveDocument(doc: SpecDocument): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'documents')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');

        // Safely clone buffer so storing it doesn't fail or detach
        let safeBuffer: ArrayBuffer | undefined = undefined;
        if (doc.pdfBuffer) {
          if (!isBufferDetached(doc.pdfBuffer)) {
            safeBuffer = doc.pdfBuffer.slice(0);
          } else {
            console.warn('Cannot persist detached ArrayBuffer for document:', doc.id);
          }
        }

        const safeDoc: SpecDocument = {
          ...doc,
          pdfBuffer: safeBuffer,
          // Ensure collection fields are preserved
          isCollection: doc.isCollection || false,
          childDocIds: doc.childDocIds || [],
          parentCollectionId: doc.parentCollectionId,
        };

        const req = store.put(safeDoc);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
      } catch {
        resolve();
      }
    });
  } catch (err) {
    console.error('Error saving document', err);
  }
}

export async function deleteDocument(docId: string): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'documents')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('documents', 'readwrite');
        const store = tx.objectStore('documents');
        const req = store.delete(docId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
      } catch {
        resolve();
      }
    });
  } catch (err) {
    console.error('Error deleting document', err);
  }
}

export async function getAllDocuments(): Promise<SpecDocument[]> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'documents')) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('documents', 'readonly');
        const request = tx.objectStore('documents').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  } catch (err) {
    console.warn('Error fetching documents', err);
    return [];
  }
}

export async function saveQAInteraction(qa: QAInteraction): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('qa_interactions', 'readwrite');
    tx.objectStore('qa_interactions').put(qa);
  } catch (err) {
    console.error('Error saving QA interaction', err);
  }
}

export async function getQAForPage(docId: string, pageNum: number): Promise<QAInteraction[]> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('qa_interactions', 'readonly');
      const store = tx.objectStore('qa_interactions');
      const index = store.index('docId_pageNum');
      const request = index.getAll([docId, pageNum]);

      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

// ================= COLLECTION MANAGEMENT =================

/**
 * Get a single document by ID
 */
export async function getDocument(docId: string): Promise<SpecDocument | null> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'documents')) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('documents', 'readonly');
        const store = tx.objectStore('documents');
        const request = store.get(docId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch (err) {
    console.warn('Error fetching document', err);
    return null;
  }
}

/**
 * Add a child document to a collection
 */
export async function addDocumentToCollection(collectionId: string, childDocId: string): Promise<void> {
  try {
    const collection = await getDocument(collectionId);
    if (!collection) {
      throw new Error('Collection not found');
    }

    // Update collection's childDocIds
    const childDocIds = collection.childDocIds || [];
    if (!childDocIds.includes(childDocId)) {
      childDocIds.push(childDocId);
      await saveDocument({ ...collection, childDocIds });
    }

    // Update child's parentCollectionId
    const child = await getDocument(childDocId);
    if (child) {
      await saveDocument({ ...child, parentCollectionId: collectionId });
    }
  } catch (err) {
    console.error('Error adding document to collection', err);
    throw err;
  }
}

/**
 * Remove a child document from a collection
 */
export async function removeDocumentFromCollection(collectionId: string, childDocId: string): Promise<void> {
  try {
    const collection = await getDocument(collectionId);
    if (!collection) return;

    // Update collection's childDocIds
    const childDocIds = (collection.childDocIds || []).filter(id => id !== childDocId);
    await saveDocument({ ...collection, childDocIds });

    // Clear child's parentCollectionId
    const child = await getDocument(childDocId);
    if (child && child.parentCollectionId === collectionId) {
      await saveDocument({ ...child, parentCollectionId: undefined });
    }
  } catch (err) {
    console.error('Error removing document from collection', err);
    throw err;
  }
}

/**
 * Get all children of a collection (non-recursive)
 */
export async function getCollectionChildren(collectionId: string): Promise<SpecDocument[]> {
  try {
    const collection = await getDocument(collectionId);
    if (!collection || !collection.childDocIds) return [];

    const children: SpecDocument[] = [];
    for (const childId of collection.childDocIds) {
      const child = await getDocument(childId);
      if (child) {
        children.push(child);
      }
    }
    return children;
  } catch (err) {
    console.warn('Error fetching collection children', err);
    return [];
  }
}
