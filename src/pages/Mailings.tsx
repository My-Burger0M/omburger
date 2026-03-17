import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, serverTimestamp, query, where, writeBatch, doc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { Users, Send, Filter, Tag as TagIcon, Search, Image as ImageIcon, Video, X, AlertCircle, MessageSquare, CheckCircle2, Upload } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRef } from 'react';

interface ChatUser {
  id: string;
  platform: string;
  chatId: string;
  username: string;
  displayName?: string;
  avatar?: string;
  tags?: string[];
  tagColors?: Record<string, string>;
}

interface FailedMessage {
  id: string;
  chatId: string;
  platform: string;
  error: string;
  text: string;
  createdAt: any;
}

const sanitizeForFirestore = (obj: any): any => {
  if (Array.isArray(obj)) {
    const hasNestedArray = obj.some(item => Array.isArray(item));
    if (hasNestedArray) {
      return obj.map((item) => {
        if (Array.isArray(item)) {
          return { _isNestedArray: true, items: sanitizeForFirestore(item) };
        }
        return sanitizeForFirestore(item);
      });
    }
    return obj.map(item => sanitizeForFirestore(item));
  } else if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (obj[key] !== undefined) {
          newObj[key] = sanitizeForFirestore(obj[key]);
        }
      }
    }
    return newObj;
  }
  return obj;
};

