import React, { useState, useEffect, useRef } from 'react';
import { Plus, Info, Package, X, Upload, Image as ImageIcon, Trash2, AlertTriangle } from 'lucide-react';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { resizeImage } from '../utils/image';

interface Product {
  id: string;
  name: string;
  costPrice: number;
  imageUrl: string;
  marketplace: 'wb' | 'ozon' | 'manual';
  apiToken?: string;
  salesPercent: number;
}

export default function Products() {
  const { currentUser } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form State
  const [newProduct, setNewProduct] = useState({
    name: '',
    costPrice: '',
    imageUrl: '',
    marketplace: 'wb',
    apiToken: ''
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');

  useEffect(() => {
    fetchProducts();
  }, [currentUser]);

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
    if (!newProduct.name || !newProduct.costPrice) {
      alert('Пожалуйста, заполните обязательные поля (Название, Себестоимость)');
      return;
    }

    try {
      let finalImageUrl = newProduct.imageUrl || 'https://via.placeholder.com/300';
      
      if (selectedFile) {
        // Resize image to max 1200x1600 (3:4 aspect ratio target)
        finalImageUrl = await resizeImage(selectedFile, 1200, 1600);
      }

      await addDoc(collection(db, 'users', currentUser.uid, 'products'), {
        name: newProduct.name,
        costPrice: Number(newProduct.costPrice),
        imageUrl: finalImageUrl,
        marketplace: newProduct.marketplace,
        apiToken: newProduct.apiToken,
        salesPercent: 0, // Default for now
        createdAt: new Date()
      });
      
      setIsModalOpen(false);
      setNewProduct({ name: '', costPrice: '', imageUrl: '', marketplace: 'wb', apiToken: '' });
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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold mb-8">Товары</h1>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Sales */}
        <div className="bg-[#1a1a1a] rounded-2xl p-4 flex items-center justify-between border border-white/5 relative overflow-hidden group">
          <div className="z-10">
            <div className="text-gray-400 text-sm mb-1">Продаж в сумме:</div>
            <div className="text-2xl font-bold text-white">0</div>
          </div>
          <div className="bg-[#2a2a2a] p-3 rounded-xl text-gray-400">
            <Package size={24} />
          </div>
        </div>

        {/* WB Sales */}
        <div className="bg-[#1a1a1a] rounded-2xl p-4 flex items-center justify-between border border-white/5 relative overflow-hidden">
          <div className="z-10">
            <div className="text-gray-400 text-sm mb-1">Продаж Wildberries:</div>
            <div className="text-2xl font-bold text-white">0</div>
          </div>
          <div className="bg-gradient-to-br from-purple-600 to-fuchsia-600 p-3 rounded-xl text-white font-bold text-lg w-12 h-12 flex items-center justify-center">
            WB
          </div>
        </div>

        {/* Ozon Sales */}
        <div className="bg-[#1a1a1a] rounded-2xl p-4 flex items-center justify-between border border-white/5 relative overflow-hidden">
          <div className="z-10">
            <div className="text-gray-400 text-sm mb-1">Продаж OZON:</div>
            <div className="text-2xl font-bold text-white">0</div>
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
            <button className="bg-green-700 w-10 h-10 rounded-xl flex items-center justify-center text-white hover:bg-green-600 transition-colors relative">
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
              <div>
                <div className="text-gray-500 text-sm">Себестоимость:</div>
                <div className="text-xl font-medium text-white">{product.costPrice} ₽</div>
              </div>
              
              <div className="flex items-end gap-2">
                <div>
                  <div className="text-gray-500 text-sm">Продажи:</div>
                  <div className="text-2xl font-bold text-white">{product.salesPercent}%</div>
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
                <label className="block text-sm text-gray-400 mb-1">Себестоимость (₽)</label>
                <input 
                  type="number" 
                  value={newProduct.costPrice}
                  onChange={(e) => setNewProduct({...newProduct, costPrice: e.target.value})}
                  className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="0"
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
