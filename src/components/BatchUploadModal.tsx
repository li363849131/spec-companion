import React, { useState, useRef } from 'react';
import { X, FolderOpen, Upload, CheckCircle2, XCircle, Loader, Folder, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { BookCategory, SpecDocument } from '../types';

interface BatchUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: BookCategory[];
  documents: SpecDocument[];
  onBatchUpload: (files: File[], category: string) => Promise<void>;
  onBatchUploadWithStructure: (
    fileTree: FileTreeNode,
    category: string,
    parentCollectionId?: string,
    onFileStart?: (filePath: string) => void,
    onFileComplete?: (filePath: string, success: boolean, error?: string) => void
  ) => Promise<void>;
}

interface UploadStatus {
  fileName: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  path?: string;
}

interface FileWithPath extends File {
  webkitRelativePath?: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  file?: File;
  children?: FileTreeNode[];
}

export default function BatchUploadModal({
  isOpen,
  onClose,
  categories,
  documents,
  onBatchUpload,
  onBatchUploadWithStructure,
}: BatchUploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileWithPath[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>(undefined);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null);
  const [preserveStructure, setPreserveStructure] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Build file tree from files with webkitRelativePath
  const buildFileTree = (files: FileWithPath[]): FileTreeNode | null => {
    if (files.length === 0) return null;

    const root: FileTreeNode = {
      name: 'root',
      path: '',
      isDirectory: true,
      children: [],
    };

    files.forEach((file) => {
      const path = file.webkitRelativePath || file.name;
      const parts = path.split('/');
      let current = root;

      parts.forEach((part, index) => {
        const isLastPart = index === parts.length - 1;
        const currentPath = parts.slice(0, index + 1).join('/');

        if (isLastPart) {
          // It's a file
          if (part.toLowerCase().endsWith('.pdf')) {
            current.children = current.children || [];
            current.children.push({
              name: part,
              path: currentPath,
              isDirectory: false,
              file: file,
            });
          }
        } else {
          // It's a directory
          current.children = current.children || [];
          let existingDir = current.children.find(
            (child) => child.name === part && child.isDirectory
          );

          if (!existingDir) {
            existingDir = {
              name: part,
              path: currentPath,
              isDirectory: true,
              children: [],
            };
            current.children.push(existingDir);
          }

          current = existingDir;
        }
      });
    });

    return root;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as FileWithPath[];
    const supportedFiles = files.filter(file => {
      const name = file.name.toLowerCase();
      return name.endsWith('.pdf') || name.endsWith('.doc') || name.endsWith('.docx') ||
             name.endsWith('.md') || name.endsWith('.txt') || name.endsWith('.html') ||
             name.endsWith('.htm') || name.endsWith('.epub') || name.endsWith('.xlsx') ||
             name.endsWith('.xls') || name.endsWith('.csv') || name.endsWith('.pptx') ||
             name.endsWith('.ppt');
    });

    setSelectedFiles(supportedFiles);

    // Build file tree if files have paths
    const tree = buildFileTree(supportedFiles);
    setFileTree(tree);

    setUploadStatuses(supportedFiles.map(file => ({
      fileName: file.name,
      status: 'pending',
      path: file.webkitRelativePath || file.name,
    })));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !selectedCategory) {
      alert('请选择文件和类别');
      return;
    }

    setIsUploading(true);

    try {
      if (preserveStructure && fileTree && fileTree.children && fileTree.children.length > 0) {
        // Upload with directory structure and status callback
        const onFileStart = (filePath: string) => {
          setUploadStatuses(prev =>
            prev.map(status =>
              status.path === filePath ? { ...status, status: 'uploading' } : status
            )
          );
        };

        const onFileComplete = (filePath: string, success: boolean, error?: string) => {
          setUploadStatuses(prev =>
            prev.map(status =>
              status.path === filePath
                ? { ...status, status: success ? 'success' : 'error', error }
                : status
            )
          );
        };

        await onBatchUploadWithStructure(fileTree, selectedCategory, selectedCollection, onFileStart, onFileComplete);
      } else {
        // Flat upload (legacy mode)
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];

          // Update status to uploading
          setUploadStatuses(prev =>
            prev.map((status, idx) =>
              idx === i ? { ...status, status: 'uploading' } : status
            )
          );

          try {
            await onBatchUpload([file], selectedCategory);

            // Update status to success
            setUploadStatuses(prev =>
              prev.map((status, idx) =>
                idx === i ? { ...status, status: 'success' } : status
              )
            );
          } catch (err: any) {
            // Update status to error
            setUploadStatuses(prev =>
              prev.map((status, idx) =>
                idx === i ? { ...status, status: 'error', error: err.message } : status
              )
            );
          }
        }
      }
    } catch (err: any) {
      console.error('Batch upload failed:', err);
      setUploadStatuses(prev =>
        prev.map(status => status.status === 'pending' ? { ...status, status: 'error', error: err.message } : status)
      );
    }

    setIsUploading(false);

    // Auto close after successful upload
    setTimeout(() => {
      setSelectedFiles([]);
      setSelectedCategory('');
      setUploadStatuses([]);
      setFileTree(null);
      onClose();
    }, 1000);
  };

  const handleClose = () => {
    if (isUploading) {
      if (!confirm('上传正在进行中，确定要关闭吗？')) {
        return;
      }
    }
    setSelectedFiles([]);
    setSelectedCategory('');
    setUploadStatuses([]);
    setFileTree(null);
    onClose();
  };

  // Render file tree preview
  const renderFileTree = (node: FileTreeNode, level: number = 0): React.ReactNode => {
    if (!node.children || node.children.length === 0) return null;

    return (
      <div className={level > 0 ? 'ml-4' : ''}>
        {node.children.map((child, idx) => (
          <div key={idx}>
            <div className="flex items-center space-x-2 py-1">
              {child.isDirectory ? (
                <>
                  <Folder className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {child.name}
                  </span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {child.name}
                  </span>
                </>
              )}
            </div>
            {child.isDirectory && renderFileTree(child, level + 1)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            批量上传 PDF 文档
          </h2>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* File Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              选择文档文件
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.md,.txt,.html,.htm,.epub,.xlsx,.xls,.csv,.pptx,.ppt"
              onChange={handleFileSelect}
              disabled={isUploading}
              className="hidden"
              // @ts-ignore - webkitdirectory is not in the types
              webkitdirectory=""
              directory=""
              onClick={(e) => {
                // Reset value to allow re-selecting same folder
                e.currentTarget.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <FolderOpen className="w-5 h-5" />
              <span>选择文件夹（支持嵌套目录）</span>
            </button>
            {selectedFiles.length > 0 && (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                已选择 {selectedFiles.length} 个文档文件
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
              支持格式：PDF, Word, Markdown, TXT, HTML, ePub, Excel, CSV, PowerPoint
            </p>
          </div>

          {/* Structure Preservation Option */}
          {fileTree && fileTree.children && fileTree.children.length > 0 && (
            <div className="flex items-center space-x-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <input
                type="checkbox"
                id="preserve-structure"
                checked={preserveStructure}
                onChange={(e) => setPreserveStructure(e.target.checked)}
                disabled={isUploading}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <label
                htmlFor="preserve-structure"
                className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                保留目录结构（创建嵌套集合）
              </label>
            </div>
          )}

          {/* File Tree Preview */}
          {preserveStructure && fileTree && fileTree.children && fileTree.children.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                目录结构预览
              </h3>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700">
                {renderFileTree(fileTree)}
              </div>
            </div>
          )}

          {/* Category Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              目标分组
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSelectedCollection(undefined);
              }}
              disabled={isUploading}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 dark:text-slate-100"
            >
              <option value="" className="text-slate-900 dark:text-slate-100">选择分组</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id} className="text-slate-900 dark:text-slate-100">
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Collection Selection */}
          {selectedCategory && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                目标目录（可选）
              </label>
              <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-2 max-h-48 overflow-y-auto bg-white dark:bg-slate-800">
                <div
                  onClick={() => setSelectedCollection(undefined)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg cursor-pointer transition mb-2 ${
                    selectedCollection === undefined
                      ? 'bg-indigo-500 text-white'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <Folder className="w-4 h-4" />
                  <span className="text-sm font-medium">根目录</span>
                </div>
                {documents
                  .filter((doc) => doc.isCollection && doc.category === selectedCategory && !doc.parentCollectionId)
                  .map((collection) => (
                    <div
                      key={collection.id}
                      onClick={() => setSelectedCollection(collection.id)}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-lg cursor-pointer transition ${
                        selectedCollection === collection.id
                          ? 'bg-indigo-500 text-white'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      <Folder className="w-4 h-4" />
                      <span className="text-sm">{collection.name}</span>
                    </div>
                  ))}
              </div>
              {preserveStructure && selectedCollection && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  💡 将在「{documents.find((d) => d.id === selectedCollection)?.name}」下创建子集合
                </p>
              )}
            </div>
          )}

          {/* Hint for preserve structure */}
          {selectedCategory && preserveStructure && !selectedCollection && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                💡 已启用"保留目录结构"，将自动根据文件夹结构创建嵌套集合
              </p>
            </div>
          )}

          {/* Upload Status List */}
          {uploadStatuses.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                上传进度
              </h3>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {uploadStatuses.map((status, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded text-sm"
                  >
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-300">
                      {status.path || status.fileName}
                    </span>
                    {status.status === 'pending' && (
                      <span className="text-slate-400 text-xs">等待中</span>
                    )}
                    {status.status === 'uploading' && (
                      <Loader className="w-4 h-4 animate-spin text-indigo-500" />
                    )}
                    {status.status === 'success' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                    {status.status === 'error' && (
                      <div className="flex items-center space-x-2">
                        <XCircle className="w-4 h-4 text-red-500" />
                        <span className="text-xs text-red-500">{status.error}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={handleUpload}
            disabled={isUploading || selectedFiles.length === 0 || !selectedCategory}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isUploading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                <span>上传中...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>开始上传</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
