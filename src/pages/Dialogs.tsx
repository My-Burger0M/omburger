import React, { useState, useEffect, useRef } from 'react';
import { Search, MoreVertical, Send, Paperclip, Smile, Mic, MessageCircle, Trash2 } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import ConfirmationModal from '../components/ConfirmationModal';
import axios from 'axios';

interface Chat {
  id: string;
  chatId: string; // The platform-specific ID
  platform: 'tg' | 'vk' | 'max';
  username: string;
  lastMessage: string;
  lastMessageAt: any;
  unreadCount: number;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'admin';
  timestamp: any;
}

export default function Dialogs() {
  const { currentUser } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<'all' | 'tg' | 'vk' | 'max'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setChatToDelete(chatId);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (chatToDelete) {
      try {
        await deleteDoc(doc(db, 'chats', chatToDelete));
        if (selectedChatId === chatToDelete) {
          setSelectedChatId(null);
        }
      } catch (error) {
        console.error('Error deleting chat:', error);
      }
      setDeleteModalOpen(false);
      setChatToDelete(null);
    }
  };

  // Sync filter with URL
  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam && ['all', 'tg', 'vk', 'max'].includes(filterParam)) {
      setFilter(filterParam as any);
    }
    
    const chatIdParam = searchParams.get('chatId');
    if (chatIdParam) {
      setSelectedChatId(chatIdParam);
    }
  }, [searchParams]);

  const handleSetFilter = (newFilter: 'all' | 'tg' | 'vk' | 'max') => {
    setFilter(newFilter);
    setSearchParams({ filter: newFilter });
  };

  // Fetch chats
  useEffect(() => {
    const q = query(collection(db, 'chats'), orderBy('lastMessageAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Chat[];
      setChats(chatsData);
    });
    return () => unsubscribe();
  }, []);

  // Filter chats
  const filteredChats = chats.filter(chat => {
    const matchesFilter = filter === 'all' || chat.platform === filter;
    const matchesSearch = chat.username.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Fetch messages for selected chat
  useEffect(() => {
    if (!selectedChatId) return;

    const q = query(
      collection(db, 'chats', selectedChatId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(msgs);
      
      // Reset unread count when opening chat
      const chatRef = doc(db, 'chats', selectedChatId);
      updateDoc(chatRef, { unreadCount: 0 });
    });

    return () => unsubscribe();
  }, [selectedChatId]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChatId) return;

    const chat = chats.find(c => c.id === selectedChatId);
    if (!chat) return;

    const messageText = newMessage;
    setNewMessage('');

    try {
      // 1. Send via API to the platform
      await axios.post('/api/messages/send', {
        chatId: chat.chatId,
        platform: chat.platform,
        text: messageText,
        userId: currentUser?.uid
      });

      // 2. Add message to Firestore subcollection
      await addDoc(collection(db, 'chats', selectedChatId, 'messages'), {
        text: messageText,
        sender: 'admin',
        timestamp: serverTimestamp()
      });

      // 3. Update chat metadata
      const chatRef = doc(db, 'chats', selectedChatId);
      await updateDoc(chatRef, {
        lastMessage: messageText,
        lastMessageAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Ошибка при отправке сообщения. Проверьте настройки токенов.');
    }
  };

  const selectedChat = chats.find(c => c.id === selectedChatId);

  return (
    <div className="h-[calc(100vh-2rem)] flex bg-[#1a1a1a] rounded-2xl overflow-hidden border border-white/10">
      {/* Sidebar */}
      <div className="w-80 border-r border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10 space-y-4">
          {/* Filter Tabs */}
          <div className="flex p-1 bg-[#2a2a2a] rounded-xl">
            <button 
              onClick={() => handleSetFilter('all')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'all' ? 'bg-[#3a3a3a] text-white shadow-sm' : 'text-gray-400 hover:text-gray-300'}`}
            >
              Все
            </button>
            <button 
              onClick={() => handleSetFilter('tg')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'tg' ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-gray-400 hover:text-gray-300'}`}
            >
              TG
            </button>
            <button 
              onClick={() => handleSetFilter('vk')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'vk' ? 'bg-blue-500/20 text-blue-400 shadow-sm' : 'text-gray-400 hover:text-gray-300'}`}
            >
              VK
            </button>
            <button 
              onClick={() => handleSetFilter('max')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'max' ? 'bg-purple-500/20 text-purple-400 shadow-sm' : 'text-gray-400 hover:text-gray-300'}`}
            >
              MAX
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Поиск..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#2a2a2a] rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredChats.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              Нет активных диалогов
            </div>
          ) : (
            filteredChats.map(chat => (
              <div 
                key={chat.id}
                onClick={() => setSelectedChatId(chat.id)}
                className={`p-4 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors group ${selectedChatId === chat.id ? 'bg-white/5' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="font-medium truncate pr-2 flex items-center gap-2">
                    {chat.platform === 'tg' && <Send size={14} className="text-cyan-400 shrink-0" />}
                    {chat.platform === 'vk' && <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1 rounded shrink-0">VK</span>}
                    {chat.platform === 'max' && <MessageCircle size={14} className="text-purple-400 shrink-0" />}
                    <span className="truncate">{chat.username}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {chat.lastMessageAt?.toDate ? format(chat.lastMessageAt.toDate(), 'HH:mm') : ''}
                    </span>
                    <button 
                      onClick={(e) => handleDeleteChat(e, chat.id)}
                      className="text-gray-500 hover:text-red-500 hover:bg-red-500/10 transition-all p-1.5 rounded-full opacity-0 group-hover:opacity-100"
                      title="Удалить диалог"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-400 truncate max-w-[180px]">{chat.lastMessage}</p>
                  {chat.unreadCount > 0 && (
                    <span className="bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {chat.unreadCount}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex gap-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    chat.platform === 'tg' ? 'border-cyan-500/30 text-cyan-400' :
                    chat.platform === 'vk' ? 'border-blue-500/30 text-blue-400' :
                    'border-purple-500/30 text-purple-400'
                  }`}>
                    {chat.platform.toUpperCase()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#1a1a1a]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-lg font-bold">
                {selectedChat.username[0].toUpperCase()}
              </div>
              <div>
                <div className="font-bold">{selectedChat.username}</div>
                <div className="text-xs text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                  Онлайн
                </div>
              </div>
            </div>
            <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
              <MoreVertical size={20} className="text-gray-400" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#121212]">
            {messages.map(msg => (
              <div 
                key={msg.id} 
                className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                    msg.sender === 'admin' 
                      ? 'bg-purple-600 text-white rounded-tr-none' 
                      : 'bg-[#2a2a2a] text-gray-200 rounded-tl-none'
                  }`}
                >
                  <p className="text-sm">{msg.text}</p>
                  <div className={`text-[10px] mt-1 text-right ${msg.sender === 'admin' ? 'text-purple-200' : 'text-gray-500'}`}>
                    {msg.timestamp?.toDate ? format(msg.timestamp.toDate(), 'HH:mm') : ''}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 bg-[#1a1a1a] border-t border-white/10">
            <form onSubmit={handleSendMessage} className="flex items-center gap-3">
              <button type="button" className="p-2 text-gray-400 hover:text-white transition-colors">
                <Paperclip size={20} />
              </button>
              <div className="flex-1 relative">
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Напишите сообщение..." 
                  className="w-full bg-[#2a2a2a] rounded-xl pl-4 pr-10 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all"
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                  <Smile size={20} />
                </button>
              </div>
              {newMessage.trim() ? (
                <button 
                  type="submit" 
                  className="p-3 bg-purple-600 rounded-xl hover:bg-purple-500 transition-colors text-white shadow-lg shadow-purple-500/20"
                >
                  <Send size={20} />
                </button>
              ) : (
                <button type="button" className="p-3 bg-[#2a2a2a] rounded-xl hover:bg-[#333] transition-colors text-gray-400">
                  <Mic size={20} />
                </button>
              )}
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-[#121212]">
          <MessageCircle size={48} className="mb-4 opacity-20" />
          <p>Выберите диалог для начала общения</p>
        </div>
      )}
      
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setChatToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Удалить диалог"
        message="Вы уверены, что хотите удалить этот диалог? Это действие нельзя отменить, и вся история переписки будет потеряна."
      />
    </div>
  );
}
