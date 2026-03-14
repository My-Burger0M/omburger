import React, { useState, useEffect, useRef } from 'react';
import { Plus, Info, Package, X, Upload, Image as ImageIcon, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { resizeImage } from '../utils/image';

interface Product {
  id: string;
  name: string;
  costPrice: number;
  costSettingId?: string;
  imageUrl: string;
  marketplace: 'wb' | 'ozon' | 'manual';
  apiToken?: string;
  apiWb?: string;
  apiOzon?: string;
  salesPercent: number;
}

interface CostSetting {
  id: string;
  name: string;
  totalCost: number;
}

export default function Products() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [costSettings, setCostSettings] = useState<CostSetting[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Stats
  const [stats, setStats] = useState({ total: 0, wb: 0, ozon: 0 });
  
  // Form State
  const [newProduct, setNewProduct] = useState({
    name: '',
    costSettingId: '',
    costPrice: '',
    imageUrl: '',
    marketplace: 'wb',
    apiWb: '',
    apiOzon: ''
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  useEffect(() => {
    fetchProducts();
    fetchCostSettings();
  }, [currentUser]);

  const fetchCostSettings = async () => {
    if (!currentUser) return;
    try {
      const q = query(collection(db, 'users', currentUser.uid, 'cost_settings'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        totalCost: doc.data().totalCost
      })) as CostSetting[];
      setCostSettings(data);
    } catch (error) {
      console.error("Error fetching cost settings:", error);
    }
  };

  const fetchProducts = async () => {
    if (!currentUser) return;
    try {
      const q = query(collection(db, 'users', currentUser.uid, 'products'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const productsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Product[];
      setProducts(productsData);
      
      // Calculate stats
      let total = 0, wb = 0, ozon = 0;
      productsData.forEach(p => {
        if (p.salesPercent) {
          total += p.salesPercent;
          if (p.apiWb) wb += p.salesPercent;
          if (p.apiOzon) ozon += p.salesPercent;
        }
      });
      setStats({ total, wb, ozon });
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddProduct = async () => {
    if (!currentUser) return;
    if (!newProduct.name || !newProduct.costSettingId) {
      alert('Пожалуйста, заполните обязательные поля (Название, Список стоимости)');
      return;
    }

    try {
      let finalImageUrl = newProduct.imageUrl || 'https://via.placeholder.com/300';
      
      if (selectedFile) {
        // Resize image to max 1200x1600 (3:4 aspect ratio target)
        finalImageUrl = await resizeImage(selectedFile, 1200, 1600);
      }

      const setting = costSettings.find(s => s.id === newProduct.costSettingId);
      if (!setting) {
        alert('Выбранный список стоимости не найден');
        return;
      }
      const costPrice = setting.totalCost;

      await addDoc(collection(db, 'users', currentUser.uid, 'products'), {
        name: newProduct.name,
        costPrice: costPrice,
        costSettingId: newProduct.costSettingId,
        imageUrl: finalImageUrl,
        marketplace: newProduct.marketplace,
        apiWb: newProduct.apiWb,
        apiOzon: newProduct.apiOzon,
        salesPercent: 0, // Default for now
        createdAt: new Date()
      });
      
      setIsModalOpen(false);
      setNewProduct({ name: '', costSettingId: '', costPrice: '', imageUrl: '', marketplace: 'wb', apiWb: '', apiOzon: '' });
      setSelectedFile(null);
      setPreviewUrl('');
      fetchProducts();
    } catch (error) {
      console.error("Error adding product:", error);
      alert('Ошибка при добавлении товара');
    }
  };

  const handleDeleteProduct = async () => {
    if (!currentUser || !productToDelete) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'products', productToDelete));
      setProductToDelete(null);
      fetchProducts();
    } catch (error) {
      console.error("Error deleting product:", error);
      alert("Ошибка при удалении товара");
    }
  };

  const handleSync = async () => {
    if (!currentUser) return;
    setIsSyncing(true);
    
    try {
      // Simulate API fetch delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      let updatedProducts = [...products];
      let newTotal = 0, newWb = 0, newOzon = 0;

      for (let i = 0; i < updatedProducts.length; i++) {
        const p = updatedProducts[i];
        if (p.apiWb || p.apiOzon) {
          // Mock sales calculation based on API connection
          const mockSales = Math.floor(Math.random() * 50) + 10;
          
          await updateDoc(doc(db, 'users', currentUser.uid, 'products', p.id), {
            salesPercent: mockSales
          });
          
          updatedProducts[i] = { ...p, salesPercent: mockSales };
          
          newTotal += mockSales;
          if (p.apiWb) newWb += mockSales;
          if (p.apiOzon) newOzon += mockSales;
        } else if (p.salesPercent) {
          newTotal += p.salesPercent;
        }
      }
      
      setProducts(updatedProducts);
      setStats({ total: newTotal, wb: newWb, ozon: newOzon });
    } catch (error) {
      console.error("Error syncing with API:", error);
      alert("Ошибка при синхронизации с API");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Товары</h1>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Sales */}
        <div className="bg-[#1a1a1a] rounded-2xl p-4 flex items-center justify-between border border-white/5 relative overflow-hidden group">
          <div className="z-10">
            <div className="text-gray-400 text-sm mb-1">Продаж в сумме:</div>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
          </div>
          <div className="bg-[#2a2a2a] p-3 rounded-xl text-gray-400">
            <Package size={24} />
          </div>
        </div>

        {/* WB Sales */}
        <div className="bg-[#1a1a1a] rounded-2xl p-4 flex items-center justify-between border border-white/5 relative overflow-hidden">
          <div className="z-10">
            <div className="text-gray-400 text-sm mb-1">Продаж Wildberries:</div>
            <div className="text-2xl font-bold text-white">{stats.wb}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-600 to-fuchsia-600 p-3 rounded-xl text-white font-bold text-lg w-12 h-12 flex items-center justify-center">
            WB
          </div>
        </div>

        {/* Ozon Sales */}
        <div className="bg-[#1a1a1a] rounded-2xl p-4 flex items-center justify-between border border-white/5 relative overflow-hidden">
          <div className="z-10">
            <div className="text-gray-400 text-sm mb-1">Продаж OZON:</div>
            <div className="text-2xl font-bold text-white">{stats.ozon}</div>
          </div>
          <div className="bg-gradient-to-br from-blue-500 to-red-500 p-3 rounded-xl text-white font-bold text-lg w-12 h-12 flex items-center justify-center">
            OZ
          </div>
        </div>

        {/* Cost Settings */}
        <div className="bg-[#1a1a1a] rounded-2xl p-4 flex items-center justify-between border border-white/5 relative">
          <div className="z-10">
            <div className="text-gray-400 text-sm mb-1">Настройки</div>
            <div className="text-lg font-medium text-white">Себестоимости</div>
          </div>
          <div className="flex gap-2">
            <button className="bg-[#2a2a2a] w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:bg-[#333] transition-colors relative">
              <Info size={20} />
            </button>
            <button 
              onClick={() => navigate('/cost-settings')}
              className="bg-green-700 w-10 h-10 rounded-xl flex items-center justify-center text-white hover:bg-green-600 transition-colors relative"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {products.map((product) => (
          <div key={product.id} className="bg-[#1a1a1a] rounded-3xl border border-white/5 overflow-hidden group hover:border-white/10 transition-all relative flex flex-col">
            {/* Image Section - Aspect Ratio 3:4 (1200x1600) */}
            <div className="relative aspect-[3/4] w-full">
              <img 
                src={product.imageUrl} 
                alt={product.name} 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-transparent opacity-80" />
              
              {/* Product Title Overlay */}
              <div className="absolute bottom-4 left-4 right-4">
                <h3 className="text-xl font-bold text-white mb-1 line-clamp-2">{product.name}</h3>
              </div>

              {/* Top Left Badge */}
              <div className="absolute top-4 left-4">
                 <div className="w-8 h-8 bg-[#2a2a2a]/80 backdrop-blur-sm rounded-full flex items-center justify-center text-white font-bold border border-white/10">
                   {product.marketplace === 'wb' ? 'W' : 'O'}
                 </div>
              </div>

              {/* Delete Button (Top Right) */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setProductToDelete(product.id);
                }}
                className="absolute top-4 right-4 w-8 h-8 bg-red-500/80 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                title="Удалить товар"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Info Section */}
            <div className="p-5 space-y-3 flex-1 flex flex-col justify-end bg-[#1a1a1a]">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-gray-500 text-sm">Себестоимость:</div>
                  <div className="text-xl font-medium text-white">{product.costPrice} ₽</div>
                </div>
                <div className="flex gap-1">
                  {product.apiWb && (
                    <div className="w-6 h-6 rounded-full bg-purple-600/20 text-purple-400 flex items-center justify-center text-xs font-bold border border-purple-500/30" title="WB API подключен">W</div>
                  )}
                  {product.apiOzon && (
                    <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold border border-blue-500/30" title="Ozon API подключен">O</div>
                  )}
                </div>
              </div>
              
              <div className="flex items-end gap-2">
                <div>
                  <div className="text-gray-500 text-sm">Продажи:</div>
                  <div className="text-2xl font-bold text-white">{product.salesPercent || 0} шт</div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Add Button Card */}
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#1a1a1a] rounded-3xl border border-white/5 flex flex-col items-center justify-center aspect-[3/4] hover:bg-[#222] transition-all group cursor-pointer w-full"
        >
          <div className="w-20 h-20 rounded-2xl border-2 border-white/20 flex items-center justify-center mb-4 group-hover:border-white/40 transition-colors">
            <Plus size={40} className="text-white" />
          </div>
          <span className="text-xl font-medium text-white">Добавить</span>
        </button>
      </div>

      {/* Add Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-md p-6 space-y-6 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white z-10"
            >
              <X size={24} />
            </button>
            
            <h2 className="text-2xl font-bold">Добавить товар</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Название товара</label>
                <input 
                  type="text" 
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Например: Свеча 'Денежный поток'"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Выбери себестоимость</label>
                <select 
                  value={newProduct.costSettingId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewProduct({...newProduct, costSettingId: val, costPrice: ''});
                  }}
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none"
                >
                  <option value="">-- Выберите из списка --</option>
                  {costSettings.map(setting => (
                    <option key={setting.id} value={setting.id}>
                      {setting.name} ({setting.totalCost.toFixed(2)} ₽)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">API продаж от WB</label>
                <input 
                  type="text" 
                  value={newProduct.apiWb}
                  onChange={(e) => setNewProduct({...newProduct, apiWb: e.target.value})}
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Токен WB"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">API продаж от Ozon</label>
                <input 
                  type="text" 
                  value={newProduct.apiOzon}
                  onChange={(e) => setNewProduct({...newProduct, apiOzon: e.target.value})}
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Токен Ozon"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Изображение товара</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-[3/4] bg-[#2a2a2a] border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-500/50 transition-colors relative overflow-hidden group"
                >
                  {previewUrl ? (
                    <>
                      <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white font-medium">Изменить фото</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="text-gray-500 mb-2" size={32} />
                      <span className="text-gray-500 text-sm text-center px-4">Нажмите для загрузки фото (1200x1600)</span>
                    </>
                  )}
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*"
                  className="hidden"
                />
              </div>
            </div>

            <button 
              onClick={handleAddProduct}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-colors"
            >
              Сохранить
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-sm p-6 space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertTriangle size={32} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Удалить товар?</h3>
                <p className="text-gray-400">Это действие нельзя отменить. Товар будет удален навсегда.</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setProductToDelete(null)}
                className="flex-1 bg-[#2a2a2a] hover:bg-[#333] text-white font-medium py-3 rounded-xl transition-colors"
              >
                Отмена
              </button>
              <button 
                onClick={handleDeleteProduct}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-medium py-3 rounded-xl transition-colors"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
