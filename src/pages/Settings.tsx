import { useState, useEffect } from 'react';
import { Save, Activity, Database, CheckCircle, XCircle, MessageSquare, Bell } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

export default function Settings() {
  const { currentUser } = useAuth();
  const [wbToken, setWbToken] = useState('');
  const [tgToken, setTgToken] = useState('');
  const [vkToken, setVkToken] = useState('');
  const [vkSecret, setVkSecret] = useState('');
  const [ozonToken, setOzonToken] = useState('');
  const [maxToken, setMaxToken] = useState('');
  
  // Notification Bot
  const [notificationBotToken, setNotificationBotToken] = useState('');
  const [notificationChatId, setNotificationChatId] = useState('');
  const [notificationError, setNotificationError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Diagnostics
  const [serverStatus, setServerStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [dbStatus, setDbStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [botStatus, setBotStatus] = useState<{ vk: boolean; vkPolling: boolean; tg: boolean; wb: boolean; ozon: boolean; max: boolean; lastVkError?: string; lastTgError?: string } | null>(null);
  
  // Simulation
  const [testMessage, setTestMessage] = useState('');
  const [testPlatform, setTestPlatform] = useState<'tg' | 'vk' | 'max'>('tg');

  useEffect(() => {
    const fetchTokens = async () => {
      if (!currentUser) return;
      try {
        const docRef = doc(db, 'users', currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().tokens) {
          const t = docSnap.data().tokens;
          setWbToken(t.wb || '');
          setTgToken(t.tg || '');
          setVkToken(t.vk || '');
          setVkSecret(t.vkSecret || '');
          setOzonToken(t.ozon || '');
          setMaxToken(t.max || '');
          setNotificationBotToken(t.notificationBotToken || '');
          setNotificationChatId(t.notificationChatId || '');
        }
      } catch (error) {
        console.error("Error fetching tokens:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTokens();
    checkServer();
    checkDatabase();
    checkBotStatus();
  }, [currentUser]);

  const checkServer = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || '';
      await axios.get(`${API_URL}/api/health`);
      setServerStatus('ok');
    } catch (e) {
      console.error('Server check failed:', e);
      setServerStatus('error');
    }
  };

  const checkBotStatus = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || '';
      const res = await axios.get(`${API_URL}/api/bot/status`);
      setBotStatus(res.data);
    } catch (e) {
      console.error('Bot status check failed:', e);
      setBotStatus(null);
    }
  };

  const checkDatabase = async () => {
    try {
      // Try to write a test document
      await setDoc(doc(db, 'system', 'health_check'), {
        lastCheck: new Date(),
        status: 'ok'
      });
      setDbStatus('ok');
    } catch (e) {
      console.error('Database check failed:', e);
      setDbStatus('error');
    }
  };

  const validateNotificationSettings = () => {
    if (notificationBotToken && !notificationChatId) {
      return 'Если указан токен бота уведомлений, необходимо указать ID чата.';
    }
    if (!notificationBotToken && notificationChatId) {
      return 'Если указан ID чата, необходимо указать токен бота уведомлений.';
    }
    // Basic regex for Telegram bot token (number:string)
    if (notificationBotToken && !/^\d+:[A-Za-z0-9_-]+$/.test(notificationBotToken)) {
      return 'Неверный формат токена бота уведомлений. Ожидается формат: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
    }
    return null;
  };

  const handleSave = async () => {
    if (!currentUser) return;
    
    const error = validateNotificationSettings();
    if (error) {
      setNotificationError(error);
      // Scroll to error or alert
      alert(error);
      return;
    }
    setNotificationError(null);

    setIsSaving(true);
    try {
      await setDoc(doc(db, 'users', currentUser.uid), {
        tokens: {
          wb: wbToken, 
          tg: tgToken, 
          vk: vkToken,
          vkSecret: vkSecret,
          ozon: ozonToken,
          max: maxToken,
          notificationBotToken,
          notificationChatId
        }
      }, { merge: true });

      // Restart bots on server
      try {
        const API_URL = import.meta.env.VITE_API_URL || '';
        await axios.post(`${API_URL}/api/bot/restart`, { userId: currentUser.uid });
        alert('Настройки сохранены и боты перезапущены!');
        checkBotStatus(); // Refresh status
      } catch (e) {
        console.error('Error restarting bots:', e);
        alert('Настройки сохранены, но не удалось перезапустить ботов. Попробуйте обновить страницу.');
      }
    } catch (error) {
      console.error("Error saving tokens:", error);
      alert('Ошибка при сохранении настроек. Проверьте правила доступа в Firebase.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSimulateWebhook = async () => {
    if (!testMessage) return;
    try {
      // Call the local server endpoint
      let payload = {};
      let endpoint = '';
      const API_URL = import.meta.env.VITE_API_URL || '';

      if (testPlatform === 'tg') {
        endpoint = `${API_URL}/api/webhook/tg`;
        payload = {
          message: {
            chat: { id: 123456789 },
            text: testMessage,
            from: { username: 'test_user', first_name: 'Test User' }
          }
        };
      } else if (testPlatform === 'vk') {
        endpoint = `${API_URL}/api/webhook/vk`;
        payload = {
          type: 'message_new',
          object: {
            message: {
              from_id: 987654321,
              text: testMessage
            }
          }
        };
      } else if (testPlatform === 'max') {
        endpoint = `${API_URL}/api/webhook/max`;
        payload = {
          chatId: 'max_123',
          text: testMessage,
          username: 'Max User'
        };
      }

      await axios.post(endpoint, payload);
      alert(`Сообщение отправлено в ${testPlatform.toUpperCase()}! Проверьте Дашборд и Диалоги.`);
      setTestMessage('');
    } catch (error) {
      console.error('Error simulating webhook:', error);
      alert('Ошибка симуляции');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold mb-8">Настройки интеграций</h1>

      {/* Diagnostics Panel */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Activity className="text-blue-500" />
          Диагностика системы
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#2a2a2a] p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="text-gray-400" />
              <div>
                <div className="font-medium">База данных (Firestore)</div>
                <div className="text-xs text-gray-500">Проверка прав записи</div>
              </div>
            </div>
            {dbStatus === 'checking' && <span className="text-yellow-500 text-sm">Проверка...</span>}
            {dbStatus === 'ok' && <div className="flex items-center gap-1 text-green-500"><CheckCircle size={16} /> <span className="text-sm">OK</span></div>}
            {dbStatus === 'error' && <div className="flex items-center gap-1 text-red-500"><XCircle size={16} /> <span className="text-sm">Ошибка прав</span></div>}
          </div>

          <div className="bg-[#2a2a2a] p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="text-gray-400" />
              <div>
                <div className="font-medium">Сервер ботов</div>
                <div className="text-xs text-gray-500">Статус API сервера</div>
              </div>
            </div>
            {serverStatus === 'checking' && <span className="text-yellow-500 text-sm">Проверка...</span>}
            {serverStatus === 'ok' && <div className="flex items-center gap-1 text-green-500"><CheckCircle size={16} /> <span className="text-sm">Работает</span></div>}
            {serverStatus === 'error' && <div className="flex items-center gap-1 text-red-500"><XCircle size={16} /> <span className="text-sm">Недоступен</span></div>}
          </div>

          <div className="bg-[#2a2a2a] p-4 rounded-xl flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${botStatus?.vkPolling ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <div>
                  <div className="font-medium">VK Бот</div>
                  <div className="text-xs text-gray-500">{botStatus?.vk ? 'Токен установлен' : 'Токен не найден'}</div>
                </div>
              </div>
              {botStatus?.vkPolling ? (
                <div className="flex items-center gap-1 text-green-500"><CheckCircle size={16} /> <span className="text-sm">Активен</span></div>
              ) : (
                <div className="flex items-center gap-1 text-red-500"><XCircle size={16} /> <span className="text-sm">Остановлен</span></div>
              )}
            </div>
            {botStatus?.lastVkError && (
              <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20 mt-1">
                Ошибка: {botStatus.lastVkError}
              </div>
            )}
          </div>

          <div className="bg-[#2a2a2a] p-4 rounded-xl flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${botStatus?.tg ? 'bg-green-500' : 'bg-red-500'}`} />
                <div>
                  <div className="font-medium">Telegram Бот</div>
                  <div className="text-xs text-gray-500">{botStatus?.tg ? 'Токен установлен' : 'Токен не найден'}</div>
                </div>
              </div>
              {botStatus?.tg ? (
                <div className="flex items-center gap-1 text-green-500"><CheckCircle size={16} /> <span className="text-sm">Готов</span></div>
              ) : (
                <div className="flex items-center gap-1 text-red-500"><XCircle size={16} /> <span className="text-sm">Нет токена</span></div>
              )}
            </div>
            {botStatus?.lastTgError && (
              <div className="text-xs text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20 mt-1">
                Ошибка: {botStatus.lastTgError}
              </div>
            )}
          </div>

          <div className="bg-[#2a2a2a] p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${botStatus?.wb ? 'bg-green-500' : 'bg-red-500'}`} />
              <div>
                <div className="font-medium">Wildberries API</div>
                <div className="text-xs text-gray-500">{botStatus?.wb ? 'Токен установлен' : 'Токен не найден'}</div>
              </div>
            </div>
            {botStatus?.wb ? (
              <div className="flex items-center gap-1 text-green-500"><CheckCircle size={16} /> <span className="text-sm">Готов</span></div>
            ) : (
              <div className="flex items-center gap-1 text-red-500"><XCircle size={16} /> <span className="text-sm">Нет токена</span></div>
            )}
          </div>

          <div className="bg-[#2a2a2a] p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${botStatus?.ozon ? 'bg-green-500' : 'bg-red-500'}`} />
              <div>
                <div className="font-medium">Ozon API</div>
                <div className="text-xs text-gray-500">{botStatus?.ozon ? 'Токен установлен' : 'Токен не найден'}</div>
              </div>
            </div>
            {botStatus?.ozon ? (
              <div className="flex items-center gap-1 text-green-500"><CheckCircle size={16} /> <span className="text-sm">Готов</span></div>
            ) : (
              <div className="flex items-center gap-1 text-red-500"><XCircle size={16} /> <span className="text-sm">Нет токена</span></div>
            )}
          </div>

          <div className="bg-[#2a2a2a] p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${botStatus?.max ? 'bg-green-500' : 'bg-red-500'}`} />
              <div>
                <div className="font-medium">MAX Messenger</div>
                <div className="text-xs text-gray-500">{botStatus?.max ? 'Токен установлен' : 'Токен не найден'}</div>
              </div>
            </div>
            {botStatus?.max ? (
              <div className="flex items-center gap-1 text-green-500"><CheckCircle size={16} /> <span className="text-sm">Готов</span></div>
            ) : (
              <div className="flex items-center gap-1 text-red-500"><XCircle size={16} /> <span className="text-sm">Нет токена</span></div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-8 space-y-8">
        
        {/* Wildberries Token */}
        <div className="space-y-3">
          <label htmlFor="wbToken" className="block text-sm font-medium text-gray-300">
            Wildberries API Токен
          </label>
          <input
            type="password"
            id="wbToken"
            value={wbToken}
            onChange={(e) => setWbToken(e.target.value)}
            placeholder="Введите токен WB..."
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          />
          <p className="text-xs text-gray-500">Используется для получения статистики по заказам с Wildberries.</p>
        </div>

        {/* Ozon Token */}
        <div className="space-y-3">
          <label htmlFor="ozonToken" className="block text-sm font-medium text-gray-300">
            Ozon API Токен
          </label>
          <input
            type="password"
            id="ozonToken"
            value={ozonToken}
            onChange={(e) => setOzonToken(e.target.value)}
            placeholder="Введите токен Ozon..."
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
          />
          <p className="text-xs text-gray-500">Используется для получения статистики по заказам с Ozon.</p>
        </div>

        {/* Telegram Token */}
        <div className="space-y-3">
          <label htmlFor="tgToken" className="block text-sm font-medium text-gray-300">
            Telegram Bot Токен
          </label>
          <input
            type="password"
            id="tgToken"
            value={tgToken}
            onChange={(e) => setTgToken(e.target.value)}
            placeholder="1234567890:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
          />
          <p className="text-xs text-gray-500">Токен бота, полученный от @BotFather.</p>
        </div>

        {/* VK Token */}
        <div className="space-y-3">
          <label htmlFor="vkToken" className="block text-sm font-medium text-gray-300">
            ВКонтакте Токен группы
          </label>
          <input
            type="password"
            id="vkToken"
            value={vkToken}
            onChange={(e) => setVkToken(e.target.value)}
            placeholder="Введите токен VK..."
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <p className="text-xs text-gray-500">
            Ключ доступа сообщества. В настройках группы: <b>Работа с API → Long Poll API → Включено</b>. 
            Версия API: <b>5.131</b>. Типы событий: <b>Входящие сообщения</b>.
          </p>
        </div>

        {/* VK Secret Key */}
        <div className="space-y-3">
          <label htmlFor="vkSecret" className="block text-sm font-medium text-gray-300">
            ВКонтакте Секретный ключ (для Callback API)
          </label>
          <input
            type="text"
            id="vkSecret"
            value={vkSecret || ''}
            onChange={(e) => setVkSecret(e.target.value)}
            placeholder="Введите секретный ключ..."
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

        {/* MAX Messenger Token */}
        <div className="space-y-3">
          <label htmlFor="maxToken" className="block text-sm font-medium text-gray-300">
            MAX Messenger Токен
          </label>
          <input
            type="password"
            id="maxToken"
            value={maxToken}
            onChange={(e) => setMaxToken(e.target.value)}
            placeholder="Введите токен MAX..."
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
          />
          <p className="text-xs text-gray-500">Токен для интеграции с MAX Messenger.</p>
        </div>

        {/* Notification Bot Settings */}
        <div className="pt-6 border-t border-white/10 space-y-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 text-white">
            <Bell className="text-yellow-500" size={20} />
            Бот уведомлений
          </h3>
          <p className="text-sm text-gray-400 -mt-4">
            Настройте отдельного бота для получения системных уведомлений и алертов.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label htmlFor="notificationBotToken" className="block text-sm font-medium text-gray-300">
                Токен бота уведомлений
              </label>
              <input
                type="password"
                id="notificationBotToken"
                value={notificationBotToken}
                onChange={(e) => setNotificationBotToken(e.target.value)}
                placeholder="1234567890:AAHdq..."
                className={`w-full bg-[#2a2a2a] border rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all ${notificationError && !notificationBotToken ? 'border-red-500' : 'border-white/10'}`}
              />
            </div>

            <div className="space-y-3">
              <label htmlFor="notificationChatId" className="block text-sm font-medium text-gray-300">
                ID чата для уведомлений
              </label>
              <input
                type="text"
                id="notificationChatId"
                value={notificationChatId}
                onChange={(e) => setNotificationChatId(e.target.value)}
                placeholder="-1001234567890"
                className={`w-full bg-[#2a2a2a] border rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition-all ${notificationError && !notificationChatId ? 'border-red-500' : 'border-white/10'}`}
              />
            </div>
          </div>
          
          {notificationError && (
            <div className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20 flex items-center gap-2">
              <XCircle size={16} />
              {notificationError}
            </div>
          )}
        </div>

        <div className="pt-6 border-t border-white/10 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-purple-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Save size={20} />
            {isSaving ? 'Сохранение...' : 'Сохранить настройки'}
          </button>
        </div>
      </div>

      {/* Simulation Tool */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 space-y-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <MessageSquare className="text-green-500" />
          Тест Webhook (Симуляция входящего сообщения)
        </h2>
        <p className="text-sm text-gray-400">
          Так как сервер находится в закрытом контуре, реальные вебхуки от Telegram/VK не дойдут сюда без настройки туннеля.
          Используйте этот инструмент для проверки логики чатов и статистики.
        </p>

        <div className="flex gap-4">
          <select 
            value={testPlatform}
            onChange={(e) => setTestPlatform(e.target.value as any)}
            className="bg-[#2a2a2a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="tg">Telegram</option>
            <option value="vk">ВКонтакте</option>
            <option value="max">MAX</option>
          </select>
          <input 
            type="text" 
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            placeholder="Текст сообщения..."
            className="flex-1 bg-[#2a2a2a] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <button 
            onClick={handleSimulateWebhook}
            className="px-6 py-3 bg-green-600 rounded-xl hover:bg-green-500 transition-colors font-medium"
          >
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
