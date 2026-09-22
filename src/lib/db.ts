import { CachedAnalysis, ChapterAnalysis, QAInteraction, R2SyncConfig, SpecDocument, UserProfile } from '../types';

const DB_NAME = 'SpecCompanionDB';
const DB_VERSION = 3;

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
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('chapter_cache', 'readwrite');
        const store = tx.objectStore('chapter_cache');
        const request = store.put(analysis);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (e) {
        resolve();
      }
    });
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
  try {
    const db = await getDB();
    if (!hasStore(db, 'r2_config')) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('r2_config', 'readonly');
        const req = tx.objectStore('r2_config').get('default_r2');
        req.onsuccess = () => resolve((req.result as any)?.config || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function saveR2SyncConfig(config: R2SyncConfig): Promise<void> {
  try {
    const db = await getDB();
    if (!hasStore(db, 'r2_config')) return;
    const tx = db.transaction('r2_config', 'readwrite');
    tx.objectStore('r2_config').put({ id: 'default_r2', config });
  } catch (err) {
    console.warn('Failed to save R2 config', err);
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
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('page_cache', 'readwrite');
        const store = tx.objectStore('page_cache');
        const request = store.put(analysis);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch {
        resolve();
      }
    });
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
