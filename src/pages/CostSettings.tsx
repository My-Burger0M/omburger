import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Copy, Trash2, Save, X, ChevronLeft } from 'lucide-react';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface CostMaterial {
  id: string;
  name: string;
  purchasePrice: number | string;
  unitsPerPurchase: number | string;
  defectPercent: number | string;
}

interface CostSetting {
  id: string;
  name: string;
  materials: CostMaterial[];
  totalCost: number;
  createdAt: any;
}

export default function CostSettings() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [costSettings, setCostSettings] = useState<CostSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Editor State
  const [isEditing, setIsEditing] = useState(false);
  const [currentSetting, setCurrentSetting] = useState<CostSetting | null>(null);

  useEffect(() => {
    fetchCostSettings();
  }, [currentUser]);

  const fetchCostSettings = async () => {
    if (!currentUser) return;
    try {
      const q = query(collection(db, 'users', currentUser.uid, 'cost_settings'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CostSetting[];
      setCostSettings(data);
    } catch (error) {
      console.error("Error fetching cost settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateMaterialTotal = (material: CostMaterial) => {
    const price = Number(material.purchasePrice) || 0;
    const units = Number(material.unitsPerPurchase) || 1;
    const defect = Number(material.defectPercent) || 0;
    
    if (units === 0) return 0;
    
    const baseCost = price / units;
    const totalCost = baseCost * (1 + defect / 100);
    return Number(totalCost.toFixed(2));
  };

  const calculateTotalCost = (materials: CostMaterial[]) => {
    return materials.reduce((sum, mat) => sum + calculateMaterialTotal(mat), 0);
  };

  const handleAddSetting = () => {
    setCurrentSetting({
      id: '',
      name: '',
      materials: [
        { id: Date.now().toString(), name: '', purchasePrice: '', unitsPerPurchase: '', defectPercent: '' }
      ],
      totalCost: 0,
      createdAt: new Date()
    });
    setIsEditing(true);
  };

  const handleEditSetting = (setting: CostSetting) => {
    setCurrentSetting(JSON.parse(JSON.stringify(setting))); // Deep copy
    setIsEditing(true);
  };

  const handleCopySetting = async (setting: CostSetting) => {
    if (!currentUser) return;
    try {
      const newSetting = {
        name: `${setting.name} (Копия)`,
        materials: setting.materials,
        totalCost: setting.totalCost,
        createdAt: new Date()
      };
      await addDoc(collection(db, 'users', currentUser.uid, 'cost_settings'), newSetting);
      fetchCostSettings();
    } catch (error) {
      console.error("Error copying setting:", error);
      alert("Ошибка при копировании");
    }
  };

  const handleDeleteSetting = async (id: string) => {
    if (!currentUser || !window.confirm('Удалить эту себестоимость?')) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'cost_settings', id));
      fetchCostSettings();
    } catch (error) {
      console.error("Error deleting setting:", error);
      alert("Ошибка при удалении");
    }
  };

  const handleSaveSetting = async () => {
    if (!currentUser || !currentSetting) return;
    
    if (!currentSetting.name.trim()) {
      alert('Введите название товара');
      return;
    }

    try {
      const totalCost = calculateTotalCost(currentSetting.materials);
      const settingData = {
        name: currentSetting.name,
        materials: currentSetting.materials,
        totalCost,
        updatedAt: new Date()
      };

      if (currentSetting.id) {
        // Update
        await updateDoc(doc(db, 'users', currentUser.uid, 'cost_settings', currentSetting.id), settingData);
      } else {
        // Create
        await addDoc(collection(db, 'users', currentUser.uid, 'cost_settings'), {
          ...settingData,
          createdAt: new Date()
        });
      }
      
      setIsEditing(false);
      setCurrentSetting(null);
      fetchCostSettings();
    } catch (error) {
      console.error("Error saving setting:", error);
      alert("Ошибка при сохранении");
    }
  };

  const updateMaterial = (id: string, field: keyof CostMaterial, value: string) => {
    if (!currentSetting) return;
    const updatedMaterials = currentSetting.materials.map(mat => {
      if (mat.id === id) {
        return { ...mat, [field]: value };
      }
      return mat;
    });
    setCurrentSetting({ ...currentSetting, materials: updatedMaterials });
  };

  const addMaterial = () => {
    if (!currentSetting) return;
    setCurrentSetting({
      ...currentSetting,
      materials: [
        ...currentSetting.materials,
        { id: Date.now().toString(), name: '', purchasePrice: '', unitsPerPurchase: '', defectPercent: '' }
      ]
    });
  };

  const removeMaterial = (id: string) => {
    if (!currentSetting) return;
    setCurrentSetting({
      ...currentSetting,
      materials: currentSetting.materials.filter(mat => mat.id !== id)
    });
  };

  if (isEditing && currentSetting) {
    const totalCost = calculateTotalCost(currentSetting.materials);

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => setIsEditing(false)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-3xl font-bold">Настройки Себестоимости</h1>
          <div className="ml-auto flex gap-3">
            <button 
              onClick={addMaterial}
              className="bg-green-700 hover:bg-green-600 text-white p-3 rounded-xl transition-colors flex items-center justify-center"
              title="Добавить расходник"
            >
              <Plus size={24} />
            </button>
            <button 
              onClick={handleSaveSetting}
              className="bg-white text-black font-bold px-6 py-3 rounded-xl hover:bg-gray-200 transition-colors"
            >
              Сохранить
            </button>
          </div>
        </div>

        <div className="bg-[#1a1a1a] rounded-3xl border border-white/10 p-6 space-y-4">
          <div className="flex gap-4 items-center">
            <input 
              type="text"
              value={currentSetting.name}
              onChange={(e) => setCurrentSetting({...currentSetting, name: e.target.value})}
              placeholder="Название товара:"
              className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="bg-[#2a2a2a] border border-white/5 rounded-xl px-6 py-4 flex items-center justify-center min-w-[200px]">
              <span className="text-gray-400 mr-2">Итого:</span>
              <span className="text-xl font-bold">{totalCost.toFixed(2)} ₽</span>
            </div>
          </div>

          <div className="space-y-3 mt-6">
            {currentSetting.materials.map((mat) => (
              <div key={mat.id} className="flex gap-3 items-center">
                <input 
                  type="text"
                  value={mat.name}
                  onChange={(e) => updateMaterial(mat.id, 'name', e.target.value)}
                  placeholder="Название расходника"
                  className="flex-[2] bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <input 
                  type="number"
                  value={mat.purchasePrice}
                  onChange={(e) => updateMaterial(mat.id, 'purchasePrice', e.target.value)}
                  placeholder="Цена закупки"
                  className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <input 
                  type="number"
                  value={mat.unitsPerPurchase}
                  onChange={(e) => updateMaterial(mat.id, 'unitsPerPurchase', e.target.value)}
                  placeholder="Хватит на ед. товара"
                  className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <div className="flex-1 relative">
                  <input 
                    type="number"
                    value={mat.defectPercent}
                    onChange={(e) => updateMaterial(mat.id, 'defectPercent', e.target.value)}
                    placeholder="Износ (брак)"
                    className="w-full bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 pr-8 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                </div>
                <div className="flex-1 bg-[#2a2a2a] border border-white/5 rounded-xl px-4 py-3 flex items-center text-gray-300">
                  {calculateMaterialTotal(mat).toFixed(2)} ₽
                </div>
                <button 
                  onClick={() => removeMaterial(mat.id)}
                  className="bg-red-900/50 hover:bg-red-600 text-red-400 hover:text-white p-3 rounded-xl transition-colors flex-shrink-0"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={() => navigate('/products')}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-3xl font-bold">Настройки Себестоимости</h1>
      </div>

      <div className="space-y-4">
        {costSettings.map((setting) => (
          <div key={setting.id} className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-4 flex items-center justify-between group hover:border-white/10 transition-colors">
            <div className="text-lg font-medium pl-4">{setting.name}</div>
            
            <div className="flex items-center gap-4">
              <div className="bg-[#2a2a2a] px-6 py-3 rounded-xl text-gray-300">
                Себестоимость: <span className="font-bold text-white">{setting.totalCost.toFixed(2)} ₽</span>
              </div>
              
              <button 
                onClick={() => handleEditSetting(setting)}
                className="bg-[#2a2a2a] hover:bg-[#333] p-3 rounded-xl transition-colors text-gray-400 hover:text-white"
              >
                <Edit2 size={20} />
              </button>
              <button 
                onClick={() => handleCopySetting(setting)}
                className="bg-[#2a2a2a] hover:bg-[#333] p-3 rounded-xl transition-colors text-gray-400 hover:text-white"
              >
                <Copy size={20} />
              </button>
              <button 
                onClick={() => handleDeleteSetting(setting.id)}
                className="bg-red-900/30 hover:bg-red-600 p-3 rounded-xl transition-colors text-red-400 hover:text-white"
              >
                <Trash2 size={20} />
              </button>
            </div>
          </div>
        ))}

        <button 
          onClick={handleAddSetting}
          className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-white/5 rounded-2xl py-6 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
        >
          <span className="text-lg font-medium">Добавить</span>
        </button>
      </div>
    </div>
  );
}
