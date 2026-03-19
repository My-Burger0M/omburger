import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
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

export default function OFR() {
  const [activeTab, setActiveTab] = useState<'expenses' | 'cost'>('expenses');
  const [expenseGroups, setExpenseGroups] = useState<ExpenseGroup[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupData, setEditingGroupData] = useState<ExpenseGroup | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;

    const unsubscribe = onSnapshot(
      collection(db, 'users', auth.currentUser.uid, 'ofr_expenses'),
      (snapshot) => {
        const groups: ExpenseGroup[] = [];
        snapshot.forEach((doc) => {
          groups.push({ id: doc.id, ...doc.data() } as ExpenseGroup);
        });
        // Sort by createdAt descending
        groups.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
        setExpenseGroups(groups);
      }
    );

    return () => unsubscribe();
  }, []);

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
    setEditingGroupData(JSON.parse(JSON.stringify(group))); // Deep copy
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

  const calculateTotal = (items: ExpenseItem[]) => {
    return items.reduce((sum, item) => sum + item.amount, 0);
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
            <div key={group.id} className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-4">
              {editingGroupId === group.id && editingGroupData ? (
                // Edit Mode
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <input
                      type="text"
                      value={editingGroupData.title}
                      onChange={(e) => setEditingGroupData({...editingGroupData, title: e.target.value})}
                      className="flex-1 bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#a855f7]"
                      placeholder="Например Март 2026:"
                    />
                    <div className="bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white flex items-center min-w-[200px]">
                      Итого: {formatCurrency(calculateTotal(editingGroupData.items))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {editingGroupData.items.map(item => (
                      <div key={item.id} className="flex gap-4 items-center">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                          className="flex-1 bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#a855f7]"
                          placeholder="Налог"
                        />
                        <input
                          type="text"
                          value={item.amount}
                          onChange={(e) => handleUpdateItem(item.id, 'amount', e.target.value)}
                          className="w-48 bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#a855f7]"
                          placeholder="-30000"
                        />
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-3 bg-red-500/20 text-red-500 hover:bg-red-500/30 rounded-xl transition-colors"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}

                    {/* Add new item row */}
                    <div className="flex gap-4 items-center">
                      <input
                        type="text"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddItem()}
                        className="flex-1 bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#a855f7]"
                        placeholder="Название расходника"
                      />
                      <input
                        type="text"
                        value={newItemAmount}
                        onChange={(e) => setNewItemAmount(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddItem()}
                        className="w-48 bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#a855f7]"
                        placeholder="Цена"
                      />
                      <button
                        onClick={handleAddItem}
                        disabled={!newItemName.trim() || !newItemAmount.trim()}
                        className="p-3 bg-green-500/20 text-green-500 hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <button
                      onClick={cancelEditing}
                      className="px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                      <X size={16} /> Отмена
                    </button>
                    <button
                      onClick={saveEditing}
                      className="px-4 py-2 bg-[#a855f7] hover:bg-[#9333ea] text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Save size={16} /> Сохранить
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="flex items-center justify-between">
                  <span className="text-lg">{group.title}</span>
                  <div className="flex items-center gap-4">
                    <div className="bg-[#2a2a2a] px-4 py-2 rounded-lg text-gray-300">
                      Всего: {formatCurrency(calculateTotal(group.items))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditing(group)}
                        className="p-2 bg-[#2a2a2a] hover:bg-[#333] text-gray-400 hover:text-white rounded-lg transition-colors"
                      >
                        <Edit2 size={20} />
                      </button>
                      <button
                        onClick={() => handleCopyGroup(group)}
                        className="p-2 bg-[#2a2a2a] hover:bg-[#333] text-gray-400 hover:text-white rounded-lg transition-colors"
                      >
                        <Copy size={20} />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {!editingGroupId && (
            <button
              onClick={handleAddGroup}
              className="w-full py-4 bg-[#2a2a2a] hover:bg-[#333] text-gray-400 hover:text-white rounded-2xl border border-white/5 transition-colors flex items-center justify-center gap-2"
            >
              Добавить
            </button>
          )}
        </div>
      )}

      {activeTab === 'cost' && (
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-8 text-center text-gray-500">
          Раздел в разработке
        </div>
      )}
    </div>
  );
}
