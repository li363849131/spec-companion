import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, Check, Folder, Tag } from 'lucide-react';
import { BookCategory } from '../types';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: BookCategory[];
  onSaveCategory: (category: BookCategory) => void;
  onDeleteCategory: (categoryId: string) => void;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  onSaveCategory,
  onDeleteCategory,
}) => {
  const [editingCategory, setEditingCategory] = useState<BookCategory | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: 'from-indigo-600 to-blue-600',
  });

  const colorOptions = [
    { value: 'from-indigo-600 to-blue-600', label: '蓝色' },
    { value: 'from-emerald-600 to-teal-600', label: '绿色' },
    { value: 'from-purple-600 to-pink-600', label: '紫色' },
    { value: 'from-amber-600 to-orange-600', label: '橙色' },
    { value: 'from-red-600 to-rose-600', label: '红色' },
    { value: 'from-cyan-600 to-sky-600', label: '青色' },
    { value: 'from-slate-600 to-gray-600', label: '灰色' },
  ];

  if (!isOpen) return null;

  const handleStartCreate = () => {
    setIsCreating(true);
    setEditingCategory(null);
    setFormData({ name: '', description: '', color: 'from-indigo-600 to-blue-600' });
  };

  const handleStartEdit = (category: BookCategory) => {
    setEditingCategory(category);
    setIsCreating(false);
    setFormData({
      name: category.name,
      description: category.description || '',
      color: category.color || 'from-indigo-600 to-blue-600',
    });
  };

  const handleSave = () => {
    if (!formData.name.trim()) return;

    const category: BookCategory = {
      id: editingCategory?.id || `cat_${Date.now()}`,
      name: formData.name.trim(),
      description: formData.description.trim(),
      color: formData.color,
      icon: 'Folder',
      isBuiltIn: false,
      createdAt: editingCategory?.createdAt || new Date().toISOString(),
    };

    onSaveCategory(category);
    setIsCreating(false);
    setEditingCategory(null);
    setFormData({ name: '', description: '', color: 'from-indigo-600 to-blue-600' });
  };

  const handleDelete = (categoryId: string) => {
    if (confirm('确定要删除这个类别吗？该类别下的图书会被移到"自定义上传"类别。')) {
      onDeleteCategory(categoryId);
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingCategory(null);
    setFormData({ name: '', description: '', color: 'from-indigo-600 to-blue-600' });
  };

  const customCategories = categories.filter((c) => !c.isBuiltIn);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <Folder className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">类别管理</h2>
              <p className="text-xs text-slate-400">管理图书分类和标签</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {/* Built-in Categories */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-3 flex items-center space-x-2">
              <Tag className="w-4 h-4" />
              <span>内置类别（可删除）</span>
            </h3>
            <div className="space-y-2">
              {categories.filter((c) => c.isBuiltIn).map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-slate-600 transition"
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${category.color} flex items-center justify-center shrink-0`}>
                      <Folder className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-200">{category.name}</div>
                      <div className="text-xs text-slate-400">{category.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleDelete(category.id)}
                      className="w-8 h-8 rounded-lg hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-red-400 transition"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Categories */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-400 flex items-center space-x-2">
                <Folder className="w-4 h-4" />
                <span>自定义类别</span>
              </h3>
              {!isCreating && !editingCategory && (
                <button
                  onClick={handleStartCreate}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>新建类别</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              {/* Create/Edit Form */}
              {(isCreating || editingCategory) && (
                <div className="p-4 bg-slate-800 border-2 border-indigo-500 rounded-lg space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">类别名称</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="例如：RISC-V 架构"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">描述（可选）</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="类别简介"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-2">颜色</label>
                    <div className="grid grid-cols-4 gap-2">
                      {colorOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setFormData({ ...formData, color: option.value })}
                          className={`h-10 rounded-lg bg-gradient-to-br ${option.value} flex items-center justify-center transition ${
                            formData.color === option.value ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800' : 'opacity-60 hover:opacity-100'
                          }`}
                        >
                          {formData.color === option.value && <Check className="w-5 h-5 text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 pt-2">
                    <button
                      onClick={handleSave}
                      disabled={!formData.name.trim()}
                      className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition"
                    >
                      保存
                    </button>
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold rounded-lg transition"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* Custom Category List */}
              {customCategories.length === 0 && !isCreating ? (
                <div className="p-6 text-center text-slate-500 text-sm">
                  还没有自定义类别，点击上方按钮创建
                </div>
              ) : (
                customCategories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-slate-600 transition"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${category.color} flex items-center justify-center shrink-0`}>
                        <Folder className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-200">{category.name}</div>
                        {category.description && <div className="text-xs text-slate-400">{category.description}</div>}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleStartEdit(category)}
                        className="w-8 h-8 rounded-lg hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-indigo-400 transition"
                        title="编辑"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(category.id)}
                        className="w-8 h-8 rounded-lg hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-red-400 transition"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
