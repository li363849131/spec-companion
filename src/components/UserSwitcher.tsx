import React, { useState } from 'react';
import { User, Users, Check, ChevronDown, Plus, Shield, Sparkles, Trash2 } from 'lucide-react';
import { UserProfile } from '../types';

interface UserSwitcherProps {
  currentUser: UserProfile;
  profiles: UserProfile[];
  onSelectUser: (profile: UserProfile) => void;
  onAddUser?: (name: string, role: string) => void;
  onDeleteUser?: (userId: string) => void;
}

export const UserSwitcher: React.FC<UserSwitcherProps> = ({
  currentUser,
  profiles,
  onSelectUser,
  onAddUser,
  onDeleteUser,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newRole, setNewRole] = useState<string>('验证与仿真工程师');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (onAddUser) {
      onAddUser(newName.trim(), newRole.trim());
    }
    setNewName('');
    setShowAddForm(false);
  };

  if (!currentUser) return null;

  return (
    <div className="relative">
      <button
        id="btn-user-switcher"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs transition"
        title="切换当前工程师视窗与专属书房隔离"
      >
        <div className={`w-5 h-5 rounded-full bg-gradient-to-tr ${currentUser?.avatarColor || 'from-indigo-600 to-blue-600'} flex items-center justify-center text-[10px] text-white font-bold shadow-sm`}>
          {(currentUser?.name || 'U').slice(0, 1)}
        </div>
        <div className="text-left hidden sm:block">
          <div className="font-semibold text-slate-800 dark:text-slate-200 leading-none">
            {(currentUser?.name || '工程师').split(' ')[0]}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-none mt-0.5 max-w-[80px] truncate">
            {currentUser?.role || ''}
          </div>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 p-2 text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 font-semibold flex items-center justify-between">
              <span>工程师多用户身份隔离</span>
              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-mono">
                Isolated
              </span>
            </div>

            <div className="py-1 space-y-1">
              {profiles.map((p) => {
                const isSelected = p.id === currentUser.id;
                return (
                  <div
                    key={p.id}
                    className={`w-full flex items-center justify-between p-2 rounded-lg transition group ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <button
                      onClick={() => {
                        onSelectUser(p);
                        setIsOpen(false);
                      }}
                      className="flex-1 flex items-center space-x-2.5 min-w-0 text-left"
                    >
                      <div className={`w-6 h-6 rounded-full bg-gradient-to-tr ${p.avatarColor || 'from-indigo-600 to-blue-600'} flex items-center justify-center text-xs text-white font-bold shrink-0`}>
                        {p.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate leading-tight font-medium">{p.name}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
                          {p.role}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center space-x-1 shrink-0">
                      {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                      {onDeleteUser && profiles.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`确定删除用户 "${p.name}" 吗？\n\n此操作将删除该用户的所有文档（包括本地和 R2 云端）。`)) {
                              onDeleteUser(p.id);
                            }
                          }}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition"
                          title="删除用户及其所有文档"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Create New User */}
            {showAddForm ? (
              <form onSubmit={handleCreate} className="p-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <input
                  type="text"
                  placeholder="工程师姓名..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="岗位职责 (如 固件/系统总线)..."
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <div className="flex items-center justify-end space-x-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-2 py-1 text-slate-500 hover:text-slate-700 text-[11px]"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-indigo-600 text-white rounded font-bold text-[11px]"
                  >
                    确定添加
                  </button>
                </div>
              </form>
            ) : (
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加新工程师账号</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
