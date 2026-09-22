import React, { useState } from 'react';
import { 
  X, 
  Settings, 
  Server, 
  Key, 
  Check, 
  AlertCircle, 
  Cpu, 
  RotateCcw, 
  Zap,
  Globe
} from 'lucide-react';
import { AISettings } from '../types';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AISettings;
  onSave: (newSettings: AISettings) => void;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [provider, setProvider] = useState<'gemini' | 'openai_compatible'>(settings.provider || 'gemini');
  const [baseUrl, setBaseUrl] = useState<string>(settings.baseUrl || '');
  const [apiKey, setApiKey] = useState<string>(settings.apiKey || '');
  const [model, setModel] = useState<string>(settings.model || 'gemini-3.1-flash-lite');

  const [testStatus, setTestStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTestStatus({ loading: true });
    try {
      const res = await fetch('/api/spec/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          baseUrl: baseUrl.trim() || undefined,
          apiKey: apiKey.trim() || undefined,
          model: model.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTestStatus({
          loading: false,
          success: true,
          message: `连接测试成功！模型 [${data.model || model}] 响应正常 (${data.latencyMs}ms)`,
        });
      } else {
        setTestStatus({
          loading: false,
          success: false,
          message: data.error || '连接中转站失败，请检查 URL 与 Key',
        });
      }
    } catch (err: any) {
      setTestStatus({
        loading: false,
        success: false,
        message: err.message || '网络请求超时，请检查服务地址',
      });
    }
  };

  const handleResetDefault = () => {
    setProvider('gemini');
    setBaseUrl('');
    setApiKey('');
    setModel('gemini-3.1-flash-lite');
    setTestStatus({ loading: false });
  };

  const handleApplyOneAPITemplate = () => {
    setProvider('openai_compatible');
    setBaseUrl('https://api.openai.com/v1');
    setModel('gpt-4o');
    setTestStatus({ loading: false });
  };

  const handleSave = () => {
    onSave({
      provider,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim() || (provider === 'gemini' ? 'gemini-3.1-flash-lite' : 'gpt-4o'),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-text">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-950/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                <span>AI 服务端点与中转站设置</span>
                {baseUrl ? (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono">
                    中转站模式
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-mono">
                    内置默认
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400">
                可切换官方通道或指向自建代理、企业内网 OneAPI / NewAPI 中转站
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Form */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[75vh] custom-scrollbar text-slate-700 dark:text-slate-300">
          {/* Quick preset chips */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">快速配置模板：</span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleResetDefault}
                className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] text-slate-600 dark:text-slate-300 font-medium flex items-center space-x-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>恢复默认 Gemini 3.8</span>
              </button>
              <button
                type="button"
                onClick={handleApplyOneAPITemplate}
                className="px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium flex items-center space-x-1"
              >
                <Server className="w-3 h-3" />
                <span>OpenAI / 中转站模板</span>
              </button>
            </div>
          </div>

          {/* Provider Selection */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-800 dark:text-slate-200 block">
              1. 协议通道类型 (API Protocol)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProvider('gemini')}
                className={`p-2.5 rounded-lg border text-left transition ${
                  provider === 'gemini'
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="font-bold flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Google GenAI 协议</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  支持 Gemini 3.8/2.5 原生反代或官方直连
                </p>
              </button>

              <button
                type="button"
                onClick={() => setProvider('openai_compatible')}
                className={`p-2.5 rounded-lg border text-left transition ${
                  provider === 'openai_compatible'
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="font-bold flex items-center space-x-1.5">
                  <Globe className="w-3.5 h-3.5 text-cyan-500" />
                  <span>OpenAI 兼容中转站</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  适用于 OneAPI, NewAPI, OpenRouter 等
                </p>
              </button>
            </div>
          </div>

          {/* Base URL */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>2. 中转站 / 代理服务器地址 (Base URL)</span>
              <span className="text-[11px] text-slate-400 font-normal">留空则走系统默认直连</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={
                  provider === 'gemini'
                    ? '留空默认直连，或如: https://my-gemini-proxy.com'
                    : '如: https://api.openai-proxy.com/v1 或内网网关'
                }
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>3. 自定义中转站 API Key</span>
              <span className="text-[11px] text-slate-400 font-normal">留空则使用环境 GEMINI_API_KEY</span>
            </label>
            <div className="relative">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Model Name */}
          <div className="space-y-1.5">
            <label className="font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>4. AI 模型标识 (Model ID)</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === 'gemini' ? 'gemini-3.8-flash' : 'gpt-4o'}
              className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Test Status feedback */}
          {testStatus.message && (
            <div
              className={`p-2.5 rounded-md border text-xs flex items-center space-x-2 ${
                testStatus.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              {testStatus.success ? (
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              )}
              <span className="leading-snug">{testStatus.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-14 px-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-950/80">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testStatus.loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition"
          >
            <Zap className={`w-3.5 h-3.5 ${testStatus.loading ? 'animate-spin text-indigo-500' : 'text-amber-400'}`} />
            <span>{testStatus.loading ? '测试中...' : '测试连通性'}</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition"
            >
              <Check className="w-3.5 h-3.5" />
              <span>保存配置</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
