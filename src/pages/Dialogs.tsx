import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, MoreVertical, Send, Paperclip, Smile, Mic, MessageCircle, 
  Trash2, Image as ImageIcon, Video, X, Plus, ExternalLink, User,
  MoreHorizontal, Check, CheckCheck, PlayCircle, StickyNote, Edit2, Save, FileText, Upload, Clock, Calendar
} from 'lucide-react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDoc, getDocs, writeBatch, setDoc, where } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import ConfirmationModal from '../components/ConfirmationModal';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { DateTime } from 'luxon';

// Sound for new messages
const playNotificationSound = () => {
  try {
    const audio = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.error('Error playing sound:', e));
  } catch (e) {
    console.error('Audio API not supported', e);
  }
};

interface Chat {
  id: string;
  chatId: string;
  platform: 'tg' | 'vk' | 'max';
  username: string;
  displayName?: string;
  customName?: string; // For manual renaming
  avatar?: string;
  lastMessage: string;
  lastMessageAt: any;
  unreadCount: number;
  tags?: string[];
  tagColors?: Record<string, string>;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'admin';
  timestamp: any;
  mediaUrl?: string;
  mediaType?: 'photo' | 'video' | 'voice' | 'animation';
  keyboard?: any;
  playedAt?: any;
  voiceDuration?: number;
}

interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
  color?: 'primary' | 'secondary' | 'positive' | 'negative';
}

interface Note {
  id: string;
  title: string;
  text: string;
  mediaUrl?: string;
  mediaType?: 'photo' | 'video';
  keyboard?: InlineButton[][];
  createdAt?: any;
}

const sanitizeData = (obj: any): any => {
  if (Array.isArray(obj)) {
    const hasNestedArray = obj.some(item => Array.isArray(item));
    if (hasNestedArray) {
      return obj.map((item) => {
        if (Array.isArray(item)) {
          return { _isNestedArray: true, items: sanitizeData(item) };
        }
        return sanitizeData(item);
      });
    }
    return obj.map(item => sanitizeData(item));
  } else if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (obj[key] !== undefined) {
          newObj[key] = sanitizeData(obj[key]);
        }
      }
    }
    return newObj;
  }
  return obj;
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

