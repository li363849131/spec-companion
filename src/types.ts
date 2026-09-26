export interface AISettings {
  provider: 'gemini' | 'openai_compatible';
  baseUrl: string; // Custom relay or gateway URL
  apiKey: string;  // Custom API key if user wants to override
  model: string;   // Model name
}

export interface UserProfile {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
  currentDocId?: string;
  currentChapterId?: string;
  currentPage?: number;
}

export interface R2SyncConfig {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicDomain: string; // e.g. https://r2.mycompany.com or worker URL
  autoSync: boolean;
  lastSyncedAt?: string;
}

export interface ChapterItem {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
  level: number;
  summary?: string;
  isCached?: boolean;
}

export interface BookCategory {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  isBuiltIn?: boolean; // 内置类别不可删除
  createdAt: string;

  // 新增：支持子类别
  parentCategoryId?: string; // 父类别 ID（如果是子类别）
  isSubcategory?: boolean; // 是否是子类别
}

export interface SpecDocument {
  id: string;
  name: string;
  fullName?: string;
  category: string; // Changed to string to support custom categories
  tags?: string[]; // Additional tags for filtering
  totalPages: number;
  fileSize?: string;
  version?: string;
  createdAt: string;
  lastReadPage: number;
  lastReadChapterId?: string;
  readingProgress?: number; // 0 - 100 percentage
  coverColor?: string;
  description?: string;
  userId?: string; // Scoped to user profile
  pdfData?: string; // Data URL or ArrayBuffer base64 for custom PDFs
  pdfBuffer?: ArrayBuffer;
  outline: OutlineItem[];
  chapters?: ChapterItem[]; // Flattened or hierarchical chapter ranges
  r2Path?: string; // R2 storage path if synced to cloud
  fileHash?: string; // SHA-256 hash of the PDF file for deduplication

  // 新增：集合支持
  isCollection?: boolean; // true 表示这是一个文档集合，而不是单个文档
  childDocIds?: string[]; // 如果是集合，这里存储子文档/子集合的 ID
  parentCollectionId?: string; // 所属的父集合 ID（如果有）
}

export interface ChapterAnalysis {
  id: string; // user_${userId}_${docId}_${chapterId}_v1
  docId: string;
  chapterId: string;
  chapterTitle: string;
  startPage: number;
  endPage: number;
  markdownContent: string;
  promptVersion?: string;
  createdAt: string;
  updatedAt: string;
  customNotes?: string;
  tags?: string[];
  hitCount?: number;
  userId?: string;
}

export interface OutlineItem {
  id: string;
  title: string;
  pageNumber: number;
  level: number;
  children?: OutlineItem[];
}

export interface PageContent {
  docId: string;
  pageNum: number;
  chapterTitle: string;
  pageText: string;
  canvasImage?: string; // base64 PNG dataUrl
  prevPageSummary?: string;
}

export interface CachedAnalysis {
  id: string; // cache_key: doc_id_page_num_v1
  docId: string;
  pageNum: number;
  chapterTitle: string;
  markdownContent: string;
  promptVersion: string;
  createdAt: string;
  updatedAt: string;
  customNotes?: string;
  tags?: string[];
  hitCount?: number;
}

export interface QAInteraction {
  id: string;
  docId: string;
  pageNum: number;
  selectedText?: string;
  question: string;
  answer: string;
  createdAt: string;
}

export interface PresetSpecPage {
  pageNum: number;
  chapterTitle: string;
  sectionNumber: string;
  pageHeading: string;
  summary: string;
  text: string;
  diagramSvg?: string; // Inline SVG timing/register diagram
  tableData?: {
    title: string;
    headers: string[];
    rows: string[][];
  };
  sampleExplanation: string; // Preloaded high-grade senior architect breakdown
}

export interface PresetSpec {
  id: string;
  name: string;
  fullName: string;
  category: 'pcie' | 'arm' | 'cxl' | 'usb';
  version: string;
  totalPages: number;
  outline: OutlineItem[];
  pages: PresetSpecPage[];
}
