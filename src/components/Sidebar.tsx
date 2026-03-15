import React, { useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Settings as SettingsIcon, LogOut, Package, PieChart, FileText, Bot, MessageSquare, Mail, Users, Calendar, UsersRound, BookOpen } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { motion } from 'framer-motion';
import { useFirebaseImage } from '../hooks/useFirebaseImage';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const botsItems: MenuItem[] = [
  { id: 'scenarios', path: '/scenarios', label: 'Сценарии ботов' },
  { id: 'dialogs', path: '/dialogs', label: 'Диалоги' },
  { id: 'mailings', path: '/mailings', label: 'Рассылки' },
  { id: 'crm', path: '/crm', label: 'CRM Пользователи' },
];

const automationItems: MenuItem[] = [
  { id: 'calendar', path: '/calendar', label: 'Календарь событий' },
  { id: 'knowledge-base', path: '/knowledge-base', label: 'База знаний' },
];

const defaultIcons: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard size={20} />,
  products: <Package size={20} />,
  unit: <PieChart size={20} />,
  ofr: <FileText size={20} />,
  scenarios: <Bot size={20} />,
  dialogs: <MessageSquare size={20} />,
  mailings: <Mail size={20} />,
  crm: <Users size={20} />,
  calendar: <Calendar size={20} />,
  teams: <UsersRound size={20} />,
  'knowledge-base': <BookOpen size={20} />,
  settings: <SettingsIcon size={20} />,
};

interface MenuItem {
  id: string;
  path: string;
  label: string;
}

const dashboardItems: MenuItem[] = [
  { id: 'dashboard', path: '/', label: 'Дашборд' },
  { id: 'products', path: '/products', label: 'Товары' },
  { id: 'unit', path: '/unit', label: 'Юнит-экономика' },
  { id: 'ofr', path: '/ofr', label: 'ОФР' },
];

function SidebarMenuItem({ item, onClick }: { item: MenuItem, onClick?: () => void }) {
  return (
    <div className="relative group">
      <NavLink
        to={item.path}
        onClick={onClick}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden",
            isActive 
              ? "text-white shadow-lg shadow-purple-500/20" 
              : "text-gray-400 hover:text-white"
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-xl"
                initial={false}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
            
            <div className="relative z-10">
              {defaultIcons[item.id] || <LayoutDashboard size={20} />}
            </div>
            
            <span className="font-medium truncate z-10 relative">{item.label}</span>
          </>
        )}
      </NavLink>
    </div>
  );
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { url: logoUrl, uploadImage, loading } = useFirebaseImage('logo');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <aside className="w-64 bg-[#1a1a1a] border-r border-white/5 flex flex-col h-full overflow-y-auto custom-scrollbar">
      <div className="p-6 flex items-center gap-3 sticky top-0 bg-[#1a1a1a] z-20 border-b border-white/5">
        <div 
          className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center cursor-pointer overflow-hidden relative group shrink-0 transition-transform hover:scale-105 active:scale-95"
          onClick={() => fileInputRef.current?.click()}
          title="Загрузить логотип"
        >
          {loading ? (
            <div className="w-full h-full animate-pulse bg-white/20" />
          ) : logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-bold italic text-white">OM</span>
          )}
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={async (e) => {
            if (e.target.files?.[0]) await uploadImage(e.target.files[0]);
          }} 
          accept="image/*" 
          className="hidden" 
        />
        <div className="overflow-hidden">
          <h1 className="font-bold text-lg leading-tight truncate text-white">OM</h1>
          <p className="text-xs text-gray-400 truncate">Админ панель</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-8">
        {/* Dashboard Group */}
        <div>
          <div className="mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-3">
            Дашборд
          </div>
          <div className="space-y-1">
            {dashboardItems.map(item => (
              <div key={item.id}>
                <SidebarMenuItem item={item} onClick={onClose} />
              </div>
            ))}
          </div>
        </div>

        {/* Bots Group */}
        <div>
          <div className="mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-3">
            Боты
          </div>
          <div className="space-y-1">
            {botsItems.map(item => (
              <div key={item.id}>
                <SidebarMenuItem item={item} onClick={onClose} />
              </div>
            ))}
          </div>
        </div>

        {/* Automation Group */}
        <div>
          <div className="mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider px-3">
            Автоматизация
          </div>
          <div className="space-y-1">
            {automationItems.map(item => (
              <div key={item.id}>
                <SidebarMenuItem item={item} onClick={onClose} />
              </div>
            ))}
            <NavLink
              to="/settings"
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden",
                  isActive 
                    ? "text-white shadow-lg shadow-purple-500/20" 
                    : "text-gray-400 hover:text-white"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-xl"
                      initial={false}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                  <div className="relative z-10">
                    <SettingsIcon size={20} />
                  </div>
                  <span className="font-medium relative z-10">Настройки</span>
                </>
              )}
            </NavLink>
          </div>
        </div>
      </nav>

      <div className="p-4 mt-auto border-t border-white/5 sticky bottom-0 bg-[#1a1a1a] z-20">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-red-400 hover:bg-red-500/10 hover:text-red-300 w-full group"
        >
          <LogOut size={20} className="group-hover:scale-110 transition-transform" />
          <span className="font-medium">Выйти</span>
        </button>
      </div>
    </aside>
  );
}
