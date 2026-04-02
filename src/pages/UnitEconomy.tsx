import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, query, orderBy, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit2, Trash2, Calculator, DollarSign, ShoppingBag, Package, Link as LinkIcon, ChevronDown, Check, TrendingUp } from 'lucide-react';

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
  ofrExpenseGroupId?: string;
  ofrCostGroupId?: string;
}

export default function UnitEconomy() {
  const { currentUser } = useAuth();
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    wbPurchases: 0,
    wbPayouts: 0,
    ozonPurchases: 0,
    ozonPayouts: 0,
  });
  const [localStats, setLocalStats] = useState<GlobalStats>({
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
  
  // Custom dropdown state
  const [openDropdown, setOpenDropdown] = useState<'mp' | 'cost' | null>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openDropdown) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openDropdown]);

  // OFR Data
  const [ofrExpenseGroups, setOfrExpenseGroups] = useState<{id: string, title: string, total: number}[]>([]);
  const [ofrCostGroups, setOfrCostGroups] = useState<{id: string, title: string, total: number}[]>([]);
  
  const [selectedExpenseGroupId, setSelectedExpenseGroupId] = useState<string>('all');
  const [selectedCostGroupId, setSelectedCostGroupId] = useState<string>('all');

  useEffect(() => {
    if (currentUser) {
      fetchData();
      
      // Listen to OFR Expenses
      const unsubscribeExpenses = onSnapshot(
        collection(db, 'users', currentUser.uid, 'ofr_expenses'),
        (snapshot) => {
          const groups: {id: string, title: string, total: number}[] = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            let total = 0;
            if (data.items && Array.isArray(data.items)) {
              total = data.items.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
            }
            groups.push({ id: doc.id, title: data.title || 'Без названия', total });
          });
          setOfrExpenseGroups(groups);
        }
      );

      // Listen to Cost Settings and OFR Costs
      const unsubscribeCostSettings = onSnapshot(
        collection(db, 'users', currentUser.uid, 'cost_settings'),
        (settingsSnapshot) => {
          const settingsMap: Record<string, number> = {};
          settingsSnapshot.forEach(doc => {
            settingsMap[doc.id] = doc.data().totalCost || 0;
          });

          const unsubscribeCosts = onSnapshot(
            collection(db, 'users', currentUser.uid, 'ofr_costs'),
            (costsSnapshot) => {
              const groups: {id: string, title: string, total: number}[] = [];
              costsSnapshot.forEach(doc => {
                const data = doc.data();
                let total = 0;
                if (data.items && Array.isArray(data.items)) {
                  total = data.items.reduce((sum: number, item: any) => {
                    const cost = settingsMap[item.costSettingId] || 0;
                    return sum + (Number(item.quantity) || 0) * cost;
                  }, 0);
                }
                groups.push({ id: doc.id, title: data.title || 'Без названия', total });
              });
              setOfrCostGroups(groups);
            }
          );
          return () => unsubscribeCosts();
        }
      );

      return () => {
        unsubscribeExpenses();
        unsubscribeCostSettings();
      };
    }
  }, [currentUser]);

  useEffect(() => {
    if (selectedExpenseGroupId === 'all') {
      const total = ofrExpenseGroups.reduce((sum, g) => sum + g.total, 0);
      setCalcMpExpenses(total || '');
    } else {
      const group = ofrExpenseGroups.find(g => g.id === selectedExpenseGroupId);
      if (group) setCalcMpExpenses(group.total || '');
    }

    if (selectedCostGroupId === 'all') {
      const total = ofrCostGroups.reduce((sum, g) => sum + g.total, 0);
      setCalcCostPrice(total || '');
    } else {
      const group = ofrCostGroups.find(g => g.id === selectedCostGroupId);
      if (group) setCalcCostPrice(group.total || '');
    }
  }, [ofrExpenseGroups, ofrCostGroups, selectedExpenseGroupId, selectedCostGroupId]);

  const fetchData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      // Fetch global stats
      const statsDoc = await getDoc(doc(db, 'users', currentUser.uid, 'settings', 'unitEconomy'));
      if (statsDoc.exists()) {
        const data = statsDoc.data() as GlobalStats;
        setGlobalStats(data);
        setLocalStats(data);
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

  const handleLocalStatChange = (field: keyof GlobalStats, value: number) => {
    setLocalStats(prev => ({ ...prev, [field]: value }));
  };

  const handleUpdateGlobalStat = async (field: keyof GlobalStats) => {
    if (!currentUser) return;
    const value = localStats[field];
    if (value === globalStats[field]) return; // No change

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

    const monthData: any = {
      monthName: calcMonth,
      revenue,
      mpExpenses,
      costPrice,
      total,
      ofrExpenseGroupId: selectedExpenseGroupId,
      ofrCostGroupId: selectedCostGroupId,
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
      setSelectedExpenseGroupId('all');
      setSelectedCostGroupId('all');
    } catch (error) {
      console.error('Error saving month:', error);
    }
  };

  const handleEditMonth = (month: MonthData) => {
    setEditingMonthId(month.id);
    setCalcMonth(month.monthName);
    setCalcRevenue(month.revenue);
    setSelectedExpenseGroupId(month.ofrExpenseGroupId || 'all');
    setSelectedCostGroupId(month.ofrCostGroupId || 'all');
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

  const dynamicMonths = months.map(m => {
    let dynamicMpExpenses = m.mpExpenses || 0;
    if (m.ofrExpenseGroupId === 'all') {
      dynamicMpExpenses = ofrExpenseGroups.reduce((sum, g) => sum + g.total, 0);
    } else if (m.ofrExpenseGroupId) {
      const group = ofrExpenseGroups.find(g => g.id === m.ofrExpenseGroupId);
      if (group) dynamicMpExpenses = group.total;
    }

    let dynamicCostPrice = m.costPrice || 0;
    if (m.ofrCostGroupId === 'all') {
      dynamicCostPrice = ofrCostGroups.reduce((sum, g) => sum + g.total, 0);
    } else if (m.ofrCostGroupId) {
      const group = ofrCostGroups.find(g => g.id === m.ofrCostGroupId);
      if (group) dynamicCostPrice = group.total;
    }

    const dynamicTotal = m.revenue - dynamicMpExpenses - dynamicCostPrice;
    return { ...m, dynamicMpExpenses, dynamicCostPrice, dynamicTotal };
  });

  const totalAllTime = dynamicMonths.reduce((acc, month) => {
    acc.revenue += month.revenue || 0;
    acc.mpExpenses += month.dynamicMpExpenses || 0;
    acc.costPrice += month.dynamicCostPrice || 0;
    acc.total += month.dynamicTotal || 0;
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
              value={localStats.wbPurchases || ''}
              onChange={(e) => handleLocalStatChange('wbPurchases', Number(e.target.value))}
              onBlur={() => handleUpdateGlobalStat('wbPurchases')}
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
              value={localStats.wbPayouts || ''}
              onChange={(e) => handleLocalStatChange('wbPayouts', Number(e.target.value))}
              onBlur={() => handleUpdateGlobalStat('wbPayouts')}
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
              value={localStats.ozonPurchases || ''}
              onChange={(e) => handleLocalStatChange('ozonPurchases', Number(e.target.value))}
              onBlur={() => handleUpdateGlobalStat('ozonPurchases')}
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
              value={localStats.ozonPayouts || ''}
              onChange={(e) => handleLocalStatChange('ozonPayouts', Number(e.target.value))}
              onBlur={() => handleUpdateGlobalStat('ozonPayouts')}
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
        <div className="lg:col-span-2 bg-gradient-to-br from-[#1a1a1a] to-[#222] rounded-3xl border border-white/10 p-8 shadow-2xl relative overflow-hidden">
          {/* Decorative background element */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
          
          <div className="flex items-center justify-between mb-8 relative z-10">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-3 bg-purple-500/20 rounded-xl">
                <Calculator size={24} className="text-purple-400" />
              </div>
              Калькулятор валовой прибыли
            </h2>
          </div>
          
          <div className="space-y-8 relative z-10">
            <div className="w-full md:w-1/2">
              <label className="block text-sm font-medium text-gray-400 mb-2">Название месяца</label>
              <input 
                type="text"
                value={calcMonth}
                onChange={(e) => setCalcMonth(e.target.value)}
                placeholder="Например: Март 2026"
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white text-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-gray-600"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-black/20 p-5 rounded-2xl border border-white/5">
                <label className="block text-sm font-medium text-gray-400 mb-3">Выручка</label>
                <div className="relative">
                  <input 
                    type="number"
                    value={calcRevenue}
                    onChange={(e) => setCalcRevenue(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                    placeholder="0"
                  />
                  <span className="absolute right-4 top-3.5 text-gray-500 font-medium">₽</span>
                </div>
              </div>
              
              <div className="bg-black/20 p-5 rounded-2xl border border-white/5 relative">
                <label className="block text-sm font-medium text-gray-400 mb-3">Расходы МП</label>
                
                <div 
                  className="relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdown(openDropdown === 'mp' ? null : 'mp');
                  }}
                >
                  <div className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white cursor-pointer flex items-center justify-between hover:border-purple-500/50 transition-all">
                    <span className="truncate pr-4">
                      {selectedExpenseGroupId === 'all' 
                        ? 'Все расходы ОФР' 
                        : ofrExpenseGroups.find(g => g.id === selectedExpenseGroupId)?.title || 'Выберите расходы'}
                    </span>
                    <ChevronDown size={18} className={`text-gray-400 transition-transform duration-200 ${openDropdown === 'mp' ? 'rotate-180' : ''}`} />
                  </div>
                  
                  {openDropdown === 'mp' && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#222] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-60 overflow-y-auto custom-scrollbar">
                      <div 
                        className={`px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-purple-500/10 transition-colors ${selectedExpenseGroupId === 'all' ? 'bg-purple-500/10 text-purple-400' : 'text-white'}`}
                        onClick={() => setSelectedExpenseGroupId('all')}
                      >
                        <span>Все расходы ОФР</span>
                        {selectedExpenseGroupId === 'all' && <Check size={16} />}
                      </div>
                      {ofrExpenseGroups.map(g => (
                        <div 
                          key={g.id}
                          className={`px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-purple-500/10 transition-colors border-t border-white/5 ${selectedExpenseGroupId === g.id ? 'bg-purple-500/10 text-purple-400' : 'text-white'}`}
                          onClick={() => setSelectedExpenseGroupId(g.id)}
                        >
                          <div className="flex flex-col">
                            <span>{g.title}</span>
                            <span className="text-xs text-gray-400">{formatCurrency(g.total)}</span>
                          </div>
                          {selectedExpenseGroupId === g.id && <Check size={16} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 text-right text-sm text-gray-500">
                  Сумма: <span className="text-white font-medium">{formatCurrency(Number(calcMpExpenses) || 0)}</span>
                </div>
              </div>

              <div className="bg-black/20 p-5 rounded-2xl border border-white/5 relative">
                <label className="block text-sm font-medium text-gray-400 mb-3">Себестоимость</label>
                
                <div 
                  className="relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdown(openDropdown === 'cost' ? null : 'cost');
                  }}
                >
                  <div className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white cursor-pointer flex items-center justify-between hover:border-purple-500/50 transition-all">
                    <span className="truncate pr-4">
                      {selectedCostGroupId === 'all' 
                        ? 'Вся себестоимость ОФР' 
                        : ofrCostGroups.find(g => g.id === selectedCostGroupId)?.title || 'Выберите себестоимость'}
                    </span>
                    <ChevronDown size={18} className={`text-gray-400 transition-transform duration-200 ${openDropdown === 'cost' ? 'rotate-180' : ''}`} />
                  </div>
                  
                  {openDropdown === 'cost' && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#222] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-60 overflow-y-auto custom-scrollbar">
                      <div 
                        className={`px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-purple-500/10 transition-colors ${selectedCostGroupId === 'all' ? 'bg-purple-500/10 text-purple-400' : 'text-white'}`}
                        onClick={() => setSelectedCostGroupId('all')}
                      >
                        <span>Вся себестоимость ОФР</span>
                        {selectedCostGroupId === 'all' && <Check size={16} />}
                      </div>
                      {ofrCostGroups.map(g => (
                        <div 
                          key={g.id}
                          className={`px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-purple-500/10 transition-colors border-t border-white/5 ${selectedCostGroupId === g.id ? 'bg-purple-500/10 text-purple-400' : 'text-white'}`}
                          onClick={() => setSelectedCostGroupId(g.id)}
                        >
                          <div className="flex flex-col">
                            <span>{g.title}</span>
                            <span className="text-xs text-gray-400">{formatCurrency(g.total)}</span>
                          </div>
                          {selectedCostGroupId === g.id && <Check size={16} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 text-right text-sm text-gray-500">
                  Сумма: <span className="text-white font-medium">{formatCurrency(Number(calcCostPrice) || 0)}</span>
                </div>
              </div>

              <div className="bg-purple-500/10 p-5 rounded-2xl border border-purple-500/20 flex flex-col justify-center">
                <label className="block text-sm font-medium text-purple-400/80 mb-2">Итоговая валовая прибыль</label>
                <div className="text-3xl font-bold text-white">
                  {formatCurrency((Number(calcRevenue) || 0) - (Number(calcMpExpenses) || 0) - (Number(calcCostPrice) || 0))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-white/5">
              <button 
                onClick={handleSaveMonth}
                disabled={!calcMonth}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg shadow-purple-500/20 flex items-center gap-2"
              >
                {editingMonthId ? 'Сохранить изменения' : 'Добавить месяц'}
              </button>
            </div>
          </div>
        </div>

        {/* Total All Time */}
        <div className="bg-gradient-to-b from-[#1a1a1a] to-[#111] rounded-3xl border border-white/10 p-8 flex flex-col justify-between relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          
          <div>
            <h2 className="text-xl font-bold mb-8 text-white flex items-center gap-3">
              <div className="p-2.5 bg-green-500/20 rounded-lg">
                <TrendingUp size={20} className="text-green-400" />
              </div>
              Итого за всё время
            </h2>
            
            <div className="space-y-4 relative z-10">
              <div className="flex justify-between items-center group">
                <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Выручка</span>
                <span className="font-medium text-white">{formatCurrency(totalAllTime.revenue)}</span>
              </div>
              <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
              
              <div className="flex justify-between items-center group">
                <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Расходы МП</span>
                <span className="font-medium text-white">{formatCurrency(totalAllTime.mpExpenses)}</span>
              </div>
              <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
              
              <div className="flex justify-between items-center group">
                <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Себестоимость</span>
                <span className="font-medium text-white">{formatCurrency(totalAllTime.costPrice)}</span>
              </div>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-white/10 relative z-10">
            <div className="text-sm text-green-400/80 mb-1 font-medium uppercase tracking-wider">Общая прибыль</div>
            <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">
              {formatCurrency(totalAllTime.total)}
            </div>
          </div>
        </div>
      </div>

      {/* Months Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
        {dynamicMonths.map(month => (
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
                <span className="font-medium">{formatCurrency(month.dynamicMpExpenses)}</span>
              </div>
              <div className="flex justify-between items-center bg-[#222] p-2.5 rounded-lg border border-white/5 text-sm">
                <span className="text-gray-400">Себе-сть:</span>
                <span className="font-medium">{formatCurrency(month.dynamicCostPrice)}</span>
              </div>
              <div className="flex justify-between items-center bg-[#222] p-2.5 rounded-lg border border-white/5 text-sm mt-4">
                <span className="text-gray-300 font-medium">Итого:</span>
                <span className="font-bold text-white">{formatCurrency(month.dynamicTotal)}</span>
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
            setSelectedExpenseGroupId('all');
            setSelectedCostGroupId('all');
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
