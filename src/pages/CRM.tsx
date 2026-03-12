import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, deleteField } from 'firebase/firestore';
import { User, Tag, Trash2, Search, Filter, Plus, X } from 'lucide-react';

export default function CRM() {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Tagging
  const [newTag, setNewTag] = useState('');
  const [newTagColor, setNewTagColor] = useState('#a855f7');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'chats'));
        const usersList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUsers(usersList);
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUser && !selectedUser.createdAt) {
      const fetchFirstMessage = async () => {
        try {
          // Dynamic import to avoid adding to top-level imports if not needed, but we can just use the imported ones
          const { query, orderBy, limit } = await import('firebase/firestore');
          const q = query(collection(db, 'chats', selectedUser.id, 'messages'), orderBy('timestamp', 'asc'), limit(1));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const firstMsg = snapshot.docs[0].data();
            if (firstMsg.timestamp) {
              await updateDoc(doc(db, 'chats', selectedUser.id), {
                createdAt: firstMsg.timestamp
              });
              // Update local state
              const updatedUser = { ...selectedUser, createdAt: firstMsg.timestamp };
              setSelectedUser(updatedUser);
              setUsers(prev => prev.map(u => u.id === selectedUser.id ? updatedUser : u));
            }
          }
        } catch (e) {
          console.error('Error fetching first message for createdAt:', e);
        }
      };
      fetchFirstMessage();
    }
  }, [selectedUser]);

  const handleDeleteTags = async () => {
    if (!selectedUser) return;
    if (!confirm('Вы уверены, что хотите удалить ВСЕ теги у этого пользователя?')) return;

    try {
      const userRef = doc(db, 'chats', selectedUser.id);
      await updateDoc(userRef, {
        tags: deleteField(),
        tagColors: deleteField()
      });
      
      // Update local state
      const updatedUser = { ...selectedUser };
      delete updatedUser.tags;
      delete updatedUser.tagColors;
      setSelectedUser(updatedUser);
      
      setUsers(users.map(u => u.id === selectedUser.id ? updatedUser : u));
      
      alert('Теги успешно удалены');
    } catch (error) {
      console.error("Error deleting tags:", error);
      alert('Ошибка при удалении тегов');
    }
  };

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    const name = user.username || user.firstName || user.lastName || user.id;
    return name.toLowerCase().includes(searchLower);
  });

  return (
    <div className="h-[calc(100vh-6rem)] flex gap-6">
      {/* Users List */}
      <div className="w-1/3 bg-[#1a1a1a] rounded-2xl border border-white/10 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/10 space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <User className="text-purple-500" /> Пользователи
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-gray-400">{users.length}</span>
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text" 
              placeholder="Поиск..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#111] border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white outline-none focus:border-purple-500"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
          {loading ? (
            <div className="text-center text-gray-500 py-8">Загрузка...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center text-gray-500 py-8">Пользователи не найдены</div>
          ) : (
            filteredUsers.map(user => (
              <div 
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className={`p-3 rounded-xl cursor-pointer transition-colors flex items-center gap-3 ${selectedUser?.id === user.id ? 'bg-purple-500/20 border border-purple-500/50' : 'bg-[#222] border border-white/5 hover:bg-[#2a2a2a]'}`}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
                  {(user.username?.[0] || user.firstName?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">
                    {user.username || user.firstName ? `${user.firstName || ''} ${user.lastName || ''} ${user.username ? `(${user.username})` : ''}` : user.id}
                  </div>
                  <div className="text-xs text-gray-500 truncate flex items-center gap-2">
                    <span>{user.platform === 'tg' ? 'Telegram' : user.platform === 'vk' ? 'VK' : 'Unknown'}</span>
                    {user.tags && user.tags.length > 0 && (
                      <span className="bg-white/10 px-1.5 rounded text-[10px] text-gray-300">
                        {user.tags.length} тегов
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* User Profile */}
      <div className="flex-1 bg-[#1a1a1a] rounded-2xl border border-white/10 flex flex-col overflow-hidden">
        {selectedUser ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
            <div className="flex items-start justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-3xl shadow-lg shadow-purple-900/20">
                  {(selectedUser.username?.[0] || selectedUser.firstName?.[0] || '?').toUpperCase()}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {selectedUser.username || selectedUser.firstName ? `${selectedUser.firstName || ''} ${selectedUser.lastName || ''}` : 'Без имени'}
                  </h2>
                  <div className="text-gray-400 text-sm mt-1">{selectedUser.username || selectedUser.id}</div>
                  <div className="flex gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {selectedUser.platform === 'tg' ? 'Telegram' : 'VK'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs bg-white/10 text-gray-400 border border-white/10">
                      ID: {selectedUser.id}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="bg-[#222] p-4 rounded-xl border border-white/5">
                <h3 className="text-sm font-medium text-gray-400 mb-4">Теги и Сегменты</h3>
                
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Новый тег..."
                    className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-purple-500 outline-none"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && newTag.trim()) {
                        e.preventDefault();
                        try {
                          const tag = newTag.trim();
                          const userRef = doc(db, 'chats', selectedUser.id);
                          const currentTags = selectedUser.tags || [];
                          if (!currentTags.includes(tag)) {
                            const newTags = [...currentTags, tag];
                            const currentColors = selectedUser.tagColors || {};
                            await updateDoc(userRef, { 
                              tags: newTags,
                              tagColors: { ...currentColors, [tag]: newTagColor }
                            });
                            
                            // Update local state
                            const updatedUser = { 
                              ...selectedUser, 
                              tags: newTags,
                              tagColors: { ...currentColors, [tag]: newTagColor }
                            };
                            setSelectedUser(updatedUser);
                            setUsers(users.map(u => u.id === selectedUser.id ? updatedUser : u));
                          }
                          setNewTag('');
                        } catch (error) {
                          console.error('Error adding tag:', error);
                        }
                      }
                    }}
                  />
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0"
                    title="Цвет тега"
                  />
                  <button
                    onClick={async () => {
                      if (newTag.trim()) {
                        try {
                          const tag = newTag.trim();
                          const userRef = doc(db, 'chats', selectedUser.id);
                          const currentTags = selectedUser.tags || [];
                          if (!currentTags.includes(tag)) {
                            const newTags = [...currentTags, tag];
                            const currentColors = selectedUser.tagColors || {};
                            await updateDoc(userRef, { 
                              tags: newTags,
                              tagColors: { ...currentColors, [tag]: newTagColor }
                            });
                            
                            // Update local state
                            const updatedUser = { 
                              ...selectedUser, 
                              tags: newTags,
                              tagColors: { ...currentColors, [tag]: newTagColor }
                            };
                            setSelectedUser(updatedUser);
                            setUsers(users.map(u => u.id === selectedUser.id ? updatedUser : u));
                          }
                          setNewTag('');
                        } catch (error) {
                          console.error('Error adding tag:', error);
                        }
                      }
                    }}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-3 rounded-lg flex items-center justify-center transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-6">
                  {selectedUser.tags && selectedUser.tags.length > 0 ? (
                    selectedUser.tags.map((tag: string, i: number) => {
                      const color = selectedUser.tagColors?.[tag] || '#a855f7';
                      return (
                        <span 
                          key={i} 
                          className="px-3 py-1 rounded-lg text-sm flex items-center gap-2 text-white group"
                          style={{ backgroundColor: color }}
                        >
                          <Tag size={12} /> {tag}
                          <button 
                            onClick={async () => {
                              if (window.confirm(`Удалить тег #${tag}?`)) {
                                try {
                                  const userRef = doc(db, 'chats', selectedUser.id);
                                  const newTags = selectedUser.tags.filter((t: string) => t !== tag);
                                  await updateDoc(userRef, { tags: newTags });
                                  
                                  const updatedUser = { ...selectedUser, tags: newTags };
                                  setSelectedUser(updatedUser);
                                  setUsers(users.map(u => u.id === selectedUser.id ? updatedUser : u));
                                } catch (e) {
                                  console.error('Error removing tag:', e);
                                }
                              }
                            }}
                            className="p-0.5 hover:bg-black/20 rounded opacity-50 hover:opacity-100 transition-all ml-1"
                            title="Удалить тег"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      );
                    })
                  ) : (
                    <div className="text-gray-500 text-sm italic">Нет тегов</div>
                  )}
                </div>

                {selectedUser.tags && selectedUser.tags.length > 0 && (
                  <button 
                    onClick={handleDeleteTags}
                    className="w-full py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <Trash2 size={16} /> Удалить все теги
                  </button>
                )}
              </div>

              <div className="bg-[#222] p-4 rounded-xl border border-white/5">
                <h3 className="text-sm font-medium text-gray-400 mb-4">Информация</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Первое касание (не стирается):</span>
                    <span className="text-white font-medium">
                      {selectedUser.createdAt?.seconds 
                        ? new Date(selectedUser.createdAt.seconds * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                        : (selectedUser.lastMessageAt?.seconds 
                            ? new Date(selectedUser.lastMessageAt.seconds * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                            : '-')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Последняя активность:</span>
                    <span className="text-white">
                      {selectedUser.lastMessageAt?.seconds ? new Date(selectedUser.lastMessageAt.seconds * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Всего сообщений:</span>
                    <span className="text-white font-bold">{selectedUser.messageCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Платформа:</span>
                    <span className="text-white uppercase">{selectedUser.platform || 'TG'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#222] p-4 rounded-xl border border-white/5 mt-4">
                <h3 className="text-sm font-medium text-gray-400 mb-4">Статистика активности</h3>
                <div className="space-y-4">
                  {(() => {
                    const createdDate = selectedUser.createdAt?.seconds ? new Date(selectedUser.createdAt.seconds * 1000) : (selectedUser.lastMessageAt?.seconds ? new Date(selectedUser.lastMessageAt.seconds * 1000) : new Date());
                    const lastActiveDate = selectedUser.lastMessageAt?.seconds ? new Date(selectedUser.lastMessageAt.seconds * 1000) : null;
                    const now = new Date();
                    
                    const daysSinceStart = Math.max(1, Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)));
                    const daysSinceLastActive = lastActiveDate ? Math.floor((now.getTime() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24)) : -1;
                    
                    const totalMsgs = selectedUser.messageCount || 0;
                    const msgsPerDay = totalMsgs / daysSinceStart;
                    
                    // Cap projections if user is new
                    const msgsPerWeek = daysSinceStart >= 7 ? msgsPerDay * 7 : totalMsgs;
                    const msgsPerMonth = daysSinceStart >= 30 ? msgsPerDay * 30 : totalMsgs;

                    // Calculate a rough "activity percentage" based on recency and frequency
                    let activityPercent = 0;
                    if (totalMsgs > 0 && lastActiveDate) {
                      const recencyScore = Math.max(0, 100 - (daysSinceLastActive * 5)); // Drops by 5% each day inactive
                      const frequencyScore = Math.min(100, (msgsPerWeek / 10) * 100); // 10 msgs/week = 100%
                      activityPercent = Math.round((recencyScore * 0.6) + (frequencyScore * 0.4));
                    }

                    return (
                      <>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-400">Индекс активности</span>
                            <span className={activityPercent > 70 ? 'text-green-400' : activityPercent > 30 ? 'text-yellow-400' : 'text-red-400'}>
                              {activityPercent}%
                            </span>
                          </div>
                          <div className="w-full bg-black/50 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all duration-500 ${activityPercent > 70 ? 'bg-green-500' : activityPercent > 30 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                              style={{ width: `${activityPercent}%` }}
                            ></div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                            <div className="text-gray-500 text-xs mb-1">В среднем за неделю</div>
                            <div className="text-white font-medium">{msgsPerWeek.toFixed(1)} сообщ.</div>
                          </div>
                          <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                            <div className="text-gray-500 text-xs mb-1">В среднем за месяц</div>
                            <div className="text-white font-medium">{msgsPerMonth.toFixed(1)} сообщ.</div>
                          </div>
                        </div>
                        
                        <div className="text-xs text-gray-500 mt-2 bg-blue-500/10 p-2 rounded border border-blue-500/20">
                          Пользователь с нами уже <span className="text-blue-400 font-bold">{daysSinceStart}</span> дней. 
                          {daysSinceLastActive === -1 ? ' Нет активности.' : daysSinceLastActive === 0 ? ' Был активен сегодня.' : ` Не проявлял активность ${daysSinceLastActive} дней.`}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 flex-col gap-4">
            <User size={48} className="opacity-20" />
            <p>Выберите пользователя для просмотра профиля</p>
          </div>
        )}
      </div>
    </div>
  );
}
