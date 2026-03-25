import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, deleteField, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { User, Tag, Trash2, Search, Filter, Plus, X, Send, CheckCircle, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function CRM() {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Toast state
  const [toastMessage, setToastMessage] = useState<{title: string, message: string, type: 'success' | 'error'} | null>(null);
  const [isSendingInfo, setIsSendingInfo] = useState(false);

  // Sorting/Multi-select state
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortPlatform, setSortPlatform] = useState<'all' | 'tg' | 'vk'>('all');
  const [selectedUsersForInfo, setSelectedUsersForInfo] = useState<string[]>([]);
  
  const showToast = (title: string, message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ title, message, type });
    setTimeout(() => setToastMessage(null), 3000);
  };
  
  // Tagging
  const [newTag, setNewTag] = useState('');
  const [newTagColor, setNewTagColor] = useState('#a855f7');

  const { currentUser } = useAuth();

  const sendToTelegram = async (usersToSend: any[]) => {
    if (!currentUser || usersToSend.length === 0) return;
    setIsSendingInfo(true);
    try {
      // Chunk users into groups of 10 to combine into single messages
      // This reduces the number of messages and avoids rate limits
      const chunks = [];
      for (let i = 0; i < usersToSend.length; i += 10) {
        chunks.push(usersToSend.slice(i, i + 10));
      }

      let batch = writeBatch(db);
      let batchCount = 0;

      for (const chunk of chunks) {
        let combinedText = '';
        
        chunk.forEach((user, index) => {
          const tags = user.tags && user.tags.length > 0 ? user.tags.join(', ') : 'Нет тегов';
          const name = user.username || user.firstName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username : 'Без имени';
          const platform = user.platform === 'tg' ? 'Telegram' : 'VK';
          const id = user.id;
          
          let tenure = 'Неизвестно';
          let firstTouch = 'Неизвестно';
          if (user.createdAt) {
            const createdDate = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt.seconds ? user.createdAt.seconds * 1000 : user.createdAt);
            const now = new Date();
            const diffDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
            tenure = `${diffDays} дней`;
            firstTouch = createdDate.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          }

          let lastActive = 'Неизвестно';
          if (user.lastMessageAt) {
            const lastDate = user.lastMessageAt.toDate ? user.lastMessageAt.toDate() : new Date(user.lastMessageAt.seconds ? user.lastMessageAt.seconds * 1000 : user.lastMessageAt);
            lastActive = lastDate.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          }

          const text = `👤 *Информация о пользователе*\n\n` +
                       `*Имя:* ${name}\n` +
                       `*Платформа:* ${platform}\n` +
                       `*ID:* \`${id}\`\n` +
                       `*Теги:* ${tags}\n` +
                       `*Первое касание:* ${firstTouch}\n` +
                       `*Последняя активность:* ${lastActive}\n` +
                       `*С нами:* ${tenure}\n` +
                       `*Всего сообщений:* ${user.messageCount || 0}`;
          
          combinedText += text;
          if (index < chunk.length - 1) {
            combinedText += '\n\n---\n\n';
          }
        });

        const newDocRef = doc(collection(db, 'scheduled_notifications'));
        batch.set(newDocRef, {
          userId: currentUser.uid,
          text: combinedText,
          status: 'pending',
          scheduledAt: serverTimestamp(),
          createdAt: serverTimestamp()
        });
        
        batchCount++;
        // Firestore batch limit is 500 operations
        if (batchCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      showToast('Успех', `Информация по ${usersToSend.length} пользовател${usersToSend.length === 1 ? 'ю' : 'ям'} отправлена!`);
      setShowSortModal(false);
      setSelectedUsersForInfo([]);
    } catch (error) {
      console.error('Error sending to telegram:', error);
      showToast('Ошибка', 'Не удалось отправить информацию', 'error');
    } finally {
      setIsSendingInfo(false);
    }
  };

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

  const sortedUsers = [...users]
    .filter(u => sortPlatform === 'all' || u.platform === sortPlatform)
    .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0));

  const toggleUserSelection = (id: string) => {
    setSelectedUsersForInfo(prev => 
      prev.includes(id) ? prev.filter(userId => userId !== id) : [...prev, id]
    );
  };

  const selectAllUsers = () => {
    if (selectedUsersForInfo.length === sortedUsers.length) {
      setSelectedUsersForInfo([]);
    } else {
      setSelectedUsersForInfo(sortedUsers.map(u => u.id));
    }
  };

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-6rem)] flex gap-6 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`absolute top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl transition-all duration-300 transform translate-y-0 opacity-100 ${
          toastMessage.type === 'success' ? 'bg-green-900/50 border border-green-500/30 text-green-300' : 'bg-red-900/50 border border-red-500/30 text-red-300'
        }`}>
          {toastMessage.type === 'success' ? <CheckCircle size={20} /> : <X size={20} />}
          <div>
            <div className="font-bold text-sm">{toastMessage.title}</div>
            <div className="text-xs opacity-80">{toastMessage.message}</div>
          </div>
        </div>
      )}

      {/* Sort Modal */}
      {showSortModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] rounded-3xl border border-white/10 w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#222] rounded-t-3xl">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Users className="text-purple-500" />
                Топ пользователей
              </h2>
              <button onClick={() => setShowSortModal(false)} className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-xl">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 border-b border-white/5 flex gap-4 items-center bg-[#1a1a1a]">
              <div className="flex gap-2 bg-[#2a2a2a] p-1.5 rounded-xl border border-white/5">
                <button 
                  onClick={() => setSortPlatform('all')}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${sortPlatform === 'all' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  Все
                </button>
                <button 
                  onClick={() => setSortPlatform('tg')}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${sortPlatform === 'tg' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  Telegram
                </button>
                <button 
                  onClick={() => setSortPlatform('vk')}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${sortPlatform === 'vk' ? 'bg-blue-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  ВКонтакте
                </button>
              </div>
              
              <div className="flex-1"></div>
              
              <button 
                onClick={selectAllUsers}
                className="text-sm text-purple-400 hover:text-purple-300 transition-colors font-medium px-4 py-2 hover:bg-purple-500/10 rounded-xl"
              >
                {selectedUsersForInfo.length === sortedUsers.length ? 'Снять выделение' : 'Выбрать всех'}
              </button>
              
              <button 
                onClick={() => sendToTelegram(sortedUsers.filter(u => selectedUsersForInfo.includes(u.id)))}
                disabled={selectedUsersForInfo.length === 0 || isSendingInfo}
                className="flex items-center gap-2 px-6 py-3 bg-white text-black hover:bg-gray-200 disabled:bg-[#2a2a2a] disabled:text-gray-500 rounded-xl transition-all shadow-lg text-sm font-bold"
              >
                <Send size={18} />
                {isSendingInfo ? 'Отправка...' : `Отправить инфо (${selectedUsersForInfo.length})`}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
              {sortedUsers.map((user, index) => (
                <div 
                  key={user.id}
                  onClick={() => toggleUserSelection(user.id)}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-colors cursor-pointer group ${
                    selectedUsersForInfo.includes(user.id) 
                      ? 'bg-purple-500/10 border-purple-500/50' 
                      : 'bg-[#222] border-white/5 hover:bg-[#2a2a2a] hover:border-white/10'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-gray-400 font-bold text-sm">
                    #{index + 1}
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    {(user.username?.[0] || user.firstName?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate text-lg">
                      {user.username || user.firstName ? `${user.firstName || ''} ${user.lastName || ''} ${user.username ? `(${user.username})` : ''}` : user.id}
                    </div>
                    <div className="text-sm text-gray-500 truncate flex items-center gap-3 mt-1">
                      <span className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${user.platform === 'tg' ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-400/20 text-blue-300'}`}>
                        {user.platform === 'tg' ? 'Telegram' : 'VK'}
                      </span>
                      <span>ID: {user.id}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-sm font-bold text-white bg-[#2a2a2a] px-4 py-2 rounded-xl border border-white/5">
                      {user.messageCount || 0} сообщ.
                    </div>
                    <div className="text-xs text-gray-500">
                      Актив: {user.lastMessageAt?.seconds ? new Date(user.lastMessageAt.seconds * 1000).toLocaleDateString('ru-RU') : '-'}
                    </div>
                  </div>
                </div>
              ))}
              {sortedUsers.length === 0 && (
                <div className="text-center text-gray-500 py-12 text-lg">Нет пользователей для отображения</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Users List */}
      <div className="w-1/3 bg-[#1a1a1a] rounded-3xl border border-white/10 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <User className="text-purple-500" size={28} /> Пользователи
              <span className="text-sm bg-[#2a2a2a] px-3 py-1 rounded-xl text-gray-300 font-medium">{users.length}</span>
            </h2>
            <button 
              onClick={() => setShowSortModal(true)}
              className="p-3 bg-[#2a2a2a] hover:bg-[#333] text-gray-400 hover:text-white rounded-xl transition-colors"
              title="Топ пользователей"
            >
              <Filter size={20} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input 
              type="text" 
              placeholder="Поиск..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#2a2a2a] border border-white/5 rounded-xl pl-12 pr-4 py-4 text-white outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          {loading ? (
            <div className="text-center text-gray-500 py-12 text-lg">Загрузка...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center text-gray-500 py-12 text-lg">Пользователи не найдены</div>
          ) : (
            filteredUsers.map(user => (
              <div 
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className={`p-4 rounded-2xl cursor-pointer transition-colors flex items-center gap-4 group ${selectedUser?.id === user.id ? 'bg-purple-500/20 border border-purple-500/50' : 'bg-[#222] border border-white/5 hover:bg-[#2a2a2a] hover:border-white/10'}`}
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  {(user.username?.[0] || user.firstName?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white text-lg truncate">
                    {user.username || user.firstName ? `${user.firstName || ''} ${user.lastName || ''} ${user.username ? `(${user.username})` : ''}` : user.id}
                  </div>
                  <div className="text-sm text-gray-500 truncate flex items-center gap-3 mt-1">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${user.platform === 'tg' ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-400/20 text-blue-300'}`}>
                      {user.platform === 'tg' ? 'Telegram' : user.platform === 'vk' ? 'VK' : 'Unknown'}
                    </span>
                    {user.tags && user.tags.length > 0 && (
                      <span className="bg-[#2a2a2a] px-2 py-0.5 rounded-md text-[11px] text-gray-300 border border-white/5">
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
      <div className="flex-1 bg-[#1a1a1a] rounded-3xl border border-white/10 flex flex-col overflow-hidden">
        {selectedUser ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
            <div className="flex items-start justify-between mb-10">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-4xl shadow-xl shadow-purple-900/20">
                  {(selectedUser.username?.[0] || selectedUser.firstName?.[0] || '?').toUpperCase()}
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2">
                    {selectedUser.username || selectedUser.firstName ? `${selectedUser.firstName || ''} ${selectedUser.lastName || ''}` : 'Без имени'}
                  </h2>
                  <div className="text-gray-400 text-lg mb-3">{selectedUser.username || selectedUser.id}</div>
                  <div className="flex gap-3">
                    <span className="px-3 py-1 rounded-lg text-sm font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {selectedUser.platform === 'tg' ? 'Telegram' : 'VK'}
                    </span>
                    <span className="px-3 py-1 rounded-lg text-sm font-medium bg-[#2a2a2a] text-gray-300 border border-white/5">
                      ID: {selectedUser.id}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => sendToTelegram([selectedUser])}
                disabled={isSendingInfo}
                className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-gray-200 disabled:bg-[#2a2a2a] disabled:text-gray-500 text-black font-bold rounded-xl transition-colors shadow-lg"
                title="Отправить информацию в Telegram"
              >
                <Send size={20} />
                <span>{isSendingInfo ? 'Отправка...' : 'Отправить инфо'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="bg-[#222] p-6 rounded-2xl border border-white/5">
                <h3 className="text-lg font-medium text-gray-300 mb-6">Теги и Сегменты</h3>
                
                <div className="flex gap-3 mb-6">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Новый тег..."
                    className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
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
                  <div className="bg-[#2a2a2a] border border-white/5 rounded-xl p-2 flex items-center justify-center">
                    <input
                      type="color"
                      value={newTagColor}
                      onChange={(e) => setNewTagColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0"
                      title="Цвет тега"
                    />
                  </div>
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
                    className="bg-purple-600 hover:bg-purple-500 text-white px-4 rounded-xl flex items-center justify-center transition-colors shadow-lg"
                  >
                    <Plus size={20} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-3 mb-8">
                  {selectedUser.tags && selectedUser.tags.length > 0 ? (
                    selectedUser.tags.map((tag: string, i: number) => {
                      const color = selectedUser.tagColors?.[tag] || '#a855f7';
                      return (
                        <span 
                          key={i} 
                          className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 text-white group shadow-md"
                          style={{ backgroundColor: color }}
                        >
                          <Tag size={14} /> {tag}
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
                            className="p-1 hover:bg-black/20 rounded-lg opacity-50 hover:opacity-100 transition-all ml-1"
                            title="Удалить тег"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      );
                    })
                  ) : (
                    <div className="text-gray-500 text-base italic bg-[#1a1a1a] px-4 py-3 rounded-xl border border-white/5 w-full text-center">Нет тегов</div>
                  )}
                </div>

                {selectedUser.tags && selectedUser.tags.length > 0 && (
                  <button 
                    onClick={handleDeleteTags}
                    className="w-full py-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2 font-medium"
                  >
                    <Trash2 size={18} /> Удалить все теги
                  </button>
                )}
              </div>

              <div className="bg-[#222] p-6 rounded-2xl border border-white/5">
                <h3 className="text-lg font-medium text-gray-300 mb-6">Информация</h3>
                <div className="space-y-4 text-base">
                  <div className="flex justify-between items-center bg-[#1a1a1a] p-3 rounded-xl border border-white/5">
                    <span className="text-gray-400">Первое касание:</span>
                    <span className="text-white font-medium">
                      {selectedUser.createdAt?.seconds 
                        ? new Date(selectedUser.createdAt.seconds * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                        : (selectedUser.lastMessageAt?.seconds 
                            ? new Date(selectedUser.lastMessageAt.seconds * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                            : '-')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-[#1a1a1a] p-3 rounded-xl border border-white/5">
                    <span className="text-gray-400">Последняя активность:</span>
                    <span className="text-white font-medium">
                      {selectedUser.lastMessageAt?.seconds ? new Date(selectedUser.lastMessageAt.seconds * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-[#1a1a1a] p-3 rounded-xl border border-white/5">
                    <span className="text-gray-400">Всего сообщений:</span>
                    <span className="text-white font-bold text-lg">{selectedUser.messageCount || 0}</span>
                  </div>
                  <div className="flex justify-between items-center bg-[#1a1a1a] p-3 rounded-xl border border-white/5">
                    <span className="text-gray-400">Платформа:</span>
                    <span className="text-white uppercase font-medium">{selectedUser.platform || 'TG'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-[#222] p-6 rounded-2xl border border-white/5 mt-2 col-span-2">
                <h3 className="text-lg font-medium text-gray-300 mb-6">Статистика активности</h3>
                <div className="space-y-6">
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

                    return (
                      <>
                        <div className="grid grid-cols-2 gap-4 text-base">
                          <div className="bg-[#1a1a1a] p-5 rounded-xl border border-white/5 flex flex-col items-center justify-center">
                            <div className="text-gray-400 mb-2 font-medium">В среднем за неделю</div>
                            <div className="text-white font-bold text-2xl">{msgsPerWeek.toFixed(1)} <span className="text-sm font-normal text-gray-500">сообщ.</span></div>
                          </div>
                          <div className="bg-[#1a1a1a] p-5 rounded-xl border border-white/5 flex flex-col items-center justify-center">
                            <div className="text-gray-400 mb-2 font-medium">В среднем за месяц</div>
                            <div className="text-white font-bold text-2xl">{msgsPerMonth.toFixed(1)} <span className="text-sm font-normal text-gray-500">сообщ.</span></div>
                          </div>
                        </div>
                        
                        <div className="text-sm text-gray-300 mt-4 bg-blue-900/20 p-4 rounded-xl border border-blue-500/20 flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                          <div>
                            Пользователь с нами уже <span className="text-blue-400 font-bold">{daysSinceStart}</span> дней. 
                            {daysSinceLastActive === -1 ? ' Нет активности.' : daysSinceLastActive === 0 ? ' Был активен сегодня.' : ` Не проявлял активность ${daysSinceLastActive} дней.`}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 flex-col gap-6 bg-[#1a1a1a]">
            <div className="w-24 h-24 rounded-full bg-[#222] flex items-center justify-center border border-white/5">
              <User size={48} className="text-gray-600" />
            </div>
            <p className="text-xl font-medium">Выберите пользователя для просмотра профиля</p>
          </div>
        )}
      </div>
    </div>
  );
}