export default function Mailings() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['tg', 'vk']);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  
  const [messageText, setMessageText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [keyboard, setKeyboard] = useState<any[][]>([]);
  
  // Keyboard builder state
  const [btnLabel, setBtnLabel] = useState('');
  const [btnUrl, setBtnUrl] = useState('');
  const [btnColor, setBtnColor] = useState('secondary');

  const [isSending, setIsSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Failed messages state
  const [failedMessages, setFailedMessages] = useState<FailedMessage[]>([]);
  const [showFailedModal, setShowFailedModal] = useState(false);

  // Scheduled messages state
  const [scheduledMessages, setScheduledMessages] = useState<any[]>([]);
  const [showScheduledModal, setShowScheduledModal] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<any[]>([]);
  const [showNotesModal, setShowNotesModal] = useState(false);

  const [toastMessage, setToastMessage] = useState<{title: string, message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (title: string, message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ title, message, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    fetchUsers();
    fetchFailedMessages();
    if (currentUser) {
      fetchNotes();
      fetchScheduledMessages();
    }
  }, [currentUser]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const type = file.type.startsWith('video') ? 'video' : 'photo';
      const fileExtension = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
      const storageRef = ref(storage, `uploads/${currentUser?.uid || 'admin'}/${fileName}`);
      
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.round(progress));
        }, 
        (error) => {
          console.error('Upload failed:', error);
          setUploading(false);
          showToast('Ошибка', 'Ошибка загрузки файла', 'error');
        }, 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setMediaUrl(downloadURL);
          setMediaType(type);
          setUploading(false);
        }
      );
      
    } catch (error) {
      console.error('Upload failed:', error);
      setUploading(false);
      showToast('Ошибка', 'Ошибка загрузки файла', 'error');
    }
  };

  const deserializeFromFirestore = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(item => deserializeFromFirestore(item));
    } else if (obj !== null && typeof obj === 'object') {
      if (obj._isNestedArray && Array.isArray(obj.items)) {
        return deserializeFromFirestore(obj.items);
      }
      const newObj: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          newObj[key] = deserializeFromFirestore(obj[key]);
        }
      }
      return newObj;
    }
    return obj;
  };

  const fetchNotes = async () => {
    if (!currentUser) return;
    try {
      const q = query(collection(db, 'users', currentUser.uid, 'notes'));
      const snapshot = await getDocs(q);
      const fetchedNotes: any[] = [];
      snapshot.forEach(doc => {
        fetchedNotes.push({ id: doc.id, ...deserializeFromFirestore(doc.data()) });
      });
      // Sort in memory since we might not have an index
      setNotes(fetchedNotes.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)));
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

  const loadNote = (note: any) => {
    setMessageText(note.text || '');
    setMediaUrl(note.mediaUrl || '');
    setMediaType(note.mediaType || 'photo');
    
    try {
      if (note.keyboard && Array.isArray(note.keyboard)) {
        const normalizedKeyboard = note.keyboard.map((row: any) => Array.isArray(row) ? row : (row.buttons || []));
        setKeyboard(normalizedKeyboard);
      } else if (note.keyboard && note.keyboard.inline_keyboard && Array.isArray(note.keyboard.inline_keyboard)) {
        const normalizedKeyboard = note.keyboard.inline_keyboard.map((row: any) => Array.isArray(row) ? row : (row.buttons || []));
        setKeyboard(normalizedKeyboard);
      } else {
        setKeyboard([]);
      }
    } catch (e) {
      console.error("Error parsing keyboard from note:", e);
      setKeyboard([]);
    }
    setShowNotesModal(false);
  };

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

  const fetchFailedMessages = async () => {
    try {
      const q = query(collection(db, 'scheduled_messages'), where('status', '==', 'failed'));
      const snapshot = await getDocs(q);
      const failed: FailedMessage[] = [];
      snapshot.forEach(doc => {
        failed.push({ id: doc.id, ...doc.data() } as FailedMessage);
      });
      setFailedMessages(failed.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
    } catch (error) {
      console.error('Error fetching failed messages:', error);
    }
  };

  const clearFailedMessages = async () => {
    if (!window.confirm('Вы уверены, что хотите очистить все ошибки?')) return;
    try {
      const batch = writeBatch(db);
      failedMessages.forEach(msg => {
        batch.delete(doc(db, 'scheduled_messages', msg.id));
      });
      await batch.commit();
      setFailedMessages([]);
      showToast('Успех', 'Ошибки очищены');
    } catch (error) {
      console.error('Error clearing failed messages:', error);
      showToast('Ошибка', 'Ошибка при очистке', 'error');
    }
  };

  const fetchScheduledMessages = async () => {
    if (!currentUser) return;
    try {
      const q = query(collection(db, 'scheduled_messages'), where('status', '==', 'pending'), where('userId', '==', currentUser.uid));
      const snapshot = await getDocs(q);
      const scheduled: any[] = [];
      snapshot.forEach(doc => {
        scheduled.push({ id: doc.id, ...doc.data() });
      });
      setScheduledMessages(scheduled.sort((a, b) => b.scheduledAt?.toMillis() - a.scheduledAt?.toMillis()));
    } catch (error) {
      console.error('Error fetching scheduled messages:', error);
    }
  };

  const cancelScheduledMessage = async (id: string) => {
    if (!window.confirm('Вы уверены, что хотите отменить эту рассылку?')) return;
    try {
      await deleteDoc(doc(db, 'scheduled_messages', id));
      setScheduledMessages(prev => prev.filter(msg => msg.id !== id));
      showToast('Успех', 'Запланированная рассылка отменена');
    } catch (error) {
      console.error('Error canceling scheduled message:', error);
      showToast('Ошибка', 'Не удалось отменить рассылку', 'error');
    }
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const togglePlatformFilter = (platform: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    );
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = (user.displayName || user.username || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => user.tags?.includes(tag));
    const matchesPlatform = selectedPlatforms.includes(user.platform);
    return matchesSearch && matchesTags && matchesPlatform;
  });

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedUserIds.length === filteredUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(filteredUsers.map(u => u.id));
    }
  };

  // Update selected users when filters change
  useEffect(() => {
    const filteredIds = filteredUsers.map(u => u.id);
    setSelectedUserIds(prev => prev.filter(id => filteredIds.includes(id)));
  }, [searchQuery, selectedTags, selectedPlatforms, users]);

  const handleSendBroadcast = async () => {
    const usersToSend = filteredUsers.filter(u => selectedUserIds.includes(u.id));
    
    if ((!messageText.trim() && !mediaUrl) || usersToSend.length === 0 || !currentUser) return;
    
    const platformsInSelected = new Set(usersToSend.map(u => u.platform));
    if (platformsInSelected.size > 1) {
      alert('Нельзя отправлять рассылку одновременно в Telegram и ВКонтакте из-за разного формата медиа. Пожалуйста, выберите пользователей только одной платформы.');
      return;
    }

    if (!confirm(`Отправить сообщение ${usersToSend.length} пользователям?`)) return;

    setIsSending(true);
    try {
      let sentCount = 0;
      let batch = writeBatch(db);
      let operationCount = 0;

      for (const user of usersToSend) {
        const docRef = doc(collection(db, 'scheduled_messages'));
        batch.set(docRef, {
          userId: currentUser.uid,
          platform: user.platform,
          chatId: user.chatId,
          text: messageText,
          mediaUrl: mediaUrl || null,
          mediaType: mediaUrl ? mediaType : null,
          keyboard: keyboard.length > 0 ? sanitizeForFirestore({ inline_keyboard: keyboard }) : null,
          status: 'pending',
          scheduledAt: serverTimestamp(),
          createdAt: serverTimestamp()
        });
        
        sentCount++;
        operationCount++;

        if (operationCount === 500) {
          await batch.commit();
          batch = writeBatch(db);
          operationCount = 0;
        }
      }

      if (operationCount > 0) {
        await batch.commit();
      }

      showToast('Успех', `Рассылка успешно запланирована для ${sentCount} пользователей.`);
      setMessageText('');
      setMediaUrl('');
      setKeyboard([]);
    } catch (error) {
      console.error('Error sending broadcast:', error);
      showToast('Ошибка', 'Ошибка при отправке рассылки', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const addKeyboardButton = () => {
    if (!btnLabel) return;
    const currentKeyboard = [...keyboard];
    if (currentKeyboard.length === 0) currentKeyboard.push([]);
    const lastRowIndex = currentKeyboard.length - 1;
    currentKeyboard[lastRowIndex] = [...currentKeyboard[lastRowIndex], { text: btnLabel, url: btnUrl || undefined, color: btnColor }];
    setKeyboard(currentKeyboard);
    setBtnLabel('');
    setBtnUrl('');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Рассылки</h1>
        <div className="flex gap-4">
          {scheduledMessages.length > 0 && (
            <button 
              onClick={() => setShowScheduledModal(true)}
              className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
            >
              <MessageSquare size={18} />
              Запланированные ({scheduledMessages.length})
            </button>
          )}
          {failedMessages.length > 0 && (
            <button 
              onClick={() => setShowFailedModal(true)}
              className="bg-red-500/20 text-red-400 hover:bg-red-500/30 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
            >
              <AlertCircle size={18} />
              Ошибки рассылок ({failedMessages.length})
            </button>
          )}
        </div>
      </div>

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

            <div className="mb-6 space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                  <Filter size={16} /> Фильтр по соцсетям:
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => togglePlatformFilter('tg')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedPlatforms.includes('tg') ? 'bg-[#229ED9] text-white' : 'bg-[#222] text-gray-400 hover:bg-[#333]'
                    }`}
                  >
                    Telegram
                  </button>
                  <button
                    onClick={() => togglePlatformFilter('vk')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedPlatforms.includes('vk') ? 'bg-[#0077FF] text-white' : 'bg-[#222] text-gray-400 hover:bg-[#333]'
                    }`}
                  >
                    ВКонтакте
                  </button>
                </div>
              </div>

              {allTags.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                    <TagIcon size={16} /> Фильтр по тегам:
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
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Загрузка пользователей...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Пользователи не найдены</div>
              ) : (
                <>
                  <div className="flex items-center gap-3 p-3 bg-[#222] rounded-xl border border-white/5 mb-4 cursor-pointer hover:bg-[#2a2a2a] transition-colors" onClick={handleSelectAll}>
                    <div className="relative flex items-center justify-center w-5 h-5">
                      <input 
                        type="checkbox" 
                        checked={selectedUserIds.length === filteredUsers.length && filteredUsers.length > 0}
                        onChange={handleSelectAll}
                        className="peer appearance-none w-5 h-5 border-2 border-gray-600 rounded bg-[#1a1a1a] checked:bg-purple-600 checked:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all cursor-pointer"
                      />
                      <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-white">Выбрать всех ({filteredUsers.length})</span>
                  </div>
                  {filteredUsers.map(user => (
                    <div 
                      key={user.id} 
                      className="flex items-center justify-between p-4 bg-[#222] rounded-xl border border-white/5 cursor-pointer hover:bg-[#2a2a2a] transition-colors mb-2"
                      onClick={() => handleToggleUser(user.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative flex items-center justify-center w-5 h-5">
                          <input 
                            type="checkbox" 
                            checked={selectedUserIds.includes(user.id)}
                            onChange={() => {}} // Handled by parent div click
                            className="peer appearance-none w-5 h-5 border-2 border-gray-600 rounded bg-[#1a1a1a] checked:bg-purple-600 checked:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all cursor-pointer"
                          />
                          <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center overflow-hidden">
                        {user.avatar ? (
                          <img 
                            src={user.avatar} 
                            alt={user.username} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-full h-full flex items-center justify-center ${user.avatar ? 'hidden' : ''}`}>
                          <Users size={20} className="text-purple-400" />
                        </div>
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
                        {user.tags.map(tag => {
                          const color = user.tagColors?.[tag] || '#a855f7';
                          return (
                            <span 
                              key={tag} 
                              className="text-[10px] px-2 py-1 rounded text-white font-medium"
                              style={{ backgroundColor: color }}
                            >
                              {tag}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                </>
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
                <label className="block text-sm text-gray-400 mb-2">Медиа (ссылка на фото/видео)</label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setMediaType('photo')}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                      mediaType === 'photo' ? 'bg-purple-600 text-white' : 'bg-[#222] text-gray-400 hover:bg-[#333]'
                    }`}
                  >
                    <ImageIcon size={14} /> Фото
                  </button>
                  <button
                    onClick={() => setMediaType('video')}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                      mediaType === 'video' ? 'bg-purple-600 text-white' : 'bg-[#222] text-gray-400 hover:bg-[#333]'
                    }`}
                  >
                    <Video size={14} /> Видео
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://t.me/c/..."
                    className="flex-1 bg-[#222] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 text-sm"
                  />
                  <label className="bg-[#222] border border-white/10 rounded-xl px-4 py-3 text-gray-400 hover:text-white hover:bg-[#333] transition-colors cursor-pointer flex items-center justify-center relative overflow-hidden">
                    {uploading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs">{uploadProgress}%</span>
                      </div>
                    ) : (
                      <Upload size={18} />
                    )}
                    <input 
                      type="file" 
                      accept="image/*,video/*" 
                      onChange={handleFileUpload} 
                      className="hidden" 
                      disabled={uploading}
                    />
                  </label>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm text-gray-400">Текст сообщения</label>
                  <button 
                    onClick={() => setShowNotesModal(true)}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                  >
                    <MessageSquare size={14} />
                    Загрузить из заметок
                  </button>
                </div>
                <div className="relative">
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Введите текст рассылки..."
                    className="w-full bg-[#222] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 min-h-[120px] resize-none"
                  />
                </div>
              </div>

              {/* Keyboard Builder */}
              <div className="border border-white/5 rounded-xl p-4 bg-[#222] space-y-3">
                <div className="text-sm font-medium text-gray-300">Инлайн-кнопки</div>
                
                <div className="grid grid-cols-2 gap-2">
                  <input 
                    placeholder="Текст кнопки" 
                    value={btnLabel}
                    onChange={e => setBtnLabel(e.target.value)}
                    className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none"
                  />
                  <input 
                    placeholder="URL (ссылка)" 
                    value={btnUrl}
                    onChange={e => setBtnUrl(e.target.value)}
                    className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none"
                  />
                  <select 
                    value={btnColor}
                    onChange={e => setBtnColor(e.target.value)}
                    className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none col-span-2"
                  >
                    <option value="primary">Primary (Синий)</option>
                    <option value="secondary">Secondary (Белый)</option>
                    <option value="positive">Positive (Зеленый)</option>
                    <option value="negative">Negative (Красный)</option>
                  </select>
                </div>

                <button 
                  onClick={addKeyboardButton}
                  className="w-full bg-[#333] hover:bg-[#444] text-gray-300 text-xs py-2 rounded-lg transition-colors"
                >
                  + Добавить кнопку
                </button>
                
                <div className="flex flex-col gap-2 mt-3">
                  {keyboard.map((row, rIndex) => (
                    <div key={rIndex} className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 items-center">
                      {row.length === 0 && (
                        <div className="text-xs text-gray-500 italic py-1.5 flex items-center gap-2">
                          Пустой ряд (добавьте кнопку)
                          <button onClick={() => {
                            const newKeyboard = [...keyboard];
                            newKeyboard.splice(rIndex, 1);
                            setKeyboard(newKeyboard);
                          }} className="hover:text-red-400"><X size={12} /></button>
                        </div>
                      )}
                      {row.map((btn, bIndex) => (
                        <div key={bIndex} className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-2 whitespace-nowrap ${
                          btn.color === 'positive' ? 'bg-green-900/30 border-green-500/30 text-green-400' :
                          btn.color === 'negative' ? 'bg-red-900/30 border-red-500/30 text-red-400' :
                          btn.color === 'secondary' ? 'bg-white/10 border-white/20 text-gray-300' :
                          'bg-blue-900/30 border-blue-500/30 text-blue-400'
                        }`}>
                          {btn.text}
                          <button onClick={() => {
                            const newKeyboard = [...keyboard];
                            newKeyboard[rIndex] = newKeyboard[rIndex].filter((_, i) => i !== bIndex);
                            if (newKeyboard[rIndex].length === 0) newKeyboard.splice(rIndex, 1);
                            setKeyboard(newKeyboard);
                          }} className="hover:text-white"><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  ))}
                  {keyboard.length > 0 && (
                    <button 
                      onClick={() => setKeyboard([...keyboard, []])}
                      className="text-xs text-gray-500 hover:text-purple-400 text-left mt-1"
                    >
                      + Добавить новый ряд
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                <div className="text-sm text-purple-200 font-medium mb-1">Получатели: {filteredUsers.length} чел.</div>
                <div className="text-xs text-purple-300/70">
                  Сообщение будет отправлено всем пользователям из списка слева.
                </div>
              </div>

              <button
                onClick={handleSendBroadcast}
                disabled={isSending || filteredUsers.length === 0 || (!messageText.trim() && !mediaUrl)}
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

      {/* Scheduled Messages Modal */}
      {showScheduledModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <MessageSquare className="text-blue-500" />
                Запланированные рассылки
              </h2>
              <div className="flex items-center gap-4">
                <button onClick={() => setShowScheduledModal(false)} className="text-gray-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              {scheduledMessages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">Нет запланированных рассылок</div>
              ) : (
                scheduledMessages.map(msg => {
                  const user = users.find(u => u.chatId === msg.chatId && u.platform === msg.platform);
                  return (
                    <div key={msg.id} className="bg-[#222] border border-blue-500/20 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium text-white">
                          {user ? (user.displayName || user.username) : `ID: ${msg.chatId}`}
                          <span className="text-xs text-gray-500 ml-2">({msg.platform})</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-xs text-gray-500">
                            {msg.scheduledAt?.toDate().toLocaleString('ru-RU')}
                          </div>
                          <button
                            onClick={() => cancelScheduledMessage(msg.id)}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            Отменить
                          </button>
                        </div>
                      </div>
                      <div className="text-sm text-gray-300 mt-2 line-clamp-2">
                        {msg.text || (msg.mediaUrl ? '[Медиафайл]' : '')}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Failed Messages Modal */}
      {showFailedModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <AlertCircle className="text-red-500" />
                Ошибки рассылок
              </h2>
              <div className="flex items-center gap-4">
                {failedMessages.length > 0 && (
                  <button 
                    onClick={clearFailedMessages}
                    className="text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    Очистить все
                  </button>
                )}
                <button onClick={() => setShowFailedModal(false)} className="text-gray-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              {failedMessages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">Нет ошибок рассылок</div>
              ) : (
                failedMessages.map(msg => {
                  const user = users.find(u => u.chatId === msg.chatId && u.platform === msg.platform);
                  return (
                    <div key={msg.id} className="bg-[#222] border border-red-500/20 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium text-white">
                          {user ? (user.displayName || user.username) : `ID: ${msg.chatId}`}
                          <span className="text-xs text-gray-500 ml-2">({msg.platform})</span>
                        </div>
                        <div className="text-xs text-gray-500">
                        {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleString('ru-RU') : (msg.createdAt instanceof Date ? msg.createdAt.toLocaleString('ru-RU') : 'Дата не указана')}
                        </div>
                      </div>
                      <div className="text-sm text-gray-400 mb-2 line-clamp-2">
                        {msg.text || '[Медиа сообщение]'}
                      </div>
                      <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">
                        {msg.error}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <MessageSquare className="text-purple-500" />
                Загрузить из заметок
              </h2>
              <button onClick={() => setShowNotesModal(false)} className="text-gray-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              {notes.length === 0 ? (
                <div className="text-center text-gray-500 py-8">У вас пока нет заметок</div>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="bg-[#222] border border-white/5 rounded-xl p-4 hover:border-purple-500/50 transition-colors cursor-pointer" onClick={() => loadNote(note)}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-white line-clamp-1 flex-1">
                        {note.text || '[Медиа сообщение]'}
                      </div>
                      <div className="text-xs text-gray-500 ml-4 whitespace-nowrap">
                        {note.createdAt?.toDate ? note.createdAt.toDate().toLocaleString('ru-RU') : (note.createdAt instanceof Date ? note.createdAt.toLocaleString('ru-RU') : 'Дата не указана')}
                      </div>
                    </div>
                    {note.mediaUrl && (
                      <div className="text-xs text-purple-400 flex items-center gap-1 mt-2">
                        {note.mediaType === 'video' ? <Video size={12} /> : <ImageIcon size={12} />}
                        Вложение
                      </div>
                    )}
                    {note.keyboard && note.keyboard.length > 0 && (
                      <div className="text-xs text-blue-400 mt-1">
                        + Инлайн-кнопки ({note.keyboard.length} ряд.)
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 animate-fade-in-up">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border ${
            toastMessage.type === 'success' ? 'bg-emerald-900/90 border-emerald-500/50 text-emerald-100' : 'bg-red-900/90 border-red-500/50 text-red-100'
          }`}>
            {toastMessage.type === 'success' ? <CheckCircle2 size={20} className="text-emerald-400" /> : <AlertCircle size={20} className="text-red-400" />}
            <div>
              <h4 className="font-bold text-sm">{toastMessage.title}</h4>
              <p className="text-xs opacity-90">{toastMessage.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
