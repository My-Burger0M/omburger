import React, { useState, useEffect } from 'react';
import { X, Calendar, Send, AlertTriangle, Clock } from 'lucide-react';
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { format, startOfMonth, endOfMonth, isSameMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DateTime } from 'luxon';

interface SendStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  statsData: any[];
  currentDate: Date;
}

export default function SendStatsModal({ isOpen, onClose, statsData, currentDate }: SendStatsModalProps) {
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>('month'); // 'month' or specific date 'YYYY-MM-DD'
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tokens, setTokens] = useState<{ botToken: string; chatId: string } | null>(null);
  const [scheduledTime, setScheduledTime] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSuccess(false);
      setError(null);
      setScheduledTime('');
      fetchTokens();
    }
  }, [isOpen]);

  const fetchTokens = async () => {
    if (!currentUser) return;
    try {
      const docRef = doc(db, 'users', currentUser.uid, 'settings', 'tokens');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.notificationBotToken && data.notificationChatId) {
          setTokens({
            botToken: data.notificationBotToken,
            chatId: data.notificationChatId
          });
        } else {
          setError('В настройках не указан токен бота уведомлений или ID чата.');
        }
      } else {
        setError('Настройки не найдены. Пожалуйста, укажите токен и ID чата в разделе Настройки.');
      }
    } catch (err) {
      console.error('Error fetching tokens:', err);
      setError('Ошибка при загрузке настроек.');
    }
  };

  const prepareMessage = () => {
    let message = '';
    if (selectedDate === 'month') {
        const monthName = format(currentDate, 'LLLL yyyy', { locale: ru });
        
        let totalTg = 0;
        let totalVk = 0;
        let totalMax = 0;
        
        statsData.forEach(day => {
          totalTg += day.tg;
          totalVk += day.vk;
          totalMax += day.max;
        });
        
        message = `📊 *Статистика за ${monthName}*\n\n`;
        message += `📱 Telegram: ${totalTg} пользователей\n`;
        message += `🌐 ВКонтакте: ${totalVk} пользователей\n`;
        message += `💬 MAX: ${totalMax} пользователей\n\n`;
        message += `Всего за месяц: ${totalTg + totalVk + totalMax} активных пользователей`;
      } else {
        const dayData = statsData.find(d => d.date === selectedDate);
        const formattedDate = format(new Date(selectedDate), 'dd MMMM yyyy', { locale: ru });
        
        if (!dayData) {
          message = `📊 *Статистика за ${formattedDate}*\n\nНет данных за этот день.`;
        } else {
          message = `📊 *Статистика за ${formattedDate}*\n\n`;
          message += `📱 Telegram: ${dayData.tg} пользователей\n`;
          message += `🌐 ВКонтакте: ${dayData.vk} пользователей\n`;
          message += `💬 MAX: ${dayData.max} пользователей\n\n`;
          message += `Всего за день: ${dayData.tg + dayData.vk + dayData.max} активных пользователей`;
        }
      }
      return message;
  };

  const handleSchedule = async () => {
    if (!tokens || !currentUser || !scheduledTime) return;
    setIsSending(true);
    setError(null);

    try {
        const message = prepareMessage();
        
        // Parse scheduled time (input is local time string from datetime-local)
        // Interpret as Moscow Time (UTC+3)
        const mskTime = DateTime.fromISO(scheduledTime, { zone: 'Europe/Moscow' });
        const scheduledTimestamp = mskTime.toJSDate();

        await addDoc(collection(db, 'scheduled_notifications'), {
            userId: currentUser.uid,
            botToken: tokens.botToken,
            chatId: tokens.chatId,
            text: message,
            scheduledAt: scheduledTimestamp,
            status: 'pending',
            createdAt: serverTimestamp()
        });

        setSuccess(true);
        setTimeout(() => {
            onClose();
        }, 2000);
    } catch (err: any) {
        console.error('Error scheduling notification:', err);
        setError('Ошибка при планировании уведомления.');
    } finally {
        setIsSending(false);
    }
  };

  const handleSend = async () => {
    if (!tokens) return;
    
    setIsSending(true);
    setError(null);
    setSuccess(false);

    try {
      const message = prepareMessage();

      await axios.post(`https://api.telegram.org/bot${tokens.botToken}/sendMessage`, {
        chat_id: tokens.chatId,
        text: message,
        parse_mode: 'Markdown'
      });

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.response?.data?.description || 'Ошибка при отправке сообщения в Telegram.');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-400" />
            Отправить статистику
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg flex items-start gap-2 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/50 text-green-400 p-3 rounded-lg text-sm text-center font-medium">
              Статистика успешно отправлена!
            </div>
          )}

          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-300">Выберите период:</label>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedDate('month')}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                  selectedDate === 'month' 
                    ? 'bg-blue-500/20 border-blue-500 text-white' 
                    : 'bg-[#2a2a2a] border-white/10 text-gray-400 hover:bg-[#333]'
                }`}
              >
                <Calendar className="w-6 h-6" />
                <span className="text-sm font-medium">За весь месяц</span>
              </button>
              
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate !== 'month' ? selectedDate : ''}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={format(startOfMonth(currentDate), 'yyyy-MM-dd')}
                  max={format(endOfMonth(currentDate), 'yyyy-MM-dd')}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <button
                  className={`w-full h-full p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                    selectedDate !== 'month' 
                      ? 'bg-purple-500/20 border-purple-500 text-white' 
                      : 'bg-[#2a2a2a] border-white/10 text-gray-400 hover:bg-[#333]'
                  }`}
                >
                  <Calendar className="w-6 h-6" />
                  <span className="text-sm font-medium">
                    {selectedDate !== 'month' ? format(new Date(selectedDate), 'dd.MM.yyyy') : 'Выбрать день'}
                  </span>
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
               <label className="block text-sm font-medium text-gray-300 mb-2">Отложенная отправка (по МСК):</label>
               <input 
                 type="datetime-local"
                 value={scheduledTime}
                 onChange={(e) => setScheduledTime(e.target.value)}
                 className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-blue-500"
               />
               <p className="text-xs text-gray-500 mt-1">Оставьте пустым для мгновенной отправки</p>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-black/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={scheduledTime ? handleSchedule : handleSend}
            disabled={isSending || !tokens || !!error}
            className={`px-6 py-2 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                scheduledTime ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {isSending ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {scheduledTime ? <Clock size={18} /> : <Send size={18} />}
                {scheduledTime ? 'Запланировать' : 'Отправить'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
