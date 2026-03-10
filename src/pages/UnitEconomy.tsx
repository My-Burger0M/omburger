import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Trash2, Calculator, DollarSign, ShoppingBag, Package } from 'lucide-react';

interface GlobalStats {
  wbPurchases: number;
  wbPayouts: number;
  ozonPurchases: number;
  ozonPayouts: number;
}

interface MonthData {
  id: string;
  monthName: string;
  revenue: number;
  mpExpenses: number;
  costPrice: number;
  total: number;
  createdAt: any;
}

export default function UnitEconomy() {
  const { currentUser } = useAuth();
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    wbPurchases: 0,
    wbPayouts: 0,
    ozonPurchases: 0,
    ozonPayouts: 0,
  });
  const [months, setMonths] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

  // Calculator state
  const [calcMonth, setCalcMonth] = useState('');
  const [calcRevenue, setCalcRevenue] = useState<number | ''>('');
  const [calcMpExpenses, setCalcMpExpenses] = useState<number | ''>('');
  const [calcCostPrice, setCalcCostPrice] = useState<number | ''>('');

  // Edit state
  const [editingMonthId, setEditingMonthId] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      fetchData();
    }
  }, [currentUser]);

  const fetchData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      // Fetch global stats
      const statsDoc = await getDoc(doc(db, 'users', currentUser.uid, 'settings', 'unitEconomy'));
      if (statsDoc.exists()) {
        setGlobalStats(statsDoc.data() as GlobalStats);
      }

      // Fetch months
      const q = query(collection(db, 'users', currentUser.uid, 'unitEconomyMonths'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const monthsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MonthData));
      setMonths(monthsData);
    } catch (error) {
      console.error('Error fetching unit economy data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateGlobalStat = async (field: keyof GlobalStats, value: number) => {
    if (!currentUser) return;
    const newStats = { ...globalStats, [field]: value };
    setGlobalStats(newStats);
    try {
      await setDoc(doc(db, 'users', currentUser.uid, 'settings', 'unitEconomy'), newStats, { merge: true });
    } catch (error) {
      console.error('Error updating global stats:', error);
    }
  };

  const handleSaveMonth = async () => {
    if (!currentUser || !calcMonth) return;
    
    const revenue = Number(calcRevenue) || 0;
    const mpExpenses = Number(calcMpExpenses) || 0;
    const costPrice = Number(calcCostPrice) || 0;
    const total = revenue - mpExpenses - costPrice;

    const monthData = {
      monthName: calcMonth,
      revenue,
      mpExpenses,
      costPrice,
      total,
      updatedAt: serverTimestamp()
    };

    try {
      if (editingMonthId) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'unitEconomyMonths', editingMonthId), monthData);
        setMonths(months.map(m => m.id === editingMonthId ? { ...m, ...monthData } as MonthData : m));
        setEditingMonthId(null);
      } else {
        const docRef = await addDoc(collection(db, 'users', currentUser.uid, 'unitEconomyMonths'), {
          ...monthData,
          createdAt: serverTimestamp()
        });
        setMonths([{ id: docRef.id, ...monthData, createdAt: new Date() } as MonthData, ...months]);
      }
      
      // Reset calculator
      setCalcMonth('');
      setCalcRevenue('');
      setCalcMpExpenses('');
      setCalcCostPrice('');
    } catch (error) {
      console.error('Error saving month:', error);
    }
  };

  const handleEditMonth = (month: MonthData) => {
    setEditingMonthId(month.id);
    setCalcMonth(month.monthName);
    setCalcRevenue(month.revenue);
    setCalcMpExpenses(month.mpExpenses);
    setCalcCostPrice(month.costPrice);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteMonth = async (id: string) => {
    if (!currentUser || !window.confirm('Удалить этот месяц?')) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'unitEconomyMonths', id));
      setMonths(months.filter(m => m.id !== id));
    } catch (error) {
      console.error('Error deleting month:', error);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
  };

  const totalAllTime = months.reduce((acc, month) => {
    acc.revenue += month.revenue || 0;
    acc.mpExpenses += month.mpExpenses || 0;
    acc.costPrice += month.costPrice || 0;
    acc.total += month.total || 0;
    return acc;
  }, { revenue: 0, mpExpenses: 0, costPrice: 0, total: 0 });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <h1 className="text-3xl font-bold mb-8">Юнит-экономика</h1>

      {/* Top 4 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6">
          <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
            <ShoppingBag size={16} className="text-purple-400" />
            Выкупы Wildberries
          </div>
          <div className="flex items-end gap-2">
            <input 
              type="number" 
              value={globalStats.wbPurchases || ''}
              onChange={(e) => handleUpdateGlobalStat('wbPurchases', Number(e.target.value))}
              className="bg-transparent text-3xl font-bold text-white w-full outline-none"
              placeholder="0"
            />
            <span className="text-gray-500 font-medium mb-1">шт</span>
          </div>
        </div>
        
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6">
          <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
            <DollarSign size={16} className="text-green-400" />
            Выплаты Wildberries
          </div>
          <div className="flex items-end gap-2">
            <input 
              type="number" 
              value={globalStats.wbPayouts || ''}
              onChange={(e) => handleUpdateGlobalStat('wbPayouts', Number(e.target.value))}
              className="bg-transparent text-3xl font-bold text-white w-full outline-none"
              placeholder="0"
            />
            <span className="text-gray-500 font-medium mb-1">₽</span>
          </div>
        </div>

        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6">
          <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
            <Package size={16} className="text-blue-400" />
            Выкупы Ozon
          </div>
          <div className="flex items-end gap-2">
            <input 
              type="number" 
              value={globalStats.ozonPurchases || ''}
              onChange={(e) => handleUpdateGlobalStat('ozonPurchases', Number(e.target.value))}
              className="bg-transparent text-3xl font-bold text-white w-full outline-none"
              placeholder="0"
            />
            <span className="text-gray-500 font-medium mb-1">шт</span>
          </div>
        </div>

        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6">
          <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
            <DollarSign size={16} className="text-green-400" />
            Выплаты Ozon
          </div>
          <div className="flex items-end gap-2">
            <input 
              type="number" 
              value={globalStats.ozonPayouts || ''}
              onChange={(e) => handleUpdateGlobalStat('ozonPayouts', Number(e.target.value))}
              className="bg-transparent text-3xl font-bold text-white w-full outline-none"
              placeholder="0"
            />
            <span className="text-gray-500 font-medium mb-1">₽</span>
          </div>
        </div>
      </div>

      {/* Middle Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calculator */}
        <div className="lg:col-span-2 bg-[#1a1a1a] rounded-2xl border border-white/10 p-6">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Calculator size={20} className="text-purple-500" />
            Калькулятор валовой прибыли
          </h2>
          
          <div className="space-y-6">
            <div className="w-1/3">
              <input 
                type="text"
                value={calcMonth}
                onChange={(e) => setCalcMonth(e.target.value)}
                placeholder="Например: Март 2026"
                className="w-full bg-[#222] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Выручка:</label>
                <div className="relative">
                  <input 
                    type="number"
                    value={calcRevenue}
                    onChange={(e) => setCalcRevenue(Number(e.target.value))}
                    className="w-full bg-[#222] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                    placeholder="100000"
                  />
                  <span className="absolute right-4 top-3 text-gray-500">₽</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-2">Расходы МП:</label>
                <div className="relative">
                  <input 
                    type="number"
                    value={calcMpExpenses}
                    onChange={(e) => setCalcMpExpenses(Number(e.target.value))}
                    className="w-full bg-[#222] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                    placeholder="100000"
                  />
                  <span className="absolute right-4 top-3 text-gray-500">₽</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Себестоимость:</label>
                <div className="relative">
                  <input 
                    type="number"
                    value={calcCostPrice}
                    onChange={(e) => setCalcCostPrice(Number(e.target.value))}
                    className="w-full bg-[#222] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                    placeholder="100000"
                  />
                  <span className="absolute right-4 top-3 text-gray-500">₽</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Итого:</label>
                <div className="w-full bg-green-500/20 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 font-bold flex justify-between items-center">
                  <span>{formatCurrency((Number(calcRevenue) || 0) - (Number(calcMpExpenses) || 0) - (Number(calcCostPrice) || 0))}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button 
                onClick={handleSaveMonth}
                disabled={!calcMonth}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-colors"
              >
                {editingMonthId ? 'Сохранить изменения' : 'Добавить месяц'}
              </button>
            </div>
          </div>
        </div>

        {/* Total All Time */}
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 flex flex-col justify-center">
          <h2 className="text-lg font-bold mb-6 text-gray-300">Итого за всё время:</h2>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-[#222] p-3 rounded-xl border border-white/5">
              <span className="text-gray-400">Выручка:</span>
              <span className="font-medium">{formatCurrency(totalAllTime.revenue)}</span>
            </div>
            <div className="flex justify-between items-center bg-[#222] p-3 rounded-xl border border-white/5">
              <span className="text-gray-400">Расходы МП:</span>
              <span className="font-medium">{formatCurrency(totalAllTime.mpExpenses)}</span>
            </div>
            <div className="flex justify-between items-center bg-[#222] p-3 rounded-xl border border-white/5">
              <span className="text-gray-400">Себе-сть:</span>
              <span className="font-medium">{formatCurrency(totalAllTime.costPrice)}</span>
            </div>
            <div className="flex justify-between items-center bg-green-500/10 p-3 rounded-xl border border-green-500/20">
              <span className="text-green-500/80 font-medium">Итого:</span>
              <span className="text-green-400 font-bold">{formatCurrency(totalAllTime.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Months Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
        {months.map(month => (
          <div key={month.id} className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 relative group">
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
              <button onClick={() => handleEditMonth(month)} className="p-1.5 bg-[#222] hover:bg-purple-600 rounded-lg text-gray-400 hover:text-white transition-colors">
                <Edit2 size={14} />
              </button>
              <button onClick={() => handleDeleteMonth(month.id)} className="p-1.5 bg-[#222] hover:bg-red-600 rounded-lg text-gray-400 hover:text-white transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
            
            <h3 className="text-xl font-bold mb-6">{month.monthName}</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-[#222] p-2.5 rounded-lg border border-white/5 text-sm">
                <span className="text-gray-400">Выручка:</span>
                <span className="font-medium">{formatCurrency(month.revenue)}</span>
              </div>
              <div className="flex justify-between items-center bg-[#222] p-2.5 rounded-lg border border-white/5 text-sm">
                <span className="text-gray-400">Расходы МП:</span>
                <span className="font-medium">{formatCurrency(month.mpExpenses)}</span>
              </div>
              <div className="flex justify-between items-center bg-[#222] p-2.5 rounded-lg border border-white/5 text-sm">
                <span className="text-gray-400">Себе-сть:</span>
                <span className="font-medium">{formatCurrency(month.costPrice)}</span>
              </div>
              <div className="flex justify-between items-center bg-[#222] p-2.5 rounded-lg border border-white/5 text-sm mt-4">
                <span className="text-gray-300 font-medium">Итого:</span>
                <span className="font-bold text-white">{formatCurrency(month.total)}</span>
              </div>
            </div>
          </div>
        ))}

        {/* Add New Month Card */}
        <div 
          onClick={() => {
            setEditingMonthId(null);
            setCalcMonth('');
            setCalcRevenue('');
            setCalcMpExpenses('');
            setCalcCostPrice('');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="bg-[#1a1a1a] rounded-2xl border border-dashed border-white/20 p-6 flex flex-col items-center justify-center text-gray-400 hover:text-white hover:border-purple-500 hover:bg-purple-500/5 transition-all cursor-pointer min-h-[300px]"
        >
          <div className="w-16 h-16 rounded-2xl bg-[#222] flex items-center justify-center mb-4 group-hover:bg-purple-600 transition-colors">
            <Plus size={32} />
          </div>
          <span className="font-medium text-lg">Добавить</span>
        </div>
      </div>
    </div>
  );
}