export default function Dialogs() {
  const { currentUser } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<'all' | 'tg' | 'vk' | 'max'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('');
  
  // Modals & UI States
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [showKeyboardBuilder, setShowKeyboardBuilder] = useState(false);
  const [keyboardRows, setKeyboardRows] = useState<InlineButton[][]>([]);
  const [btnLabel, setBtnLabel] = useState('');
  const [btnUrl, setBtnUrl] = useState('');
  const [btnColor, setBtnColor] = useState<'primary' | 'secondary' | 'positive' | 'negative'>('primary');
  
  // File Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteFileInputRef = useRef<HTMLInputElement>(null);

  // Bulk Delete
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);

  // Notes & Scheduling
  const [showNotes, setShowNotes] = useState(false);
  const [isGlobalNotes, setIsGlobalNotes] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<any[]>([]);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [scheduledTime, setScheduledTime] = useState('');
  const [showScheduler, setShowScheduler] = useState(false);
  const [noteToSchedule, setNoteToSchedule] = useState<Note | null>(null);
  const [notesTab, setNotesTab] = useState<'notes' | 'scheduled'>('notes');

  // Renaming
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  
  // Tagging
  const [newTag, setNewTag] = useState('');
  const [newTagColor, setNewTagColor] = useState('#a855f7');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Actions ---

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setChatToDelete(chatId);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (chatToDelete) {
      try {
        await deleteDoc(doc(db, 'chats', chatToDelete));
        const messagesRef = collection(db, 'chats', chatToDelete, 'messages');
        const snapshot = await getDocs(messagesRef);
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();

        if (selectedChatId === chatToDelete) setSelectedChatId(null);
      } catch (error) {
        console.error('Error deleting chat:', error);
      }
      setDeleteModalOpen(false);
      setChatToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (window.confirm('Вы уверены, что хотите удалить ВСЕ диалоги? Это действие необратимо.')) {
      try {
        const batch = writeBatch(db);
        chats.forEach(chat => {
           batch.delete(doc(db, 'chats', chat.id));
        });
        await batch.commit();
        setChats([]);
        setSelectedChatId(null);
        setBulkDeleteModalOpen(false);
      } catch (error) {
        console.error('Error deleting all chats:', error);
      }
    }
  };

  const handleClearAllHistory = async () => {
    if (!window.confirm('Вы уверены, что хотите очистить историю диалогов со ВСЕМИ пользователями? Сообщения будут удалены, но сами диалоги останутся.')) return;
    
    try {
      let batch = writeBatch(db);
      let operationCount = 0;
      const MAX_BATCH_SIZE = 450; 

      for (const chat of chats) {
        const chatRef = doc(db, 'chats', chat.id);
        batch.update(chatRef, {
          lastMessage: '',
          unreadCount: 0,
          messageCount: 0
        });
        operationCount++;

        if (operationCount >= MAX_BATCH_SIZE) {
          await batch.commit();
          batch = writeBatch(db);
          operationCount = 0;
        }
      }
      
      if (operationCount > 0) {
        await batch.commit();
      }

      // Delete messages
      for (const chat of chats) {
         const messagesRef = collection(db, 'chats', chat.id, 'messages');
         const snapshot = await getDocs(messagesRef);
         
         let deleteBatch = writeBatch(db);
         let deleteCount = 0;
         
         for (const doc of snapshot.docs) {
             deleteBatch.delete(doc.ref);
             deleteCount++;
             if (deleteCount >= MAX_BATCH_SIZE) {
                 await deleteBatch.commit();
                 deleteBatch = writeBatch(db);
                 deleteCount = 0;
             }
         }
         if (deleteCount > 0) {
             await deleteBatch.commit();
         }
      }

      alert('История всех диалогов очищена.');
      setSelectedChatId(null);
    } catch (error) {
      console.error('Error clearing all history:', error);
      alert('Ошибка при очистке истории.');
    }
  };

  const handleClearHistory = async () => {
    if (!selectedChatId) return;
    if (window.confirm('Вы уверены, что хотите очистить историю сообщений этого чата?')) {
      try {
        const messagesRef = collection(db, 'chats', selectedChatId, 'messages');
        const snapshot = await getDocs(messagesRef);
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        
        await updateDoc(doc(db, 'chats', selectedChatId), {
          lastMessage: '', // Clear last message text
          // lastMessageAt: serverTimestamp() // DO NOT update timestamp to preserve active status? 
          // Actually user said "written messages cleared everywhere... except active today".
          // If I update timestamp, they become active NOW. If I don't, they stay active if they were.
          // But if I clear history, `lastMessage` is gone.
          unreadCount: 0,
          messageCount: 0
        });
      } catch (error) {
        console.error('Error clearing history:', error);
      }
    }
  };

  const handleSaveName = async () => {
    if (!selectedChatId || !newName.trim()) return;
    try {
      await updateDoc(doc(db, 'chats', selectedChatId), {
        customName: newName.trim()
      });
      setIsRenaming(false);
    } catch (error) {
      console.error('Error renaming chat:', error);
    }
  };

  // --- File Upload ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isNote: boolean = false) => {
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
          alert('Ошибка загрузки файла');
        }, 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          if (isNote && editingNote) {
              setEditingNote({ ...editingNote, mediaUrl: downloadURL, mediaType: type });
          } else {
              setMediaUrl(downloadURL);
              setMediaType(type);
          }
          
          setUploading(false);
        }
      );
      
    } catch (error) {
      console.error('Upload failed:', error);
      setUploading(false);
      alert('Ошибка загрузки файла');
    }
  };

  // --- Notes Actions ---

  const handleSaveNote = async () => {
    if (!currentUser || !editingNote?.title) return;
    try {
      const sanitizedKeyboard = sanitizeData(editingNote.keyboard || []);

      const noteData = {
        title: editingNote.title,
        text: editingNote.text || '',
        mediaUrl: editingNote.mediaUrl || '',
        mediaType: editingNote.mediaType || 'photo',
        keyboard: sanitizedKeyboard
      };

      if (editingNote.id === 'new') {
        await addDoc(collection(db, 'users', currentUser.uid, 'notes'), {
          ...noteData,
          createdAt: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, 'users', currentUser.uid, 'notes', editingNote.id), noteData);
      }
      setEditingNote(null);
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!currentUser || !window.confirm('Удалить заметку?')) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'notes', noteId));
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const cancelScheduledMessage = async (id: string) => {
    if (!window.confirm('Вы уверены, что хотите отменить эту рассылку?')) return;
    try {
      await deleteDoc(doc(db, 'scheduled_messages', id));
    } catch (error) {
      console.error('Error canceling scheduled message:', error);
    }
  };

  const handleUseNote = (note: Note) => {
    if (isGlobalNotes) {
        // In global mode, selecting a note prepares it for broadcast
        if (selectedRecipients.length === 0) {
            alert('Выберите хотя бы одного получателя из списка слева.');
            return;
        }
        setNoteToSchedule(note);
        setShowScheduler(true);
    } else {
        // In local mode, populates the input
        setNewMessage(note.text);
        if (note.mediaUrl) {
          setMediaUrl(note.mediaUrl);
          setMediaType(note.mediaType || 'photo');
          setShowAttach(true);
        }
        if (note.keyboard && note.keyboard.length > 0) {
          setKeyboardRows(note.keyboard);
          setShowKeyboardBuilder(true);
        }
        setShowNotes(false);
    }
  };

  const handleScheduleNote = async () => {
    if (!noteToSchedule || !scheduledTime) return;
    
    const recipients = isGlobalNotes ? selectedRecipients : (selectedChatId ? [selectedChatId] : []);
    if (recipients.length === 0) return;

    // Parse scheduled time (assuming input is local time, convert to UTC/ISO for storage)
    // The input is datetime-local, which gives YYYY-MM-DDTHH:mm
    // We need to interpret this as Moscow time if requested, or local time.
    // The request says "по мск" (Moscow Time).
    
    // Let's assume the user enters Moscow time in the input.
    // We need to convert that to a timestamp.
    // Moscow is UTC+3.
    const mskTime = DateTime.fromISO(scheduledTime, { zone: 'Europe/Moscow' });
    const scheduledTimestamp = mskTime.toJSDate();

    try {
        const batch = writeBatch(db);
        
        for (const recipientId of recipients) {
            const chat = chats.find(c => c.id === recipientId);
            if (!chat) continue;
            
            const scheduledMsgRef = doc(collection(db, 'scheduled_messages'));
            batch.set(scheduledMsgRef, {
                chatId: chat.chatId,
                platform: chat.platform,
                text: noteToSchedule.text,
                mediaUrl: noteToSchedule.mediaUrl,
                mediaType: noteToSchedule.mediaType,
                keyboard: noteToSchedule.keyboard ? sanitizeData({ inline_keyboard: noteToSchedule.keyboard }) : null,
                scheduledAt: scheduledTimestamp,
                status: 'pending',
                createdAt: serverTimestamp(),
                userId: currentUser?.uid
            });
        }
        
        await batch.commit();
        alert('Сообщение запланировано!');
        setShowScheduler(false);
        setNoteToSchedule(null);
        setScheduledTime('');
        if (isGlobalNotes) {
            setSelectedRecipients([]);
            setShowNotes(false);
        }
    } catch (error) {
        console.error('Error scheduling message:', error);
        alert('Ошибка планирования сообщения');
    }
  };

  const handleSendNoteImmediately = async (note: Note) => {
      const recipients = isGlobalNotes ? selectedRecipients : (selectedChatId ? [selectedChatId] : []);
      if (recipients.length === 0) {
          alert('Выберите получателей');
          return;
      }

      if (!window.confirm(`Отправить заметку "${note.title}" ${recipients.length} получателям сейчас?`)) return;

      try {
          // We'll iterate and send via API directly
          for (const recipientId of recipients) {
              const chat = chats.find(c => c.id === recipientId);
              if (!chat) continue;

              const currentKeyboard = note.keyboard && note.keyboard.length > 0 ? { inline_keyboard: note.keyboard } : null;
              
              const sanitizedKeyboard = sanitizeData(currentKeyboard);

              await axios.post('/api/messages/send', {
                chatId: chat.chatId,
                platform: chat.platform,
                text: note.text,
                userId: currentUser?.uid,
                mediaUrl: note.mediaUrl,
                mediaType: note.mediaType,
                keyboard: currentKeyboard
              });

              // Log to chat history
              await addDoc(collection(db, 'chats', recipientId, 'messages'), {
                text: note.text,
                sender: 'admin',
                timestamp: serverTimestamp(),
                mediaUrl: note.mediaUrl || null,
                mediaType: note.mediaType || null,
                keyboard: sanitizedKeyboard
              });

              await setDoc(doc(db, 'chats', recipientId), {
                lastMessage: note.mediaUrl ? `[${note.mediaType === 'photo' ? 'Фото' : 'Видео'}] ${note.text}` : note.text,
                lastMessageAt: serverTimestamp()
              }, { merge: true });
          }
          alert('Отправлено!');
          if (isGlobalNotes) {
              setSelectedRecipients([]);
              setShowNotes(false);
          }
      } catch (error: any) {
          console.error('Error sending note:', error);
          const errorMessage = error.response?.data?.error || error.message || 'Неизвестная ошибка';
          alert(`Ошибка отправки сообщения: ${errorMessage}`);
      }
  };

  // --- Effects ---

  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam && ['all', 'tg', 'vk', 'max'].includes(filterParam)) {
      setFilter(filterParam as any);
    }
    const chatIdParam = searchParams.get('chatId');
    if (chatIdParam) setSelectedChatId(chatIdParam);
  }, [searchParams]);

  const handleSetFilter = (newFilter: 'all' | 'tg' | 'vk' | 'max') => {
    setFilter(newFilter);
    setSearchParams({ filter: newFilter });
  };

  useEffect(() => {
    const q = query(collection(db, 'chats'), orderBy('lastMessageAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Chat[];
      
      // Play sound if new unread message comes in
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const data = change.doc.data();
          if (data.unreadCount > 0 && data.lastMessageAt?.toMillis() > Date.now() - 5000) {
             playNotificationSound();
          }
        }
      });

      setChats(chatsData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedChatId) return;
    const q = query(collection(db, 'chats', selectedChatId, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...deserializeFromFirestore(doc.data())
      })) as Message[];
      setMessages(msgs);
      updateDoc(doc(db, 'chats', selectedChatId), { unreadCount: 0 });
    });
    return () => unsubscribe();
  }, [selectedChatId]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'users', currentUser.uid, 'notes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...deserializeFromFirestore(doc.data())
      })) as Note[];
      setNotes(notesData);
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'scheduled_messages'), where('status', '==', 'pending'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const scheduledData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setScheduledMessages(scheduledData.sort((a, b) => b.scheduledAt?.toMillis() - a.scheduledAt?.toMillis()));
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Voice Message Deletion ---
  useEffect(() => {
    if (!selectedChatId) return;
    const now = Date.now();
    const timeouts: NodeJS.Timeout[] = [];

    messages.forEach(msg => {
      if (msg.mediaType === 'voice' && msg.playedAt) {
        const playedTime = msg.playedAt.toMillis ? msg.playedAt.toMillis() : msg.playedAt;
        const timeElapsed = now - playedTime;
        const duration = msg.voiceDuration || 0;
        const deleteDelay = duration > 120 ? 180000 : 60000; // > 2 mins -> 3 mins, else 1 min

        if (timeElapsed >= deleteDelay) {
          deleteDoc(doc(db, 'chats', selectedChatId, 'messages', msg.id)).catch(console.error);
        } else {
          const timeout = setTimeout(() => {
            deleteDoc(doc(db, 'chats', selectedChatId, 'messages', msg.id)).catch(console.error);
          }, deleteDelay - timeElapsed);
          timeouts.push(timeout);
        }
      }
    });

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [messages, selectedChatId]);

  const handleVoicePlay = async (msgId: string, playedAt: any, duration: number) => {
    if (!playedAt && selectedChatId) {
      try {
        await updateDoc(doc(db, 'chats', selectedChatId, 'messages', msgId), {
          playedAt: serverTimestamp(),
          voiceDuration: duration
        });
      } catch (e) {
        console.error('Error updating playedAt:', e);
      }
    }
  };

  // --- Sending ---

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !mediaUrl) || !selectedChatId) return;

    const chat = chats.find(c => c.id === selectedChatId);
    if (!chat) return;

    const messageText = newMessage;
    const currentMediaUrl = mediaUrl;
    const currentMediaType = mediaType;
    const currentKeyboard = keyboardRows.length > 0 ? { inline_keyboard: keyboardRows } : null;

    const sanitizedKeyboard = sanitizeData(currentKeyboard);

    setNewMessage('');
    setMediaUrl('');
    setShowAttach(false);
    setKeyboardRows([]);
    setShowKeyboardBuilder(false);

    try {
      await axios.post('/api/messages/send', {
        chatId: chat.chatId,
        platform: chat.platform,
        text: messageText,
        userId: currentUser?.uid,
        mediaUrl: currentMediaUrl,
        mediaType: currentMediaType,
        keyboard: currentKeyboard
      });

      await addDoc(collection(db, 'chats', selectedChatId, 'messages'), {
        text: messageText,
        sender: 'admin',
        timestamp: serverTimestamp(),
        mediaUrl: currentMediaUrl || null,
        mediaType: currentMediaType || null,
        keyboard: sanitizedKeyboard
      });

      await setDoc(doc(db, 'chats', selectedChatId), {
        lastMessage: currentMediaUrl ? `[${currentMediaType === 'photo' ? 'Фото' : 'Видео'}] ${messageText}` : messageText,
        lastMessageAt: serverTimestamp()
      }, { merge: true });
    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Неизвестная ошибка';
      alert(`Ошибка отправки сообщения: ${errorMessage}`);
    }
  };

  // --- Helpers ---

  const filteredChats = chats.filter(chat => {
    const matchesFilter = filter === 'all' || chat.platform === filter;
    const name = chat.customName || chat.displayName || chat.username || '';
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = tagFilter === '' || (chat.tags && chat.tags.includes(tagFilter));
    return matchesFilter && matchesSearch && matchesTag;
  });

  const allTags = Array.from(new Set(chats.flatMap(c => c.tags || []))).filter(Boolean);

  const selectedChat = chats.find(c => c.id === selectedChatId);

  const getProfileLink = (chat: Chat) => {
    if (chat.platform === 'tg') {
      if (chat.username && chat.username.startsWith('@')) {
        return `https://t.me/${chat.username.substring(1)}`;
      }
      return `tg://user?id=${chat.chatId}`;
    }
    if (chat.platform === 'vk') {
      return `https://vk.com/id${chat.chatId}`;
    }
    return '#';
  };

  // --- Render ---

  return (
    <div className="h-[calc(100vh-2rem)] flex bg-[#0f0f0f] rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative">
      
      {/* Sidebar */}
      <div className="w-80 border-r border-white/5 flex flex-col bg-[#111]">
        <div className="p-4 space-y-4">
          <div className="flex gap-2">
            <div className="relative group flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 group-focus-within:text-purple-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Поиск чатов..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1a1a1a] rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all placeholder:text-gray-600 text-gray-200"
              />
            </div>
            
            {allTags.length > 0 && (
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="bg-[#1a1a1a] border border-white/5 rounded-xl px-2 py-2.5 text-sm text-gray-300 outline-none focus:ring-1 focus:ring-purple-500/50 max-w-[100px]"
                title="Фильтр по тегам"
              >
                <option value="">Все теги</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            )}

            <button 
              onClick={() => { setShowNotes(true); setIsGlobalNotes(true); }}
              className="p-2.5 bg-[#1a1a1a] rounded-xl text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 transition-all"
              title="Заметки и рассылка"
            >
              <StickyNote size={18} />
            </button>
            <button 
              onClick={handleClearAllHistory}
              className="p-2.5 bg-[#1a1a1a] rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Очистить историю ВСЕХ диалогов"
            >
              <MessageCircle size={18} className="text-red-400" />
            </button>
            <button 
              onClick={() => setBulkDeleteModalOpen(true)}
              className="p-2.5 bg-[#1a1a1a] rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Удалить все диалоги (полностью)"
            >
              <Trash2 size={18} />
            </button>
          </div>

          <div className="flex gap-1 p-1 bg-[#1a1a1a] rounded-xl">
            {['all', 'tg', 'vk', 'max'].map((f) => (
              <button 
                key={f}
                onClick={() => handleSetFilter(f as any)}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                  filter === f 
                    ? 'bg-[#2a2a2a] text-white shadow-sm' 
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2 space-y-1">
          {filteredChats.map(chat => (
            <div 
              key={chat.id}
              onClick={() => setSelectedChatId(chat.id)}
              className={`p-3 rounded-xl cursor-pointer transition-all group relative ${
                selectedChatId === chat.id ? 'bg-[#1f1f1f]' : 'hover:bg-[#1a1a1a]'
              }`}
            >
              <div className="flex gap-3">
                <div className="relative shrink-0">
                  {chat.avatar ? (
                    <img src={chat.avatar} alt={chat.username} className="w-12 h-12 rounded-full object-cover bg-[#2a2a2a]" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center text-gray-400 font-bold text-lg">
                      {(chat.customName || chat.displayName || chat.username || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 bg-[#111] rounded-full p-0.5">
                     {chat.platform === 'tg' && <div className="bg-cyan-500/20 text-cyan-400 p-0.5 rounded-full"><Send size={10} /></div>}
                     {chat.platform === 'vk' && <div className="bg-blue-500/20 text-blue-400 p-0.5 rounded-full text-[8px] font-bold px-1">VK</div>}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-gray-200 truncate pr-2 text-sm">
                      {chat.customName || chat.displayName || chat.username}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => handleDeleteChat(e, chat.id)}
                        className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                      <span className="text-[10px] text-gray-600 whitespace-nowrap">
                        {chat.lastMessageAt?.toDate ? format(chat.lastMessageAt.toDate(), 'HH:mm') : ''}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5 pr-6">
                    {chat.lastMessage || 'Нет сообщений'}
                  </p>
                  {chat.tags && chat.tags.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {chat.tags.map(tag => {
                        const color = chat.tagColors?.[tag] || '#a855f7'; // default purple
                        return (
                          <span 
                            key={tag} 
                            className="text-[9px] px-1.5 py-0.5 rounded text-white font-medium"
                            style={{ backgroundColor: color }}
                          >
                            #{tag}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {chat.unreadCount > 0 && (
                <div className="absolute right-3 bottom-3 bg-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-lg shadow-purple-900/20">
                  {chat.unreadCount}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col bg-[#0f0f0f] relative">
          {/* Header */}
          <div className="h-16 border-b border-white/5 flex justify-between items-center px-6 bg-[#111]/50 backdrop-blur-sm">
            <div 
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setProfileModalOpen(true)}
            >
              {selectedChat.avatar ? (
                <img src={selectedChat.avatar} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-900/50 to-blue-900/50 flex items-center justify-center text-white font-bold">
                  {(selectedChat.customName || selectedChat.displayName || selectedChat.username)[0].toUpperCase()}
                </div>
              )}
              <div>
                <div className="font-bold text-gray-100 text-sm flex items-center gap-2">
                  {selectedChat.customName || selectedChat.displayName || selectedChat.username}
                  {selectedChat.customName && <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 rounded">Renamed</span>}
                  {selectedChat.tags && selectedChat.tags.map(tag => {
                    const color = selectedChat.tagColors?.[tag] || '#a855f7';
                    return (
                      <span 
                        key={tag} 
                        className="text-[10px] px-1.5 py-0.5 rounded text-white font-medium"
                        style={{ backgroundColor: color }}
                      >
                        #{tag}
                      </span>
                    );
                  })}
                </div>
                <div className="text-xs text-green-500/80 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  Онлайн
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={handleClearHistory}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                title="Очистить историю"
              >
                <Trash2 size={18} />
              </button>
              <button 
                onClick={() => setProfileModalOpen(true)}
                className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-all"
              >
                <User size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] group relative ${msg.sender === 'admin' ? 'items-end' : 'items-start'} flex flex-col`}>
                  
                  {msg.mediaUrl && (
                    <div className="mb-2 rounded-xl overflow-hidden border border-white/10 max-w-sm">
                      {msg.mediaType === 'video' ? (
                        <div className="bg-[#2a2a2a] p-3 flex items-center gap-2 text-gray-400 text-sm">
                          <Video size={16} />
                          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="hover:text-white transition-colors truncate max-w-[200px]">
                            (Видео) {msg.mediaUrl}
                          </a>
                        </div>
                      ) : msg.mediaType === 'voice' ? (
                        <div className="bg-[#2a2a2a] p-3 flex flex-col gap-2 text-gray-400 text-sm">
                          <div className="flex items-center gap-2">
                            <Mic size={16} />
                            <span>(Голосовое сообщение)</span>
                          </div>
                          <audio 
                            src={msg.mediaUrl} 
                            controls 
                            className="h-8 w-full max-w-[200px]" 
                            onPlay={(e) => handleVoicePlay(msg.id, msg.playedAt, (e.target as HTMLAudioElement).duration)}
                          />
                          <div className="text-[10px] text-red-400">
                            {msg.playedAt 
                              ? (msg.voiceDuration && msg.voiceDuration > 120 ? 'Удалится через 3 мин после прослушивания' : 'Удалится через 1 мин после прослушивания') 
                              : 'Удалится после прослушивания'}
                          </div>
                        </div>
                      ) : msg.mediaType === 'animation' ? (
                        <div className="bg-[#2a2a2a] p-3 flex items-center gap-2 text-gray-400 text-sm">
                          <PlayCircle size={16} />
                          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="hover:text-white transition-colors truncate max-w-[200px]">
                            (GIF) {msg.mediaUrl}
                          </a>
                        </div>
                      ) : msg.sender === 'admin' ? (
                        <div className="bg-[#2a2a2a] p-3 text-gray-400 text-sm">
                          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
                            (фото)
                          </a>
                        </div>
                      ) : (
                        <img src={msg.mediaUrl} alt="[Фото]" className="w-full h-auto max-h-64 object-contain" />
                      )}
                    </div>
                  )}

                  {msg.text && (
                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      msg.sender === 'admin' 
                        ? 'bg-purple-600 text-white rounded-tr-sm' 
                        : 'bg-[#222] text-gray-200 rounded-tl-sm border border-white/5'
                    }`}>
                      {msg.text}
                    </div>
                  )}

                  {msg.keyboard && (
                    <div className="mt-2 flex flex-col gap-1 opacity-70 scale-90 origin-top-right">
                       {msg.keyboard.inline_keyboard?.map((row: any[], i: number) => (
                         <div key={i} className="flex gap-1">
                           {row.map((btn, j) => (
                             <div key={j} className="bg-[#333] text-xs px-2 py-1 rounded text-gray-400 border border-white/10">
                               {btn.text}
                             </div>
                           ))}
                         </div>
                       ))}
                    </div>
                  )}

                  <div className={`text-[10px] mt-1 flex items-center gap-1 ${msg.sender === 'admin' ? 'text-purple-300/50' : 'text-gray-600'}`}>
                    {msg.timestamp?.toDate ? format(msg.timestamp.toDate(), 'HH:mm') : ''}
                    {msg.sender === 'admin' && <CheckCheck size={12} />}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-[#111] border-t border-white/5 relative z-10">
            
            {/* Attachments Panel */}
            <AnimatePresence>
              {showAttach && (
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  className="absolute bottom-full left-4 right-4 mb-2 bg-[#1a1a1a] rounded-xl p-3 border border-white/10 shadow-xl"
                >
                  <div className="flex gap-2 mb-2">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex-1 py-2 text-xs rounded-lg flex items-center justify-center gap-2 transition-colors font-medium bg-[#2a2a2a] text-gray-300 hover:bg-[#333] border border-dashed border-white/10`}
                    >
                      <Upload size={14} /> Загрузить с устройства
                    </button>
                    <input 
                       type="file" 
                       ref={fileInputRef} 
                       className="hidden" 
                       accept="image/*,video/*"
                       onChange={(e) => handleFileUpload(e, false)}
                    />
                  </div>
                  
                  <div className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      placeholder="Или вставьте ссылку на фото/видео (https://...)" 
                      value={mediaUrl}
                      onChange={(e) => {
                        setMediaUrl(e.target.value);
                        if (e.target.value.match(/\.(mp4|mov|avi|webm)$/i) || e.target.value.includes('video') || e.target.value.includes('t.me/c/')) {
                          setMediaType('video');
                        } else {
                          setMediaType('photo');
                        }
                      }}
                      className="flex-1 bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500"
                    />
                    <select
                      value={mediaType}
                      onChange={(e) => setMediaType(e.target.value as 'photo' | 'video')}
                      className="bg-[#111] border border-white/10 rounded-lg px-2 py-2 text-xs text-gray-300 outline-none focus:border-purple-500"
                    >
                      <option value="photo">Фото</option>
                      <option value="video">Видео</option>
                    </select>
                  </div>
                  
                  {uploading && (
                    <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Загрузка...</span>
                            <span>{uploadProgress}%</span>
                        </div>
                        <div className="h-1 bg-[#333] rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-purple-600 transition-all duration-200"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Keyboard Builder Panel */}
            <AnimatePresence>
              {showKeyboardBuilder && (
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  className="absolute bottom-full left-4 right-4 mb-2 bg-[#1a1a1a] rounded-xl p-4 border border-white/10 shadow-xl flex flex-col gap-3"
                >
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <span className="text-sm font-bold text-gray-200">Конструктор кнопок</span>
                    <button onClick={() => setShowKeyboardBuilder(false)} className="text-gray-500 hover:text-white"><X size={16} /></button>
                  </div>
                  
                  {/* Button Form */}
                  <div className="grid grid-cols-2 gap-2">
                      <input 
                        placeholder="Текст кнопки" 
                        value={btnLabel}
                        onChange={e => setBtnLabel(e.target.value)}
                        className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-purple-500 outline-none"
                      />
                      <input 
                        placeholder="Ссылка (URL)" 
                        value={btnUrl}
                        onChange={e => setBtnUrl(e.target.value)}
                        className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-purple-500 outline-none"
                      />
                      <select 
                        value={btnColor}
                        onChange={e => setBtnColor(e.target.value as any)}
                        className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-purple-500 outline-none col-span-2"
                      >
                          <option value="primary">Primary (Синий)</option>
                          <option value="secondary">Secondary (Белый)</option>
                          <option value="positive">Positive (Зеленый)</option>
                          <option value="negative">Negative (Красный)</option>
                      </select>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar border border-white/5 rounded-lg p-2 bg-[#111]">
                    {keyboardRows.length === 0 && (
                        <div className="text-center text-xs text-gray-500 py-4">Нет кнопок. Добавьте ряд.</div>
                    )}
                    {keyboardRows.map((row, rIndex) => (
                      <div key={rIndex} className="flex gap-2 items-center bg-[#1a1a1a] p-2 rounded-lg border border-white/5">
                        <div className="flex-1 flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                          {row.map((btn, bIndex) => (
                            <div 
                                key={bIndex} 
                                className={`text-xs px-3 py-1.5 rounded-lg border border-white/5 flex items-center gap-2 whitespace-nowrap ${
                                    btn.color === 'positive' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                                    btn.color === 'negative' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                                    btn.color === 'secondary' ? 'bg-white/10 text-white border-white/20' :
                                    'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                }`}
                            >
                              {btn.text}
                              <button 
                                onClick={() => {
                                  const newRows = [...keyboardRows];
                                  newRows[rIndex] = newRows[rIndex].filter((_, i) => i !== bIndex);
                                  if (newRows[rIndex].length === 0) newRows.splice(rIndex, 1);
                                  setKeyboardRows(newRows);
                                }}
                                className="hover:text-white opacity-60 hover:opacity-100"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button 
                          onClick={() => {
                            if (!btnLabel) {
                                alert('Введите текст кнопки');
                                return;
                            }
                            const newRows = [...keyboardRows];
                            newRows[rIndex].push({ text: btnLabel, url: btnUrl || undefined, color: btnColor });
                            setKeyboardRows(newRows);
                            setBtnLabel('');
                            setBtnUrl('');
                          }}
                          className="bg-purple-600 text-white p-1.5 rounded-lg hover:bg-purple-500 transition-colors shadow-lg shadow-purple-900/20"
                          title="Добавить в этот ряд"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  <button 
                      onClick={() => setKeyboardRows([...keyboardRows, []])}
                      className="w-full py-2 border border-dashed border-white/10 rounded-lg text-xs text-gray-500 hover:text-purple-400 hover:border-purple-500/30 hover:bg-purple-500/5 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={12} /> Добавить новый ряд
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main Input Bar */}
            <form onSubmit={handleSendMessage} className="flex items-end gap-2">
              <div className="flex gap-1 bg-[#1a1a1a] p-1 rounded-xl border border-white/5">
                <button 
                  type="button" 
                  onClick={() => { setShowAttach(!showAttach); setShowKeyboardBuilder(false); setShowNotes(false); }}
                  className={`p-2.5 rounded-lg transition-all ${showAttach ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]'}`}
                  title="Прикрепить медиа"
                >
                  <Paperclip size={18} />
                </button>
                <button 
                  type="button" 
                  onClick={() => { setShowKeyboardBuilder(!showKeyboardBuilder); setShowAttach(false); setShowNotes(false); }}
                  className={`p-2.5 rounded-lg transition-all ${showKeyboardBuilder ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]'}`}
                  title="Кнопки"
                >
                  <MoreHorizontal size={18} />
                </button>
                <button 
                  type="button" 
                  onClick={() => { setShowNotes(!showNotes); setShowAttach(false); setShowKeyboardBuilder(false); setIsGlobalNotes(false); }}
                  className={`p-2.5 rounded-lg transition-all ${showNotes ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]'}`}
                  title="Заметки"
                >
                  <StickyNote size={18} />
                </button>
              </div>
              
              <div className="flex-1 bg-[#1a1a1a] rounded-xl border border-white/5 focus-within:border-purple-500/50 transition-colors flex items-center min-h-[46px]">
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Напишите сообщение..." 
                  className="w-full bg-transparent border-none px-4 py-3 text-sm text-white focus:ring-0 placeholder:text-gray-600"
                />
                <button type="button" className="p-2 text-gray-500 hover:text-white mr-1">
                  <Smile size={20} />
                </button>
              </div>

              <button 
                type="submit" 
                disabled={!newMessage.trim() && !mediaUrl}
                className="p-3 bg-purple-600 rounded-xl hover:bg-purple-500 transition-colors text-white shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed h-[46px] w-[46px] flex items-center justify-center"
              >
                <Send size={20} />
              </button>
            </form>
          </div>

          {/* Notes Panel (Slide Over) */}
          <AnimatePresence>
            {showNotes && (
              <motion.div 
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                className={`absolute top-0 right-0 bottom-0 bg-[#111] border-l border-white/10 z-30 flex flex-col shadow-2xl ${isGlobalNotes ? 'w-[600px]' : 'w-80'}`}
              >
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#1a1a1a]">
                  <div className="flex items-center gap-4">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <StickyNote size={16} /> 
                        {isGlobalNotes ? 'Заметки и рассылка' : 'Заметки'}
                    </h3>
                    {isGlobalNotes && (
                      <div className="flex bg-[#222] rounded-lg p-1">
                        <button
                          onClick={() => setNotesTab('notes')}
                          className={`px-3 py-1 text-xs rounded-md transition-colors ${notesTab === 'notes' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                          Заметки
                        </button>
                        <button
                          onClick={() => setNotesTab('scheduled')}
                          className={`px-3 py-1 text-xs rounded-md transition-colors ${notesTab === 'scheduled' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                          Запланированные ({scheduledMessages.length})
                        </button>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setShowNotes(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* If Global, show chat list on the left */}
                    {isGlobalNotes && (
                        <div className="w-64 border-r border-white/5 overflow-y-auto custom-scrollbar p-2 space-y-1">
                            <div className="text-xs font-bold text-gray-500 mb-2 px-2 uppercase">Получатели</div>
                            {filteredChats.map(chat => (
                                <div 
                                    key={chat.id}
                                    onClick={() => {
                                        if (selectedRecipients.includes(chat.id)) {
                                            setSelectedRecipients(selectedRecipients.filter(id => id !== chat.id));
                                        } else {
                                            setSelectedRecipients([...selectedRecipients, chat.id]);
                                        }
                                    }}
                                    className={`p-2 rounded-lg cursor-pointer flex items-center gap-2 text-sm ${selectedRecipients.includes(chat.id) ? 'bg-purple-600/20 text-purple-300' : 'hover:bg-[#1a1a1a] text-gray-300'}`}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedRecipients.includes(chat.id) ? 'bg-purple-600 border-purple-600' : 'border-gray-600'}`}>
                                        {selectedRecipients.includes(chat.id) && <Check size={10} className="text-white" />}
                                    </div>
                                    <span className="truncate">{chat.customName || chat.displayName || chat.username}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {notesTab === 'scheduled' ? (
                      <div className="space-y-3">
                        {scheduledMessages.length === 0 ? (
                          <div className="text-center text-gray-500 py-8">Нет запланированных рассылок</div>
                        ) : (
                          scheduledMessages.map(msg => {
                            const chat = chats.find(c => c.chatId === msg.chatId && c.platform === msg.platform);
                            return (
                              <div key={msg.id} className="bg-[#222] border border-blue-500/20 rounded-xl p-4">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="font-medium text-white">
                                    {chat ? (chat.customName || chat.displayName || chat.username) : `ID: ${msg.chatId}`}
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
                    ) : editingNote ? (
                        <div className="space-y-3">
                        <input 
                            className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                            placeholder="Название заметки"
                            value={editingNote.title}
                            onChange={e => setEditingNote({...editingNote, title: e.target.value})}
                        />
                        <textarea 
                            className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none h-32 resize-none"
                            placeholder="Текст сообщения..."
                            value={editingNote.text}
                            onChange={e => setEditingNote({...editingNote, text: e.target.value})}
                        />
                        
                        {/* Note Media Upload */}
                        <div className="flex gap-2 items-center">
                            <button 
                                onClick={() => noteFileInputRef.current?.click()}
                                className="flex-1 py-2 text-xs rounded-lg flex items-center justify-center gap-2 bg-[#2a2a2a] text-gray-300 hover:bg-[#333] border border-dashed border-white/10"
                            >
                                <Upload size={14} /> {editingNote.mediaUrl ? 'Изменить медиа' : 'Загрузить медиа'}
                            </button>
                            <input 
                                type="file" 
                                ref={noteFileInputRef} 
                                className="hidden" 
                                accept="image/*,video/*"
                                onChange={(e) => handleFileUpload(e, true)}
                            />
                        </div>
                        {editingNote.mediaUrl && (
                            <div className="text-xs text-green-500 flex items-center gap-1">
                                <Check size={12} /> Медиа загружено ({editingNote.mediaType})
                            </div>
                        )}

                        {/* Note Keyboard Builder */}
                        <div className="border border-white/5 rounded-lg p-3 bg-[#1a1a1a] space-y-2">
                            <div className="text-xs font-bold text-gray-400">Кнопки</div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <input 
                                    placeholder="Текст" 
                                    value={btnLabel}
                                    onChange={e => setBtnLabel(e.target.value)}
                                    className="bg-[#111] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
                                />
                                <input 
                                    placeholder="URL" 
                                    value={btnUrl}
                                    onChange={e => setBtnUrl(e.target.value)}
                                    className="bg-[#111] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
                                />
                                <select 
                                    value={btnColor}
                                    onChange={e => setBtnColor(e.target.value as any)}
                                    className="bg-[#111] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none col-span-2"
                                >
                                    <option value="primary">Primary (Синий)</option>
                                    <option value="secondary">Secondary (Белый)</option>
                                    <option value="positive">Positive (Зеленый)</option>
                                    <option value="negative">Negative (Красный)</option>
                                </select>
                            </div>

                            <button 
                                onClick={() => {
                                    if (!btnLabel) return;
                                    const currentKeyboard = editingNote.keyboard || [];
                                    if (currentKeyboard.length === 0) currentKeyboard.push([]);
                                    const lastRowIndex = currentKeyboard.length - 1;
                                    currentKeyboard[lastRowIndex].push({ text: btnLabel, url: btnUrl || undefined, color: btnColor });
                                    setEditingNote({ ...editingNote, keyboard: currentKeyboard });
                                    setBtnLabel('');
                                    setBtnUrl('');
                                }}
                                className="w-full bg-[#333] hover:bg-[#444] text-gray-300 text-xs py-1.5 rounded transition-colors"
                            >
                                + Добавить кнопку
                            </button>
                            
                            <div className="flex flex-col gap-1 mt-2">
                                {editingNote.keyboard?.map((row, rIndex) => (
                                    <div key={rIndex} className="flex gap-1 overflow-x-auto custom-scrollbar pb-1">
                                        {row.map((btn, bIndex) => (
                                            <div key={bIndex} className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 whitespace-nowrap ${
                                                btn.color === 'positive' ? 'bg-green-900/30 border-green-500/30 text-green-400' :
                                                btn.color === 'negative' ? 'bg-red-900/30 border-red-500/30 text-red-400' :
                                                btn.color === 'secondary' ? 'bg-white/10 border-white/20 text-gray-300' :
                                                'bg-blue-900/30 border-blue-500/30 text-blue-400'
                                            }`}>
                                                {btn.text}
                                                <button onClick={() => {
                                                    const newKeyboard = [...(editingNote.keyboard || [])];
                                                    newKeyboard[rIndex] = newKeyboard[rIndex].filter((_, i) => i !== bIndex);
                                                    if (newKeyboard[rIndex].length === 0) newKeyboard.splice(rIndex, 1);
                                                    setEditingNote({ ...editingNote, keyboard: newKeyboard });
                                                }} className="hover:text-white"><X size={8} /></button>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                                <button 
                                    onClick={() => {
                                        const currentKeyboard = editingNote.keyboard || [];
                                        currentKeyboard.push([]);
                                        setEditingNote({ ...editingNote, keyboard: currentKeyboard });
                                    }}
                                    className="text-[10px] text-gray-500 hover:text-purple-400 text-left"
                                >
                                    + Новый ряд
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button onClick={handleSaveNote} className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-purple-500">Сохранить</button>
                            <button onClick={() => setEditingNote(null)} className="px-3 bg-[#2a2a2a] text-gray-400 rounded-lg text-xs hover:text-white">Отмена</button>
                        </div>
                        </div>
                    ) : (
                        <>
                        <button 
                            onClick={() => setEditingNote({ id: 'new', title: '', text: '' })}
                            className="w-full py-3 border border-dashed border-white/10 rounded-xl text-sm text-gray-500 hover:text-purple-400 hover:border-purple-500/30 hover:bg-purple-500/5 transition-all flex items-center justify-center gap-2"
                        >
                            <Plus size={16} /> Создать заметку
                        </button>
                        
                        {notes.map(note => (
                            <div key={note.id} className="bg-[#1a1a1a] p-3 rounded-xl border border-white/5 group hover:border-purple-500/30 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold text-gray-200 text-sm">{note.title}</h4>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditingNote(note)} className="p-1 text-gray-500 hover:text-white"><Edit2 size={12} /></button>
                                <button onClick={() => handleDeleteNote(note.id)} className="p-1 text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 line-clamp-2 mb-3">{note.text}</p>
                            
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleUseNote(note)}
                                    className="flex-1 py-1.5 bg-[#222] hover:bg-purple-600 hover:text-white text-gray-400 text-xs rounded-lg transition-colors flex items-center justify-center gap-1"
                                >
                                    {isGlobalNotes ? 'Выбрать' : 'Использовать'} <Send size={10} />
                                </button>
                                {isGlobalNotes && (
                                    <button 
                                        onClick={() => handleSendNoteImmediately(note)}
                                        className="px-3 py-1.5 bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white text-xs rounded-lg transition-colors"
                                        title="Отправить сейчас выбранным"
                                    >
                                        <Send size={10} />
                                    </button>
                                )}
                            </div>
                            </div>
                        ))}
                        </>
                    )}
                    </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scheduler Modal */}
          <AnimatePresence>
            {showScheduler && (
                <>
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
                    >
                        <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-white/10 w-80 shadow-2xl">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Clock size={20} className="text-purple-500" /> 
                                Запланировать
                            </h3>
                            <p className="text-xs text-gray-400 mb-4">
                                Выберите дату и время отправки (по МСК).
                                <br />
                                Получателей: {isGlobalNotes ? selectedRecipients.length : 1}
                            </p>
                            
                            <input 
                                type="datetime-local" 
                                className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-white mb-2 text-sm"
                                value={scheduledTime}
                                onChange={(e) => setScheduledTime(e.target.value)}
                            />
                            {scheduledTime && (
                                <div className="text-xs text-purple-400 mb-4 bg-purple-500/10 p-2 rounded border border-purple-500/20">
                                    Будет отправлено: <strong>{DateTime.fromISO(scheduledTime, { zone: 'Europe/Moscow' }).toFormat('dd.MM.yyyy HH:mm')} (МСК)</strong>
                                </div>
                            )}

                            <div className="flex gap-2 mt-2">
                                <button 
                                    onClick={handleScheduleNote}
                                    className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm font-bold"
                                >
                                    Подтвердить
                                </button>
                                <button 
                                    onClick={() => { setShowScheduler(false); setNoteToSchedule(null); }}
                                    className="flex-1 bg-[#333] hover:bg-[#444] text-gray-300 py-2 rounded-lg text-sm"
                                >
                                    Отмена
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
          </AnimatePresence>

          {/* Profile Modal */}
          <AnimatePresence>
            {profileModalOpen && (
              <>
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => setProfileModalOpen(false)}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40"
                />
                <motion.div 
                  initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                  className="absolute right-0 top-0 bottom-0 w-80 bg-[#111] border-l border-white/10 z-50 p-6 flex flex-col shadow-2xl"
                >
                  <div className="flex justify-between items-center mb-8">
                    <h2 className="text-lg font-bold text-white">Профиль</h2>
                    <button onClick={() => setProfileModalOpen(false)} className="text-gray-500 hover:text-white">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex flex-col items-center mb-8">
                    <div className="w-24 h-24 rounded-full bg-[#1a1a1a] mb-4 overflow-hidden border-2 border-purple-500/20">
                      {selectedChat.avatar ? (
                        <img src={selectedChat.avatar} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-500">
                          {(selectedChat.customName || selectedChat.displayName || selectedChat.username)[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    
                    {isRenaming ? (
                      <div className="flex gap-2 w-full mb-1">
                        <input 
                          autoFocus
                          value={newName}
                          onChange={e => setNewName(e.target.value)}
                          className="flex-1 bg-[#1a1a1a] border border-purple-500 rounded px-2 py-1 text-center text-white text-sm outline-none"
                        />
                        <button onClick={handleSaveName} className="p-1 bg-purple-600 rounded text-white"><Check size={16} /></button>
                        <button onClick={() => setIsRenaming(false)} className="p-1 bg-[#222] rounded text-gray-400"><X size={16} /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group relative">
                        <h3 className="text-xl font-bold text-white text-center">
                          {selectedChat.customName || selectedChat.displayName || selectedChat.username}
                        </h3>
                        <button 
                          onClick={() => { setNewName(selectedChat.customName || selectedChat.displayName || selectedChat.username); setIsRenaming(true); }}
                          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-opacity absolute -right-6"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    )}
                    
                    <p className="text-sm text-gray-500 mt-1">{selectedChat.platform === 'tg' ? 'Telegram' : 'ВКонтакте'}</p>
                  </div>

                  <div className="space-y-3">
                    <a 
                      href={getProfileLink(selectedChat)} 
                      target="_blank" 
                      rel="noreferrer"
                      className="w-full py-3 bg-[#1a1a1a] hover:bg-[#222] text-white rounded-xl flex items-center justify-center gap-2 transition-colors border border-white/5"
                    >
                      <ExternalLink size={16} />
                      Открыть профиль
                    </a>
                    
                    <a 
                      href={getProfileLink(selectedChat)} 
                      target="_blank" 
                      rel="noreferrer"
                      className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-purple-900/20"
                    >
                      <Send size={16} />
                      Написать в ЛС
                    </a>
                  </div>

                  <div className="mt-6 pt-6 border-t border-white/5">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-medium text-gray-400">Теги пользователя</h4>
                      {selectedChat.tags && selectedChat.tags.length > 0 && (
                        <button 
                          onClick={async () => {
                            if (window.confirm('Удалить все теги у этого пользователя?')) {
                              try {
                                const chatRef = doc(db, 'chats', selectedChat.id);
                                await updateDoc(chatRef, { tags: [] });
                              } catch (e) {
                                console.error('Error removing all tags:', e);
                              }
                            }
                          }}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Удалить все
                        </button>
                      )}
                    </div>
                    
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
                              const chatRef = doc(db, 'chats', selectedChat.id);
                              const currentTags = selectedChat.tags || [];
                              if (!currentTags.includes(tag)) {
                                const newTags = [...currentTags, tag];
                                const currentColors = selectedChat.tagColors || {};
                                await updateDoc(chatRef, { 
                                  tags: newTags,
                                  tagColors: { ...currentColors, [tag]: newTagColor }
                                });
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
                              const chatRef = doc(db, 'chats', selectedChat.id);
                              const currentTags = selectedChat.tags || [];
                              if (!currentTags.includes(tag)) {
                                const newTags = [...currentTags, tag];
                                const currentColors = selectedChat.tagColors || {};
                                await updateDoc(chatRef, { 
                                  tags: newTags,
                                  tagColors: { ...currentColors, [tag]: newTagColor }
                                });
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

                    {selectedChat.tags && selectedChat.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {selectedChat.tags.map(tag => {
                          const color = selectedChat.tagColors?.[tag] || '#a855f7';
                          return (
                            <div 
                              key={tag} 
                              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-white group"
                              style={{ backgroundColor: color }}
                            >
                              <span>#{tag}</span>
                              <button 
                                onClick={async () => {
                                  if (window.confirm(`Удалить тег #${tag}?`)) {
                                    try {
                                      const chatRef = doc(db, 'chats', selectedChat.id);
                                      const newTags = selectedChat.tags!.filter(t => t !== tag);
                                      await updateDoc(chatRef, { tags: newTags });
                                    } catch (e) {
                                      console.error('Error removing tag:', e);
                                    }
                                  }
                                }}
                                className="p-0.5 hover:bg-black/20 rounded opacity-50 hover:opacity-100 transition-all"
                                title="Удалить тег"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-6 border-t border-white/5">
                    <div className="text-xs text-gray-600 font-mono">
                      ID: {selectedChat.chatId}
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-600 bg-[#0f0f0f]">
          <div className="w-20 h-20 rounded-full bg-[#1a1a1a] flex items-center justify-center mb-4 animate-pulse">
            <MessageCircle size={40} className="opacity-20" />
          </div>
          <p className="text-sm">Выберите диалог для начала общения</p>
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
        message="Вы уверены? История будет удалена безвозвратно."
      />

      <ConfirmationModal
        isOpen={bulkDeleteModalOpen}
        onClose={() => setBulkDeleteModalOpen(false)}
        onConfirm={handleBulkDelete}
        title="Очистить все диалоги"
        message="Вы уверены, что хотите удалить ВСЕ диалоги? Это действие необратимо и удалит всю историю переписки со всеми пользователями."
      />
    </div>
  );
}
