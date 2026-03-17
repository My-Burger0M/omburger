import { Send, MessageCircle, Users, Activity, Clock, ShoppingBag, ChevronLeft, ChevronRight, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import React, { useRef, useState, useEffect } from 'react';
import { useFirebaseImage } from '../hooks/useFirebaseImage';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { collection, query, where, onSnapshot, getDocs, deleteDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import UserListModal from '../components/UserListModal';
import SendStatsModal from '../components/SendStatsModal';

import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  const { currentUser } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statsData, setStatsData] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [platformUsers, setPlatformUsers] = useState({ tg: 0, vk: 0, max: 0 });
  const [isClearing, setIsClearing] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  
  const [selectedPlatform, setSelectedPlatform] = useState<'tg' | 'vk' | 'max' | 'all' | null>(null);
  const [isUserListModalOpen, setIsUserListModalOpen] = useState(false);
  const [isSendStatsModalOpen, setIsSendStatsModalOpen] = useState(false);
  
  const [todayStats, setTodayStats] = useState({ total: 0, wb: 0, ozon: 0 });
  const [monthStats, setMonthStats] = useState({ total: 0, wb: 0, ozon: 0 });
  const [isSyncingWb, setIsSyncingWb] = useState(false);

  const handleForceLoadWb = async () => {
    if (!currentUser) return;
    setIsSyncingWb(true);
    
    try {
      const response = await fetch('/api/wb/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId: currentUser.uid })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Ошибка загрузки');
      }
      
      alert(`Успешно загружено ${data.count} заказов`);
    } catch (error: any) {
      console.error("Error syncing with API:", error);
      alert("Ошибка при синхронизации с API: " + error.message);
    } finally {
      setIsSyncingWb(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    
    const docRef = doc(db, 'users', currentUser.uid, 'stats', 'dashboard');
    const unsubscribeStats = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTodayStats({
          total: data.today?.all || 0,
          wb: data.today?.wb || 0,
          ozon: data.today?.ozon || 0
        });
        setMonthStats({
          total: data.month?.all || 0,
          wb: data.month?.wb || 0,
          ozon: data.month?.ozon || 0
        });
      }
    });
    
    return () => {
      unsubscribeStats();
    };
  }, [currentUser]);

  useEffect(() => {
    // Stats listener
    const start = format(startOfMonth(currentDate), 'yyyy-MM-dd');
    const end = format(endOfMonth(currentDate), 'yyyy-MM-dd');
    
    const q = query(
      collection(db, 'stats'),
      where('date', '>=', start),
      where('date', '<=', end)
    );

    const unsubscribeStats = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          name: format(new Date(d.date), 'dd.MM'),
          tg: d.tg_users ? d.tg_users.length : (d.tg || 0),
          vk: d.vk_users ? d.vk_users.length : (d.vk || 0),
          max: d.max_users ? d.max_users.length : (d.max || 0),
          date: d.date // for sorting
        };
      });
      
      data.sort((a, b) => a.date.localeCompare(b.date));
      setStatsData(data);
      setError(null);
    }, (err) => {
      console.error("Dashboard stats error:", err);
      if (err.code === 'permission-denied') {
        setError('Нет доступа к данным. Пожалуйста, обновите правила безопасности в Firebase Console (раздел Firestore Database -> Rules) на "allow read, write: if true;" для тестов.');
      } else {
        setError('Ошибка загрузки данных: ' + err.message);
      }
    });

    // Total Users listener (count chats)
    const unsubscribeUsers = onSnapshot(collection(db, 'chats'), (snapshot) => {
      setTotalUsers(snapshot.size);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let activeCount = 0;
      let tgCount = 0;
      let vkCount = 0;
      let maxCount = 0;

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.platform === 'tg') tgCount++;
        if (data.platform === 'vk') vkCount++;
        if (data.platform === 'max') maxCount++;

        if (data.lastMessageAt) {
          const lastDate = data.lastMessageAt.toDate();
          if (lastDate >= today) activeCount++;
        }
      });
      
      setActiveUsers(activeCount);
      setPlatformUsers({ tg: tgCount, vk: vkCount, max: maxCount });
    });

    return () => {
      unsubscribeStats();
      unsubscribeUsers();
    };
  }, [currentDate]);

  const handlePrevMonth = () => setCurrentDate(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentDate(prev => addMonths(prev, 1));

  const handleClearStats = async () => {
    setIsClearing(true);
    try {
      // 1. Clear stats collection for the month
      const start = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      const end = format(endOfMonth(currentDate), 'yyyy-MM-dd');
      
      const qStats = query(
        collection(db, 'stats'),
        where('date', '>=', start),
        where('date', '<=', end)
      );

      const snapshotStats = await getDocs(qStats);
      const deletePromises = snapshotStats.docs.map(d => deleteDoc(doc(db, 'stats', d.id)));
      
      await Promise.all(deletePromises);
    } catch (e) {
      console.error('Error clearing stats:', e);
      alert('Ошибка при очистке статистики');
    } finally {
      setIsClearing(false);
    }
  };

  const isCurrentMonth = isSameMonth(currentDate, new Date());

  // Calculate totals for percentages
  const totalAll = totalUsers;

  const getPercent = (val: number) => totalAll > 0 ? Math.round((val / totalAll) * 100) : 0;

  // MSK Time calculations
  const now = new Date();
  const mskTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Moscow"}));
  const todayStr = format(mskTime, 'yyyy-MM-dd');
  
  const thirtyDaysAgo = new Date(mskTime);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const monthStartStr = format(startOfMonth(mskTime), 'yyyy-MM-dd');



  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">Дашборд</h1>
          <button 
            onClick={handleForceLoadWb}
            disabled={isSyncingWb}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={isSyncingWb ? 'animate-spin' : ''} />
            {isSyncingWb ? 'Загрузка...' : 'Принудительная загрузка ВБ'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 shrink-0" />
          <div>
            <h3 className="font-bold">Ошибка доступа к базе данных</h3>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Top Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <TopCard 
          imageKey="top1"
          title="Telegram Bot" 
          value={`${platformUsers.tg}`} 
          percentage={getPercent(platformUsers.tg)}
          icon={<Send className="w-5 h-5 text-cyan-400" />} 
          borderColor="border-cyan-500/50"
          iconBg="bg-cyan-500/10"
          progressColor="text-cyan-500"
          onClick={() => {
            setSelectedPlatform('tg');
            setIsUserListModalOpen(true);
          }}
        />
        <TopCard 
          imageKey="top2"
          title="VK Bot" 
          value={`${platformUsers.vk}`} 
          percentage={getPercent(platformUsers.vk)}
          icon={<span className="font-bold text-blue-400 text-sm">VK</span>} 
          borderColor="border-blue-500/50"
          iconBg="bg-blue-500/10"
          progressColor="text-blue-500"
          onClick={() => {
            setSelectedPlatform('vk');
            setIsUserListModalOpen(true);
          }}
        />
        <TopCard 
          imageKey="top3"
          title="Max Bot" 
          value={`${platformUsers.max}`} 
          percentage={getPercent(platformUsers.max)}
          icon={<MessageCircle className="w-5 h-5 text-purple-400" />} 
          borderColor="border-purple-500/50"
          iconBg="bg-purple-500/10"
          progressColor="text-purple-500"
          onClick={() => {
            setSelectedPlatform('max');
            setIsUserListModalOpen(true);
          }}
        />
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-blue-500 inline-block"></span>
              Статистика
            </h2>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-[#2a2a2a] rounded-lg p-1">
                <button 
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium capitalize min-w-[100px] text-center">
                  {format(currentDate, 'LLLL yyyy', { locale: ru })}
                </span>
                <button 
                  onClick={handleNextMonth}
                  disabled={isCurrentMonth}
                  className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              
              <button 
                onClick={() => setIsSendModalOpen(true)}
                className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors flex items-center justify-center"
                title="Отправить статистику в Telegram"
              >
                <Send size={18} />
              </button>

              <button 
                onClick={handleClearStats}
                disabled={isClearing || statsData.length === 0}
                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                title="Очистить статистику за месяц"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-[400px] w-full">
            {statsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="name" stroke="#666" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis stroke="#666" tick={{ fill: '#666', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip 
                    cursor={{ fill: '#2a2a2a' }}
                    contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '8px' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                  <Bar dataKey="tg" name="Telegram" stackId="a" fill="#22d3ee" radius={[0, 0, 0, 0]} barSize={20} />
                  <Bar dataKey="vk" name="ВКонтакте" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} barSize={20} />
                  <Bar dataKey="max" name="MAX" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                {error ? 'Ошибка загрузки' : 'Нет данных за этот период'}
              </div>
            )}
          </div>
        </div>

        {/* Right Stacked Cards */}
        <div className="flex flex-col gap-6">
          <MiddleCard 
            imageKey="mid1"
            title="Всего пользователей" 
            value={totalUsers.toString()} 
            icon={<Users className="w-5 h-5 text-blue-400" />} 
            bgIcon={<Users className="absolute -right-4 -bottom-4 w-32 h-32 text-white/5 group-hover:text-white/10 transition-colors" />}
            borderColor="border-purple-500/30"
            iconBg="bg-blue-500/20"
            onClick={() => {
              setSelectedPlatform('all');
              setIsUserListModalOpen(true);
            }}
          />

          <MiddleCard 
            imageKey="mid2"
            title="Активные сегодня" 
            value={activeUsers.toString()} 
            icon={<Activity className="w-5 h-5 text-green-400" />} 
            bgIcon={<Activity className="absolute -right-4 -bottom-4 w-32 h-32 text-white/5 group-hover:text-white/10 transition-colors" />}
            borderColor="border-green-500/30"
            iconBg="bg-green-500/20"
          />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <BottomCard imageKey="bot1" title="Заказы за сегодня" value={todayStats.total.toString()} unit="ед" icon={<Clock className="w-6 h-6" />} />
        <BottomCard imageKey="bot4" title="Заказы за месяц" value={monthStats.total.toString()} unit="ед" icon={<Clock className="w-6 h-6" />} />
        <BottomCard imageKey="bot3" title="Сегодня Ozon" value={todayStats.ozon.toString()} unit="ед" icon={<ShoppingBag className="w-6 h-6" />} />
        <BottomCard imageKey="bot2" title="Сегодня Wildberries" value={todayStats.wb.toString()} unit="ед" icon={<ShoppingBag className="w-6 h-6" />} />
        <BottomCard imageKey="bot6" title="За месяц Ozon" value={monthStats.ozon.toString()} unit="ед" icon={<ShoppingBag className="w-6 h-6" />} />
        <BottomCard imageKey="bot5" title="За месяц Wildberries" value={monthStats.wb.toString()} unit="ед" icon={<ShoppingBag className="w-6 h-6" />} />
      </div>

      {selectedPlatform && (
        <UserListModal 
          isOpen={isUserListModalOpen} 
          onClose={() => setIsUserListModalOpen(false)} 
          platform={selectedPlatform} 
        />
      )}

      <SendStatsModal
        isOpen={isSendModalOpen}
        onClose={() => setIsSendModalOpen(false)}
        statsData={statsData}
        currentDate={currentDate}
      />
    </div>
  );
}

function MiddleCard({ title, value, icon, bgIcon, borderColor, iconBg, imageKey, onClick }: { title: string, value: string, icon: React.ReactNode, bgIcon: React.ReactNode, borderColor: string, iconBg: string, imageKey: string, onClick?: () => void }) {
  const { url: iconUrl, uploadImage, loading } = useFirebaseImage(imageKey);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadImage(file);
    }
  };

  return (
    <div 
      onClick={onClick}
      className={`bg-[#1a1a1a] rounded-2xl border ${borderColor} p-6 flex-1 flex flex-col justify-center relative overflow-hidden group transition-transform hover:scale-[1.02] ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <div 
            className={`p-2 ${iconBg} rounded-lg cursor-pointer relative overflow-hidden group/icon shrink-0`}
            onClick={handleIconClick}
            title="Загрузить иконку"
          >
            {loading ? (
              <div className="w-5 h-5 animate-pulse bg-white/20 rounded" />
            ) : iconUrl ? (
              <img src={iconUrl} alt="Icon" className="w-5 h-5 object-cover" />
            ) : (
              icon
            )}
          </div>
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{title}</h3>
        </div>
        <div className="text-5xl font-bold mt-4">{value}</div>
      </div>
      {bgIcon}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function TopCard({ title, value, percentage, icon, borderColor, iconBg, progressColor, imageKey, onClick }: { title: string, value: string, percentage: number, icon: React.ReactNode, borderColor: string, iconBg: string, progressColor: string, imageKey: string, onClick: () => void }) {
  const { url: iconUrl, uploadImage, loading } = useFirebaseImage(imageKey);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadImage(file);
    }
  };

  // Circular progress calculation
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div 
      onClick={onClick}
      className={`bg-[#1a1a1a] rounded-2xl border ${borderColor} p-6 flex items-center justify-between transition-transform hover:scale-[1.02] cursor-pointer relative overflow-hidden`}
    >
      <div className="relative z-10">
        <h3 className="text-sm text-gray-400 mb-1">{title}</h3>
        <div className="text-4xl font-bold">{value}</div>
        <div className={`text-xs font-medium mt-2 ${progressColor.replace('text-', 'text-opacity-80 text-')}`}>
          {percentage}% от общего
        </div>
      </div>
      
      <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
        {/* Circular Progress Background */}
        <svg className="absolute w-full h-full transform -rotate-90">
          <circle
            cx="40"
            cy="40"
            r={radius}
            stroke="currentColor"
            strokeWidth="4"
            fill="transparent"
            className="text-gray-800"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            stroke="currentColor"
            strokeWidth="4"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={`${progressColor} transition-all duration-1000 ease-out`}
            strokeLinecap="round"
          />
        </svg>

        {/* Icon Container */}
        <div 
          className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center cursor-pointer overflow-hidden relative group/icon z-20`}
          onClick={handleIconClick}
          title="Загрузить иконку"
        >
          {loading ? (
            <div className="w-full h-full animate-pulse bg-white/10" />
          ) : iconUrl ? (
            <img src={iconUrl} alt="Icon" className="w-full h-full object-cover" />
          ) : (
            icon
          )}
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function BottomCard({ title, value, unit, icon, imageKey, onClick }: { title: string, value: string, unit: string, icon: React.ReactNode, imageKey: string, onClick?: () => void }) {
  const { url: iconUrl, uploadImage, loading } = useFirebaseImage(imageKey);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await uploadImage(file);
    }
  };

  return (
    <div 
      onClick={onClick}
      className={`bg-[#1a1a1a] rounded-2xl border border-purple-500/30 p-5 flex flex-col justify-between relative overflow-hidden transition-transform hover:scale-[1.02] ${onClick ? 'cursor-pointer' : ''}`}
    >
      <h3 className="text-sm text-gray-400 mb-4 pr-8 leading-tight">{title}</h3>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-sm text-gray-500">{unit}</span>
      </div>
      <div 
        className="absolute top-4 right-4 text-gray-600 cursor-pointer hover:text-white transition-colors group"
        onClick={handleIconClick}
        title="Загрузить иконку"
      >
        {loading ? (
          <div className="w-8 h-8 animate-pulse bg-white/10 rounded-full" />
        ) : iconUrl ? (
          <img src={iconUrl} alt="Icon" className="w-8 h-8 object-cover rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
        ) : (
          icon
        )}
      </div>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />
    </div>
  );
}
