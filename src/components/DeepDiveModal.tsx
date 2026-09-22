import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  X, 
  Send, 
  Sparkles, 
  MessageSquareShare, 
  Code2, 
  HelpCircle,
  Clock,
  Layers
} from 'lucide-react';
import { QAInteraction, AISettings } from '../types';
import { getQAForPage, saveQAInteraction } from '../lib/db';

interface DeepDiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  docId: string;
  docName: string;
  pageNum: number;
  chapterTitle?: string;
  selectedText?: string;
  pageContext?: string;
  aiSettings?: AISettings;
}

export const DeepDiveModal: React.FC<DeepDiveModalProps> = ({
  isOpen,
  onClose,
  docId,
  docName,
  pageNum,
  chapterTitle,
  selectedText: initialSelectedText,
  pageContext,
  aiSettings,
}) => {
  const [question, setQuestion] = useState<string>('');
  const [selectedText, setSelectedText] = useState<string>(initialSelectedText || '');
  const [interactions, setInteractions] = useState<QAInteraction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync initialSelectedText
  useEffect(() => {
    if (initialSelectedText) {
      setSelectedText(initialSelectedText);
    }
  }, [initialSelectedText]);

  // Load existing Q&A history for this page
  useEffect(() => {
    if (isOpen) {
      getQAForPage(docId, pageNum).then((items) => {
        setInteractions(items);
      });
    }
  }, [isOpen, docId, pageNum]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interactions, isLoading]);

  if (!isOpen) return null;

  const handleAskQuestion = async (customQ?: string) => {
    const query = customQ || question;
    if (!query.trim() || isLoading) return;

    const userQ = query.trim();
    setQuestion('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/spec/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userQ,
          selectedText: selectedText || undefined,
          pageContext: pageContext || undefined,
          chapterTitle,
          docName,
          aiSettings,
        }),
      });

      const data = await response.json();
      if (data.success && data.answer) {
        const newInteraction: QAInteraction = {
          id: `qa_${Date.now()}`,
          docId,
          pageNum,
          selectedText: selectedText || undefined,
          question: userQ,
          answer: data.answer,
          createdAt: new Date().toISOString(),
        };

        await saveQAInteraction(newInteraction);
        setInteractions((prev) => [...prev, newInteraction]);
      } else {
        alert(data.error || '追问未获响应，请重试');
      }
    } catch (err: any) {
      console.error('QA error:', err);
      alert('网络请求失败，请检查服务状态');
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    '这个位域在实际工程中写 1 或写 0 会有什么硬件副作用？',
    '结合 Linux 内核驱动，在什么场景下会触发这个配置？',
    '这个时序/协议约束容易引起系统总线死锁吗？如何避坑？',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-xs transition-opacity">
      <div 
        className="w-full max-w-lg h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 select-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-950/80">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <MessageSquareShare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                <span>针对规范划选追问</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono">
                  P{pageNum}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 truncate max-w-[280px]">
                {chapterTitle || docName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Selected Quote Banner */}
        {selectedText && (
          <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold flex items-center space-x-1">
                <Code2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>划选的 Spec 原文/寄存器定义：</span>
              </span>
              <button
                onClick={() => setSelectedText('')}
                className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline"
              >
                清除引用
              </button>
            </div>
            <p className="font-mono text-[11px] bg-amber-500/10 p-2 rounded border border-amber-500/20 whitespace-pre-wrap max-h-24 overflow-y-auto custom-scrollbar">
              {selectedText}
            </p>
          </div>
        )}

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {interactions.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <HelpCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  向资深芯片与驱动专家提问
                </h4>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  可针对特定位域写 1 写 0 意图、时钟域交互、Linux 源码映射或避坑点发起深度探讨。
                </p>
              </div>

              {/* Quick Prompts */}
              <div className="pt-3 space-y-1.5 text-left max-w-sm mx-auto">
                <p className="text-[11px] font-semibold text-slate-400 px-1">常用工程追问：</p>
                {quickPrompts.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handleAskQuestion(p)}
                    className="w-full text-left p-2 rounded-md bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 transition"
                  >
                    👉 {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            interactions.map((qa) => (
              <div key={qa.id} className="space-y-3">
                {/* User Question */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-tr-none px-3.5 py-2.5 text-xs shadow-sm">
                    {qa.selectedText && (
                      <div className="text-[10px] text-indigo-200 border-b border-indigo-500/50 pb-1 mb-1 font-mono truncate">
                        引述: {qa.selectedText}
                      </div>
                    )}
                    <p className="font-medium">{qa.question}</p>
                  </div>
                </div>

                {/* AI Architect Answer */}
                <div className="flex justify-start">
                  <div className="max-w-[92%] bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-2xl rounded-tl-none p-3.5 text-xs shadow-sm space-y-2">
                    <div className="flex items-center space-x-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>老架构师精讲</span>
                    </div>
                    <div className="markdown-body prose prose-slate dark:prose-invert text-xs leading-relaxed max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {qa.answer}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex items-center space-x-2 text-xs text-indigo-500 py-2">
              <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
              <span>老架构师正在翻阅内核源码与硬件勘误表...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskQuestion();
            }}
            className="flex items-center space-x-2"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={selectedText ? '针对划选内容提问...' : '输入关于本页协议或硬件实现的疑问...'}
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={!question.trim() || isLoading}
              className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
