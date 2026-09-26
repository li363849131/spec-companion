import React, { useState, useMemo } from 'react';
import { X, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { SpecDocument, BookCategory } from '../types';

interface UploadTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (categoryId: string, parentCollectionId?: string) => void;
  documents: SpecDocument[];
  categories: BookCategory[];
}

export function UploadTargetModal({
  isOpen,
  onClose,
  onConfirm,
  documents,
  categories,
}: UploadTargetModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('custom');
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>(undefined);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());

  // Get collections for selected category
  const collections = useMemo(() => {
    return documents.filter(
      (doc) => doc.isCollection && doc.category === selectedCategory && !doc.parentCollectionId
    );
  }, [documents, selectedCategory]);

  // Toggle collection expansion
  const toggleCollection = (collectionId: string) => {
    const newExpanded = new Set(expandedCollections);
    if (newExpanded.has(collectionId)) {
      newExpanded.delete(collectionId);
    } else {
      newExpanded.add(collectionId);
    }
    setExpandedCollections(newExpanded);
  };

  // Render collection tree recursively
  const renderCollection = (collection: SpecDocument, level = 0) => {
    const children = documents.filter(
      (doc) => doc.parentCollectionId === collection.id && doc.isCollection
    );
    const isExpanded = expandedCollections.has(collection.id);
    const isSelected = selectedCollection === collection.id;

    return (
      <div key={collection.id} style={{ marginLeft: `${level * 20}px` }}>
        <div
          onClick={() => setSelectedCollection(collection.id)}
          className={`flex items-center space-x-2 px-3 py-2 rounded-lg cursor-pointer transition ${
            isSelected
              ? 'bg-indigo-500 text-white'
              : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100'
          }`}
        >
          {children.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleCollection(collection.id);
              }}
              className="p-0.5"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}
          <Folder className="w-4 h-4" />
          <span className="text-sm">{collection.name}</span>
        </div>
        {isExpanded && children.map((child) => renderCollection(child, level + 1))}
      </div>
    );
  };

  const handleConfirm = () => {
    onConfirm(selectedCategory, selectedCollection);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            选择上传位置
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Category Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              选择分组
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSelectedCollection(undefined);
              }}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Collection Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              选择目录（可选）
            </label>
            <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-2 max-h-64 overflow-y-auto bg-white dark:bg-slate-700">
              <div
                onClick={() => setSelectedCollection(undefined)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg cursor-pointer transition mb-2 ${
                  selectedCollection === undefined
                    ? 'bg-indigo-500 text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100'
                }`}
              >
                <Folder className="w-4 h-4" />
                <span className="text-sm font-medium">根目录</span>
              </div>
              {collections.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">
                  该分组暂无目录
                </p>
              ) : (
                collections.map((col) => renderCollection(col))
              )}
            </div>
          </div>

          {/* Selected path display */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3">
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">上传到：</p>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {categories.find((c) => c.id === selectedCategory)?.name || selectedCategory}
              {selectedCollection && (
                <>
                  {' / '}
                  {documents.find((d) => d.id === selectedCollection)?.name}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-2 p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            确认上传
          </button>
        </div>
      </div>
    </div>
  );
}
