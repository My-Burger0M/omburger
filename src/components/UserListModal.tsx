import React, { useState, useEffect } from 'react';
import { X, Search, MessageCircle, ArrowUpDown } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface UserListModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: 'tg' | 'vk' | 'max' | 'all';
}

interface ChatUser {
  id: string;
  platform: 'tg' | 'vk' | 'max';
  username: string;
  lastMessageAt: any;
  messageCount: number;
}

export default function UserListModal({ isOpen, onClose, platform }: UserListModalProps) {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'messages' | 'platform'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return;

    let q = query(collection(db, 'chats'));
    if (platform !== 'all') {
      q = query(collection(db, 'chats'), where('platform', '==', platform));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        messageCount: doc.data().messageCount || 1, // fallback
      })) as ChatUser[];
      setUsers(data);
    });

    return () => unsubscribe();
  }, [isOpen, platform]);

  if (!isOpen) return null;

  // Filter and sort
  let filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  filteredUsers.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'date') {
      const dateA = a.lastMessageAt?.toMillis() || 0;
      const dateB = b.lastMessageAt?.toMillis() || 0;
      comparison = dateA - dateB;
    } else if (sortBy === 'messages') {
      comparison = a.messageCount - b.messageCount;
    } else if (sortBy === 'platform') {
      comparison = a.platform.localeCompare(b.platform);
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const handleSort = (field: 'date' | 'messages' | 'platform') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const platformColors = {
    tg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    vk: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    max: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };

  const platformLabels = {
    tg: 'Telegram',
    vk: 'ВКонтакте',
    max: 'MAX',
    all: 'Все пользователи'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <h2 className="text-xl font-bold">
            {platformLabels[platform]} ({filteredUsers.length})
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-white/10 flex flex-col md:flex-row gap-4 items-center bg-[#2a2a2a]/50">
          <div className="relative w-full md:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Поиск пользователей..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all"
            />
          </div>
          
          <div className="flex flex-wrap gap-2 text-sm w-full md:w-auto">
            <button 
              onClick={() => handleSort('date')}
              className={`px-3 py-2 rounded-lg border flex items-center gap-2 transition-colors ${sortBy === 'date' ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'border-white/10 hover:bg-white/5'}`}
            >
              По дате <ArrowUpDown size={14} />
            </button>
            <button 
              onClick={() => handleSort('messages')}
              className={`px-3 py-2 rounded-lg border flex items-center gap-2 transition-colors ${sortBy === 'messages' ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'border-white/10 hover:bg-white/5'}`}
            >
              По сообщениям <ArrowUpDown size={14} />
            </button>
            {platform === 'all' && (
              <button 
                onClick={() => handleSort('platform')}
                className={`px-3 py-2 rounded-lg border flex items-center gap-2 transition-colors ${sortBy === 'platform' ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'border-white/10 hover:bg-white/5'}`}
              >
                По цвету (тегу) <ArrowUpDown size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="space-y-2">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                Пользователи не найдены
              </div>
            ) : (
              filteredUsers.map(user => (
                <div key={user.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-[#2a2a2a] rounded-xl border border-white/5 hover:border-white/10 transition-colors gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-lg font-bold shrink-0">
                      {user.username[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        {user.username}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${platformColors[user.platform]}`}>
                          {user.platform.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Последняя активность: {user.lastMessageAt?.toDate ? format(user.lastMessageAt.toDate(), 'dd.MM.yyyy HH:mm') : 'Нет данных'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-center">
                      <div className="text-xs text-gray-500 mb-1">Сообщений</div>
                      <div className="font-bold text-lg">{user.messageCount}</div>
                    </div>
                    
                    <button 
                      onClick={() => {
                        onClose();
                        navigate(`/dialogs?filter=${platform === 'all' ? 'all' : user.platform}&chatId=${user.id}`);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-purple-500/20"
                    >
                      <MessageCircle size={16} />
                      Написать
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
