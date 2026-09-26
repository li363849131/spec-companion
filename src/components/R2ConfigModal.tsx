import React, { useState, useEffect } from 'react';
import { X, Cloud, Save } from 'lucide-react';
import { R2SyncConfig } from '../types';
import { getR2SyncConfig, saveR2SyncConfig } from '../lib/db';

interface R2ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const R2ConfigModal: React.FC<R2ConfigModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<R2SyncConfig>({
    accountId: '',
    bucketName: '',
    accessKeyId: '',
    secretAccessKey: '',
    publicDomain: '',
    autoSync: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    const saved = await getR2SyncConfig();
    if (saved) {
      setConfig(saved);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveR2SyncConfig(config);
      alert('R2 配置已保存');
      onClose();
    } catch (err: any) {
      alert(`保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center space-x-3">
            <Cloud className="w-6 h-6 text-orange-600" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Cloudflare R2 存储配置
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Account ID */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Account ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={config.accountId}
              onChange={(e) => setConfig({ ...config, accountId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="1ae1c488589174c90cf5ded822766a56"
            />
          </div>

          {/* Bucket Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Bucket Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={config.bucketName}
              onChange={(e) => setConfig({ ...config, bucketName: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="spec"
            />
          </div>

          {/* Access Key ID */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Access Key ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={config.accessKeyId}
              onChange={(e) => setConfig({ ...config, accessKeyId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="104728a9..."
            />
          </div>

          {/* Secret Access Key */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Secret Access Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={config.secretAccessKey}
              onChange={(e) => setConfig({ ...config, secretAccessKey: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="********"
            />
          </div>

          {/* Public Domain (Optional) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Public Domain（可选）
            </label>
            <input
              type="text"
              value={config.publicDomain || ''}
              onChange={(e) => setConfig({ ...config, publicDomain: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="https://your-domain.r2.cloudflarestorage.com"
            />
            <p className="mt-1 text-xs text-slate-500">
              如果不填，将使用默认的 R2 存储域名
            </p>
          </div>

          {/* Auto Sync */}
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="autoSync"
              checked={config.autoSync}
              onChange={(e) => setConfig({ ...config, autoSync: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="autoSync" className="text-sm text-slate-700 dark:text-slate-300">
              自动同步研读结果到 R2
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 text-sm font-medium transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !config.accountId || !config.bucketName || !config.accessKeyId || !config.secretAccessKey}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? '保存中...' : '保存配置'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
