import React, { useState, useEffect } from 'react';
import { X, Download, Cloud, CheckCircle2, Loader2 } from 'lucide-react';
import { listDocumentsFromR2, downloadDocumentFromR2 } from '../lib/r2Service';
import { R2SyncConfig } from '../types';

interface R2Document {
  docId: string;
  category: string;
  fileName: string;
  r2Path: string;
  size: number;
  lastModified: string;
}

interface R2SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  r2Config: R2SyncConfig;
  onDownloadComplete: (docId: string, pdfBuffer: ArrayBuffer, category: string, fileName: string) => void;
}

export const R2SyncModal: React.FC<R2SyncModalProps> = ({
  isOpen,
  onClose,
  r2Config,
  onDownloadComplete,
}) => {
  const [documents, setDocuments] = useState<R2Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
    }
  }, [isOpen]);

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listDocumentsFromR2(r2Config);
      if (result.success && result.documents) {
        setDocuments(result.documents);
      } else {
        setError(result.error || '加载失败');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (doc: R2Document) => {
    console.log('Starting download for:', doc);
    setDownloading(prev => new Set(prev).add(doc.docId));
    try {
      console.log('Calling downloadDocumentFromR2 with r2Path:', doc.r2Path);
      const result = await downloadDocumentFromR2(doc.r2Path, r2Config);
      console.log('Download result:', result);

      if (result.success && result.data) {
        console.log('Download successful, buffer size:', result.data.byteLength);
        // Create a copy of the ArrayBuffer to avoid detached buffer issue
        const bufferCopy = result.data.slice(0);
        onDownloadComplete(doc.docId, bufferCopy, doc.category, doc.fileName);
      } else {
        console.error('Download failed:', result.error);
        alert(`下载失败: ${result.error || 'undefined'}`);
      }
    } catch (err: any) {
      console.error('Download exception:', err);
      alert(`下载失败: ${err.message}`);
    } finally {
      setDownloading(prev => {
        const next = new Set(prev);
        next.delete(doc.docId);
        return next;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center space-x-3">
            <Cloud className="w-6 h-6 text-emerald-600" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              从 R2 云端同步书籍
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="text-sm text-slate-500">正在加载文档列表...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <p className="text-sm text-red-600">加载失败: {error}</p>
              <button
                onClick={loadDocuments}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
              >
                重试
              </button>
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Cloud className="w-12 h-12 text-slate-300" />
              <p className="text-sm text-slate-500">R2 上没有找到任何文档</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map(doc => {
                const isDownloading = downloading.has(doc.docId);
                return (
                  <div
                    key={doc.r2Path}
                    className="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {doc.fileName}
                      </p>
                      <div className="flex items-center space-x-3 mt-1">
                        <span className="text-xs text-slate-500">
                          分类: {doc.category}
                        </span>
                        <span className="text-xs text-slate-500">
                          {(doc.size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(doc.lastModified).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={isDownloading}
                      className="ml-4 flex items-center space-x-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>下载中...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>下载</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 text-sm font-medium transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
