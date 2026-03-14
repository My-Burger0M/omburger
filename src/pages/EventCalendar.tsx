import React, { useState, useEffect } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays,
  parseISO
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, X, Bell, Clock, AlignLeft, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, where, serverTimestamp, orderBy, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { DateTime } from 'luxon';

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  date?: string; // Legacy
  startDate: string; // ISO string YYYY-MM-DD
  endDate: string; // ISO string YYYY-MM-DD
  timeMsk: string; // HH:mm
  notifyBot: boolean;
  targetChatId?: string;
  assignees?: string[];
}

interface ChatOption {
  id: string;
  chatId: string;
  platform: 'tg' | 'vk' | 'max';
  displayName: string;
}

export default function EventCalendar() {
  const { currentUser } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timeMsk, setTimeMsk] = useState('12:00');
  const [notifyBot, setNotifyBot] = useState(false);
  const [targetChatId, setTargetChatId] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [newAssignee, setNewAssignee] = useState('');
  
  // Data for dropdown
  const [chatOptions, setChatOptions] = useState<ChatOption[]>([]);

  // Fetch Events
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    let isOffline = false;
    const timeout = setTimeout(() => { isOffline = true; }, 1000);

    const q = query(collection(db, 'users', currentUser.uid, 'events'));
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache && !isOffline && !snapshot.metadata.hasPendingWrites && isInitialLoad) {
        return; // Wait for server sync to avoid flickering deleted events
      }
      clearTimeout(timeout);
      setIsInitialLoad(false);
      const eventsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CalendarEvent[];
      setEvents(eventsData);
    });
    return () => { unsubscribe(); clearTimeout(timeout); };
  }, [currentUser, isInitialLoad]);

  // Fetch Chats for notification
  useEffect(() => {
    const q = query(collection(db, 'chats'), orderBy('lastMessageAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const options = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          chatId: data.chatId,
          platform: data.platform,
          displayName: data.customName || data.displayName || data.username || data.chatId
        };
      }) as ChatOption[];
      setChatOptions(options);
    });
    return () => unsubscribe();
  }, []);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const onDateClick = (day: Date) => {
    setSelectedDate(day);
  };

  const handleAddEvent = async () => {
    if (!startDate || !title.trim() || !currentUser) return;
    
    try {
      const eventData = {
        title,
        description,
        startDate,
        endDate: endDate || startDate,
        timeMsk,
        notifyBot,
        targetChatId: notifyBot ? targetChatId : null,
        assignees,
        updatedAt: serverTimestamp()
      };

      if (editingEventId) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'events', editingEventId), eventData);
      } else {
        await addDoc(collection(db, 'users', currentUser.uid, 'events'), {
          ...eventData,
          createdAt: serverTimestamp()
        });
      }

      // Schedule notification if requested
      if (notifyBot && targetChatId && !editingEventId) {
        const chat = chatOptions.find(c => c.id === targetChatId);
        if (chat) {
          const dateTimeStr = `${startDate}T${timeMsk}`;
          const mskTime = DateTime.fromISO(dateTimeStr, { zone: 'Europe/Moscow' });
          
          if (mskTime.isValid) {
             await addDoc(collection(db, 'scheduled_messages'), {
                chatId: chat.chatId,
                platform: chat.platform,
                text: `📅 Напоминание: ${title}\n\n${description}\nОтветственные: ${assignees.join(', ')}`,
                scheduledAt: mskTime.toJSDate(),
                status: 'pending',
                createdAt: serverTimestamp(),
                userId: currentUser.uid
             });
          }
        }
      }

      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving event:", error);
      alert("Ошибка при сохранении события");
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setTimeMsk('12:00');
    setNotifyBot(false);
    setTargetChatId('');
    setAssignees([]);
    setEditingEventId(null);
  };

  const handleEditEvent = (e: React.MouseEvent, event: CalendarEvent) => {
    e.stopPropagation();
    setTitle(event.title);
    setDescription(event.description || '');
    setStartDate(event.startDate || event.date || '');
    setEndDate(event.endDate || event.startDate || event.date || '');
    setTimeMsk(event.timeMsk || '12:00');
    setNotifyBot(event.notifyBot || false);
    setTargetChatId(event.targetChatId || '');
    setAssignees(event.assignees || []);
    setEditingEventId(event.id);
    setIsModalOpen(true);
  };

  const handleDeleteEvent = async (e: React.MouseEvent, eventId: string) => {
    e.stopPropagation();
    if (!currentUser || !window.confirm('Удалить событие?')) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'events', eventId));
    } catch (error) {
      console.error("Error deleting event:", error);
    }
  };

  const openModalForDate = (date: Date) => {
    resetForm();
    setSelectedDate(date);
    const dateStr = format(date, 'yyyy-MM-dd');
    setStartDate(dateStr);
    setEndDate(dateStr);
    setIsModalOpen(true);
  };

  const renderHeader = () => {
    return (
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Календарь событий</h1>
        <div className="flex items-center gap-4 bg-[#1a1a1a] rounded-xl p-1 border border-white/5">
          <button 
            onClick={prevMonth}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-lg font-medium min-w-[140px] text-center capitalize">
            {format(currentDate, 'LLLL yyyy', { locale: ru })}
          </span>
          <button 
            onClick={nextMonth}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = [];
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });

    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="text-center font-medium text-sm text-gray-500 py-2 capitalize">
          {format(addDays(startDate, i), 'EEEE', { locale: ru })}
        </div>
      );
    }

    return <div className="grid grid-cols-7 mb-2">{days}</div>;
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = '';

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, 'd');
        const cloneDay = day;
        const dateStr = format(cloneDay, 'yyyy-MM-dd');
        const dayEvents = events.filter(e => {
          const start = e.startDate || e.date;
          const end = e.endDate || e.startDate || e.date;
          return dateStr >= start && dateStr <= end;
        });
        const isSelected = selectedDate && isSameDay(day, selectedDate);
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isToday = isSameDay(day, new Date());

        days.push(
          <div
            key={day.toString()}
            onClick={() => onDateClick(cloneDay)}
            className={`
              min-h-[120px] p-2 border border-white/5 transition-all cursor-pointer relative group
              ${!isCurrentMonth ? 'bg-[#121212]/50 text-gray-600' : 'bg-[#1a1a1a] hover:bg-[#222]'}
              ${isSelected ? 'ring-2 ring-purple-500 ring-inset' : ''}
            `}
          >
            <div className="flex justify-between items-start">
              <span className={`
                w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium
                ${isToday ? 'bg-purple-600 text-white' : ''}
                ${!isToday && isSelected ? 'bg-white/10' : ''}
              `}>
                {formattedDate}
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  openModalForDate(cloneDay);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all text-gray-400 hover:text-white"
              >
                <Plus size={16} />
              </button>
            </div>
            
            <div className="mt-2 flex flex-col gap-1">
              {dayEvents.map(event => (
                <div 
                  key={event.id}
                  className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30 truncate relative group/event"
                  title={event.title}
                >
                  <div className="flex justify-between items-center">
                    <span 
                      className="truncate cursor-pointer hover:underline"
                      onClick={(e) => handleEditEvent(e, event)}
                    >
                      {event.timeMsk} {event.title}
                    </span>
                    <button 
                      onClick={(e) => handleDeleteEvent(e, event.id)}
                      className="opacity-0 group-hover/event:opacity-100 text-purple-300 hover:text-red-400 ml-1"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="border border-white/5 rounded-2xl overflow-hidden bg-[#1a1a1a]">{rows}</div>;
  };

  return (
    <div className="p-6 h-full flex flex-col">
      {renderHeader()}
      <div className="flex-1 overflow-hidden flex flex-col">
        {renderDays()}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
          {renderCells()}
        </div>
      </div>

      {/* Add Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">{editingEventId ? 'Редактировать событие' : 'Новое событие'}</h2>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">Начало</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">Конец</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                      className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all [color-scheme:dark]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Название события</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Например: Созвон с командой"
                    className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                    <AlignLeft size={16} /> Описание
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Детали события..."
                    rows={3}
                    className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Ответственные</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {assignees.map((assignee, index) => (
                      <span key={index} className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded-lg text-sm flex items-center gap-1">
                        {assignee}
                        <button onClick={() => setAssignees(assignees.filter((_, i) => i !== index))} className="hover:text-red-400">
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newAssignee}
                      onChange={(e) => setNewAssignee(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newAssignee.trim()) {
                          e.preventDefault();
                          setAssignees([...assignees, newAssignee.trim()]);
                          setNewAssignee('');
                        }
                      }}
                      placeholder="Имя сотрудника..."
                      className="flex-1 bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                    />
                    <button 
                      onClick={() => {
                        if (newAssignee.trim()) {
                          setAssignees([...assignees, newAssignee.trim()]);
                          setNewAssignee('');
                        }
                      }}
                      className="bg-[#222] hover:bg-[#333] px-4 rounded-xl transition-colors text-white"
                    >
                      Добавить
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                      <Clock size={16} /> Время (МСК)
                    </label>
                    <input
                      type="time"
                      value={timeMsk}
                      onChange={(e) => setTimeMsk(e.target.value)}
                      className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all [color-scheme:dark]"
                    />
                  </div>
                </div>

                <div className="p-4 bg-[#121212] border border-white/5 rounded-xl mt-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${notifyBot ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-gray-400'}`}>
                        <Bell size={20} />
                      </div>
                      <div>
                        <div className="font-medium">Уведомление в бота</div>
                        <div className="text-xs text-gray-500">Отправить напоминание</div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={notifyBot}
                        onChange={(e) => setNotifyBot(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                    </label>
                  </div>

                  {notifyBot && (
                    <div className="pt-2 border-t border-white/5">
                      <label className="block text-xs text-gray-400 mb-1.5">Куда отправить?</label>
                      <select
                        value={targetChatId}
                        onChange={(e) => setTargetChatId(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
                      >
                        <option value="">Выберите чат...</option>
                        {chatOptions.map(chat => (
                          <option key={chat.id} value={chat.id}>
                            {chat.platform === 'tg' ? 'Telegram' : chat.platform === 'vk' ? 'VK' : 'MAX'} - {chat.displayName}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-500 mt-1">
                        Выберите чат, куда бот отправит напоминание в указанное время.
                      </p>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleAddEvent}
                  disabled={!title.trim() || !startDate || (notifyBot && !targetChatId)}
                  className="w-full py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-lg shadow-purple-500/25"
                >
                  {editingEventId ? 'Сохранить изменения' : 'Создать событие'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
