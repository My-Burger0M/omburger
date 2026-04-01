import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Plus, Trash2, Edit2, Copy, Save, X } from 'lucide-react';

interface ExpenseItem {
  id: string;
  name: string;
  amount: number;
}

interface ExpenseGroup {
  id: string;
  title: string;
  items: ExpenseItem[];
  createdAt: any;
}

interface CostSetting {
  id: string;
  name: string;
  totalCost: number;
}

interface CostItem {
  id: string;
  name: string;
  price: number;
  costSettingId: string;
}

interface CostGroup {
  id: string;
  title: string;
  items: CostItem[];
  createdAt: any;
}

export default function OFR() {
  const [activeTab, setActiveTab] = useState<'expenses' | 'cost'>('expenses');
  
  // Expenses State
  const [expenseGroups, setExpenseGroups] = useState<ExpenseGroup[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupData, setEditingGroupData] = useState<ExpenseGroup | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');

  // Cost State
  const [costGroups, setCostGroups] = useState<CostGroup[]>([]);
  const [costSettings, setCostSettings] = useState<CostSetting[]>([]);
  const [editingCostGroupId, setEditingCostGroupId] = useState<string | null>(null);
  const [editingCostGroupData, setEditingCostGroupData] = useState<CostGroup | null>(null);
  const [newCostItemName, setNewCostItemName] = useState('');
  const [newCostItemPrice, setNewCostItemPrice] = useState('');
  const [newCostItemSettingId, setNewCostItemSettingId] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;

    // Fetch Expenses
    const unsubscribeExpenses = onSnapshot(
      collection(db, 'users', auth.currentUser.uid, 'ofr_expenses'),
      (snapshot) => {
        const groups: ExpenseGroup[] = [];
        snapshot.forEach((doc) => {
          groups.push({ id: doc.id, ...doc.data() } as ExpenseGroup);
        });
        groups.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
        setExpenseGroups(groups);
      }
    );

    // Fetch Cost Groups
    const unsubscribeCosts = onSnapshot(
      collection(db, 'users', auth.currentUser.uid, 'ofr_costs'),
      (snapshot) => {
        const groups: CostGroup[] = [];
        snapshot.forEach((doc) => {
          groups.push({ id: doc.id, ...doc.data() } as CostGroup);
        });
        groups.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
        setCostGroups(groups);
      }
    );

    // Fetch Cost Settings
    const qSettings = query(collection(db, 'users', auth.currentUser.uid, 'cost_settings'), orderBy('createdAt', 'desc'));
    const unsubscribeSettings = onSnapshot(qSettings, (snapshot) => {
      const settings: CostSetting[] = [];
      snapshot.forEach((doc) => {
        settings.push({ id: doc.id, ...doc.data() } as CostSetting);
      });
      setCostSettings(settings);
    });

    return () => {
      unsubscribeExpenses();
      unsubscribeCosts();
      unsubscribeSettings();
    };
  }, []);

  // --- Expenses Methods ---
  const handleAddGroup = async () => {
    if (!auth.currentUser) return;
    try {
      const newGroup = {
        title: 'Новый расход',
        items: [],
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'ofr_expenses'), newGroup);
    } catch (error) {
      console.error('Error adding group:', error);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!auth.currentUser) return;
    if (!window.confirm('Удалить эту группу расходов?')) return;
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'ofr_expenses', id));
    } catch (error) {
      console.error('Error deleting group:', error);
    }
  };

  const handleCopyGroup = async (group: ExpenseGroup) => {
    if (!auth.currentUser) return;
    try {
      const newGroup = {
        title: `${group.title} (копия)`,
        items: group.items,
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'ofr_expenses'), newGroup);
    } catch (error) {
      console.error('Error copying group:', error);
    }
  };

  const startEditing = (group: ExpenseGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupData(JSON.parse(JSON.stringify(group)));
  };

  const cancelEditing = () => {
    setEditingGroupId(null);
    setEditingGroupData(null);
    setNewItemName('');
    setNewItemAmount('');
  };

  const saveEditing = async () => {
    if (!auth.currentUser || !editingGroupData) return;
    try {
      await updateDoc(
        doc(db, 'users', auth.currentUser.uid, 'ofr_expenses', editingGroupData.id),
        {
          title: editingGroupData.title,
          items: editingGroupData.items
        }
      );
      setEditingGroupId(null);
      setEditingGroupData(null);
      setNewItemName('');
      setNewItemAmount('');
    } catch (error) {
      console.error('Error saving group:', error);
    }
  };

  const handleAddItem = () => {
    if (!editingGroupData || !newItemName.trim() || !newItemAmount.trim()) return;
    
    const amount = parseFloat(newItemAmount.replace(/\s/g, ''));
    if (isNaN(amount)) return;

    setEditingGroupData({
      ...editingGroupData,
      items: [
        ...editingGroupData.items,
        {
          id: Date.now().toString(),
          name: newItemName.trim(),
          amount: amount
        }
      ]
    });
    setNewItemName('');
    setNewItemAmount('');
  };

  const handleDeleteItem = (itemId: string) => {
    if (!editingGroupData) return;
    setEditingGroupData({
      ...editingGroupData,
      items: editingGroupData.items.filter(item => item.id !== itemId)
    });
  };

  const handleUpdateItem = (itemId: string, field: 'name' | 'amount', value: string) => {
    if (!editingGroupData) return;
    
    setEditingGroupData({
      ...editingGroupData,
      items: editingGroupData.items.map(item => {
        if (item.id === itemId) {
          if (field === 'amount') {
            const numValue = parseFloat(value.replace(/\s/g, ''));
            return { ...item, amount: isNaN(numValue) ? 0 : numValue };
          }
          return { ...item, name: value };
        }
        return item;
      })
    });
  };

  // --- Cost Methods ---
  const handleAddCostGroup = async () => {
    if (!auth.currentUser) return;
    try {
      const newGroup = {
        title: 'Новый расчет',
        items: [],
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'ofr_costs'), newGroup);
    } catch (error) {
      console.error('Error adding cost group:', error);
    }
  };

  const handleDeleteCostGroup = async (id: string) => {
    if (!auth.currentUser) return;
    if (!window.confirm('Удалить эту группу расчетов?')) return;
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'ofr_costs', id));
    } catch (error) {
      console.error('Error deleting cost group:', error);
    }
  };

  const handleCopyCostGroup = async (group: CostGroup) => {
    if (!auth.currentUser) return;
    try {
      const newGroup = {
        title: `${group.title} (копия)`,
        items: group.items,
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'ofr_costs'), newGroup);
    } catch (error) {
      console.error('Error copying cost group:', error);
    }
  };

  const startEditingCost = (group: CostGroup) => {
    setEditingCostGroupId(group.id);
    setEditingCostGroupData(JSON.parse(JSON.stringify(group)));
  };

  const cancelEditingCost = () => {
    setEditingCostGroupId(null);
    setEditingCostGroupData(null);
    setNewCostItemName('');
    setNewCostItemPrice('');
    setNewCostItemSettingId('');
  };

  const saveEditingCost = async () => {
    if (!auth.currentUser || !editingCostGroupData) return;
    try {
      await updateDoc(
        doc(db, 'users', auth.currentUser.uid, 'ofr_costs', editingCostGroupData.id),
        {
          title: editingCostGroupData.title,
          items: editingCostGroupData.items
        }
      );
      setEditingCostGroupId(null);
      setEditingCostGroupData(null);
      setNewCostItemName('');
      setNewCostItemPrice('');
      setNewCostItemSettingId('');
    } catch (error) {
      console.error('Error saving cost group:', error);
    }
  };

  const handleAddCostItem = () => {
    if (!editingCostGroupData || !newCostItemName.trim() || !newCostItemPrice.trim() || !newCostItemSettingId) return;
    
    const price = parseFloat(newCostItemPrice.replace(/\s/g, ''));
    if (isNaN(price)) return;

    setEditingCostGroupData({
      ...editingCostGroupData,
      items: [
        ...editingCostGroupData.items,
        {
          id: Date.now().toString(),
          name: newCostItemName.trim(),
          price: price,
          costSettingId: newCostItemSettingId
        }
      ]
    });
    setNewCostItemName('');
    setNewCostItemPrice('');
    setNewCostItemSettingId('');
  };

  const handleDeleteCostItem = (itemId: string) => {
    if (!editingCostGroupData) return;
    setEditingCostGroupData({
      ...editingCostGroupData,
      items: editingCostGroupData.items.filter(item => item.id !== itemId)
    });
  };

  const handleUpdateCostItem = (itemId: string, field: 'name' | 'price' | 'costSettingId', value: string) => {
    if (!editingCostGroupData) return;
    
    setEditingCostGroupData({
      ...editingCostGroupData,
      items: editingCostGroupData.items.map(item => {
        if (item.id === itemId) {
          if (field === 'price') {
            const numValue = parseFloat(value.replace(/\s/g, ''));
            return { ...item, price: isNaN(numValue) ? 0 : numValue };
          }
          return { ...item, [field]: value };
        }
        return item;
      })
    });
  };

  const calculateTotal = (items: ExpenseItem[]) => {
    return items.reduce((sum, item) => sum + item.amount, 0);
  };

  const calculateCostProfit = (item: CostItem) => {
    const setting = costSettings.find(s => s.id === item.costSettingId);
    const cost = setting ? setting.totalCost : 0;
    return item.price - cost;
  };

  const calculateTotalCostProfit = (items: CostItem[]) => {
    return items.reduce((sum, item) => sum + calculateCostProfit(item), 0);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Отчет о финансовых результатах</h1>

      {/* Tabs */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-6 py-3 rounded-xl font-medium transition-colors ${
            activeTab === 'expenses' 
              ? 'bg-[#a855f7] text-white' 
              : 'bg-[#2a2a2a] text-gray-400 hover:bg-[#333]'
          }`}
        >
          Расходы
        </button>
        <button
          onClick={() => setActiveTab('cost')}
          className={`px-6 py-3 rounded-xl font-medium transition-colors ${
            activeTab === 'cost' 
              ? 'bg-[#a855f7] text-white' 
              : 'bg-[#2a2a2a] text-gray-400 hover:bg-[#333]'
          }`}
        >
          Себестоимость
        </button>
      </div>

      {activeTab === 'expenses' && (
        <div className="space-y-4">
          {expenseGroups.map(group => (
            <div key={group.id} className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-4 group hover:border-white/10 transition-colors">
              {editingGroupId === group.id && editingGroupData ? (
                // Edit Mode
                <div className="space-y-4">
                  <div className="flex gap-4 items-center">
                    <input
                      type="text"
                      value={editingGroupData.title}
                      onChange={(e) => setEditingGroupData({...editingGroupData, title: e.target.value})}
                      className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Например Март 2026:"
                    />
                    <div className="bg-[#2a2a2a] border border-white/5 rounded-xl px-6 py-4 flex items-center justify-center min-w-[200px]">
                      <span className="text-gray-400 mr-2">Итого:</span>
                      <span className="text-xl font-bold">{formatCurrency(calculateTotal(editingGroupData.items))}</span>
                    </div>
                  </div>

                  <div className="space-y-3 mt-6">
                    {editingGroupData.items.map(item => (
                      <div key={item.id} className="flex gap-3 items-center">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                          className="flex-[2] bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="Налог"
                        />
                        <input
                          type="text"
                          value={item.amount}
                          onChange={(e) => handleUpdateItem(item.id, 'amount', e.target.value)}
                          className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="-30000"
                        />
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="bg-red-900/50 hover:bg-red-600 text-red-400 hover:text-white p-3 rounded-xl transition-colors flex-shrink-0"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}

                    {/* Add new item row */}
                    <div className="flex gap-3 items-center">
                      <input
                        type="text"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddItem()}
                        className="flex-[2] bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Название расходника"
                      />
                      <input
                        type="text"
                        value={newItemAmount}
                        onChange={(e) => setNewItemAmount(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddItem()}
                        className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Цена"
                      />
                      <button
                        onClick={handleAddItem}
                        disabled={!newItemName.trim() || !newItemAmount.trim()}
                        className="bg-green-700 hover:bg-green-600 text-white p-3 rounded-xl transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      onClick={cancelEditing}
                      className="px-6 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors flex items-center gap-2"
                    >
                      <X size={20} /> Отмена
                    </button>
                    <button
                      onClick={saveEditing}
                      className="bg-white text-black font-bold px-6 py-3 rounded-xl hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                      <Save size={20} /> Сохранить
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="flex items-center justify-between">
                  <div className="text-lg font-medium pl-4">{group.title}</div>
                  <div className="flex items-center gap-4">
                    <div className="bg-[#2a2a2a] px-6 py-3 rounded-xl text-gray-300">
                      Всего: <span className="font-bold text-white">{formatCurrency(calculateTotal(group.items))}</span>
                    </div>
                    
                    <button
                      onClick={() => startEditing(group)}
                      className="bg-[#2a2a2a] hover:bg-[#333] p-3 rounded-xl transition-colors text-gray-400 hover:text-white"
                    >
                      <Edit2 size={20} />
                    </button>
                    <button
                      onClick={() => handleCopyGroup(group)}
                      className="bg-[#2a2a2a] hover:bg-[#333] p-3 rounded-xl transition-colors text-gray-400 hover:text-white"
                    >
                      <Copy size={20} />
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(group.id)}
                      className="bg-red-900/30 hover:bg-red-600 p-3 rounded-xl transition-colors text-red-400 hover:text-white"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {!editingGroupId && (
            <button
              onClick={handleAddGroup}
              className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-white/5 rounded-2xl py-6 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            >
              <span className="text-lg font-medium">Добавить</span>
            </button>
          )}
        </div>
      )}

      {activeTab === 'cost' && (
        <div className="space-y-4">
          {costGroups.map(group => (
            <div key={group.id} className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-4 group hover:border-white/10 transition-colors">
              {editingCostGroupId === group.id && editingCostGroupData ? (
                // Edit Mode
                <div className="space-y-4">
                  <div className="flex gap-4 items-center">
                    <input
                      type="text"
                      value={editingCostGroupData.title}
                      onChange={(e) => setEditingCostGroupData({...editingCostGroupData, title: e.target.value})}
                      className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Название расчета:"
                    />
                    <div className="bg-[#2a2a2a] border border-white/5 rounded-xl px-6 py-4 flex items-center justify-center min-w-[200px]">
                      <span className="text-gray-400 mr-2">Итого профит:</span>
                      <span className="text-xl font-bold text-green-400">{formatCurrency(calculateTotalCostProfit(editingCostGroupData.items))}</span>
                    </div>
                  </div>

                  <div className="space-y-3 mt-6">
                    {editingCostGroupData.items.map(item => {
                      const profit = calculateCostProfit(item);
                      return (
                        <div key={item.id} className="flex gap-3 items-center">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleUpdateCostItem(item.id, 'name', e.target.value)}
                            className="flex-[2] bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="Название товара"
                          />
                          <input
                            type="text"
                            value={item.price}
                            onChange={(e) => handleUpdateCostItem(item.id, 'price', e.target.value)}
                            className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="Цена"
                          />
                          <select
                            value={item.costSettingId}
                            onChange={(e) => handleUpdateCostItem(item.id, 'costSettingId', e.target.value)}
                            className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                          >
                            <option value="">Выберите себестоимость</option>
                            {costSettings.map(setting => (
                              <option key={setting.id} value={setting.id}>
                                {setting.name} ({formatCurrency(setting.totalCost)})
                              </option>
                            ))}
                          </select>
                          <div className={`w-32 text-right font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(profit)}
                          </div>
                          <button
                            onClick={() => handleDeleteCostItem(item.id)}
                            className="bg-red-900/50 hover:bg-red-600 text-red-400 hover:text-white p-3 rounded-xl transition-colors flex-shrink-0"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                      );
                    })}

                    {/* Add new item row */}
                    <div className="flex gap-3 items-center">
                      <input
                        type="text"
                        value={newCostItemName}
                        onChange={(e) => setNewCostItemName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddCostItem()}
                        className="flex-[2] bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Название товара"
                      />
                      <input
                        type="text"
                        value={newCostItemPrice}
                        onChange={(e) => setNewCostItemPrice(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddCostItem()}
                        className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Цена"
                      />
                      <select
                        value={newCostItemSettingId}
                        onChange={(e) => setNewCostItemSettingId(e.target.value)}
                        className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="">Выберите себестоимость</option>
                        {costSettings.map(setting => (
                          <option key={setting.id} value={setting.id}>
                            {setting.name} ({formatCurrency(setting.totalCost)})
                          </option>
                        ))}
                      </select>
                      <div className="w-32"></div>
                      <button
                        onClick={handleAddCostItem}
                        disabled={!newCostItemName.trim() || !newCostItemPrice.trim() || !newCostItemSettingId}
                        className="bg-green-700 hover:bg-green-600 text-white p-3 rounded-xl transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      onClick={cancelEditingCost}
                      className="px-6 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors flex items-center gap-2"
                    >
                      <X size={20} /> Отмена
                    </button>
                    <button
                      onClick={saveEditingCost}
                      className="bg-white text-black font-bold px-6 py-3 rounded-xl hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                      <Save size={20} /> Сохранить
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="flex items-center justify-between">
                  <div className="text-lg font-medium pl-4">{group.title}</div>
                  <div className="flex items-center gap-4">
                    <div className="bg-[#2a2a2a] px-6 py-3 rounded-xl text-gray-300">
                      Итого профит: <span className="font-bold text-green-400">{formatCurrency(calculateTotalCostProfit(group.items))}</span>
                    </div>
                    
                    <button
                      onClick={() => startEditingCost(group)}
                      className="bg-[#2a2a2a] hover:bg-[#333] p-3 rounded-xl transition-colors text-gray-400 hover:text-white"
                    >
                      <Edit2 size={20} />
                    </button>
                    <button
                      onClick={() => handleCopyCostGroup(group)}
                      className="bg-[#2a2a2a] hover:bg-[#333] p-3 rounded-xl transition-colors text-gray-400 hover:text-white"
                    >
                      <Copy size={20} />
                    </button>
                    <button
                      onClick={() => handleDeleteCostGroup(group.id)}
                      className="bg-red-900/30 hover:bg-red-600 p-3 rounded-xl transition-colors text-red-400 hover:text-white"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {!editingCostGroupId && (
            <button
              onClick={handleAddCostGroup}
              className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-white/5 rounded-2xl py-6 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            >
              <span className="text-lg font-medium">Добавить расчет</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
