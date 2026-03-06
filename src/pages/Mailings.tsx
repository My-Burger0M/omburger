import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Users, Send, Filter, Tag as TagIcon, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ChatUser {
  id: string;
  platform: string;
  chatId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  tags?: string[];
}

export default function Mailings() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'chats'));
      const fetchedUsers: ChatUser[] = [];
      const tagsSet = new Set<string>();

      snapshot.forEach(doc => {
        const data = doc.data() as ChatUser;
        fetchedUsers.push({ ...data, id: doc.id });
        if (data.tags) {
          data.tags.forEach(tag => tagsSet.add(tag));
        }
      });

      setUsers(fetchedUsers);
      setAllTags(Array.from(tagsSet));
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = (user.displayName || user.username || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => user.tags?.includes(tag));
    return matchesSearch && matchesTags;
  });

  const handleSendBroadcast = async () => {
    if (!messageText.trim() || filteredUsers.length === 0 || !currentUser) return;
    
    if (!confirm(`Отправить сообщение ${filteredUsers.length} пользователям?`)) return;

    setIsSending(true);
    try {
      let sentCount = 0;
      for (const user of filteredUsers) {
        await addDoc(collection(db, 'scheduled_messages'), {
          userId: currentUser.uid,
          platform: user.platform,
          chatId: user.chatId,
          text: messageText,
          status: 'pending',
          scheduledAt: serverTimestamp(),
          createdAt: serverTimestamp()
        });
        sentCount++;
      }
      alert(`Рассылка успешно запланирована для ${sentCount} пользователей.`);
      setMessageText('');
    } catch (error) {
      console.error('Error sending broadcast:', error);
      alert('Ошибка при отправке рассылки');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold mb-8">Рассылки</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Filters and Users List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6">
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Поиск пользователей..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#222] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="flex items-center gap-2 text-gray-400 bg-[#222] px-4 py-3 rounded-xl border border-white/10">
                <Users size={20} />
                <span>Найдено: {filteredUsers.length}</span>
              </div>
            </div>

            {allTags.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                  <Filter size={16} /> Фильтр по тегам:
                </div>
                <div className="flex flex-wrap gap-2">
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleTagFilter(tag)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                        selectedTags.includes(tag)
                          ? 'bg-purple-600 text-white'
                          : 'bg-[#222] text-gray-400 hover:bg-[#333]'
                      }`}
                    >
                      <TagIcon size={12} /> {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Загрузка пользователей...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Пользователи не найдены</div>
              ) : (
                filteredUsers.map(user => (
                  <div key={user.id} className="flex items-center justify-between p-4 bg-[#222] rounded-xl border border-white/5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center overflow-hidden">
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                        ) : (
                          <Users size={20} className="text-purple-400" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-white">{user.displayName || user.username}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          <span className={user.platform === 'tg' ? 'text-blue-400' : 'text-blue-500'}>
                            {user.platform === 'tg' ? 'Telegram' : 'ВКонтакте'}
                          </span>
                          <span>•</span>
                          <span>ID: {user.chatId}</span>
                        </div>
                      </div>
                    </div>
                    {user.tags && user.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap justify-end max-w-[200px]">
                        {user.tags.map(tag => (
                          <span key={tag} className="text-[10px] bg-white/10 text-gray-300 px-2 py-1 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Compose Message */}
        <div className="space-y-6">
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 sticky top-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Send size={20} className="text-purple-500" />
              Новая рассылка
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Текст сообщения</label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Введите текст рассылки..."
                  className="w-full bg-[#222] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 min-h-[200px] resize-none"
                />
              </div>

              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                <div className="text-sm text-purple-200 font-medium mb-1">Получатели: {filteredUsers.length} чел.</div>
                <div className="text-xs text-purple-300/70">
                  Сообщение будет отправлено всем пользователям из списка слева. Используйте фильтры для точной настройки аудитории.
                </div>
              </div>

              <button
                onClick={handleSendBroadcast}
                disabled={isSending || filteredUsers.length === 0 || !messageText.trim()}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-400 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isSending ? (
                  'Отправка...'
                ) : (
                  <>
                    <Send size={18} />
                    Отправить рассылку
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
