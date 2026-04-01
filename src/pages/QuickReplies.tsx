import React, { useState, useEffect } from 'react';
import { Plus, Copy, Check, Trash2 } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

interface MainProduct {
  id: string;
  name: string;
}

interface QRProduct {
  id: string;
  name: string;
  linkedProducts?: string[];
}

interface QuickReply {
  id: string;
  productId: string;
  category: string;
  number: string;
  text: string;
}

export default function QuickReplies() {
  const { currentUser } = useAuth();
  const [products, setProducts] = useState<QRProduct[]>([]);
  const [mainProducts, setMainProducts] = useState<MainProduct[]>([]);
  const [replies, setReplies] = useState<QuickReply[]>([]);
  
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedNumber, setSelectedNumber] = useState('');
  const [buyerName, setBuyerName] = useState('');
  
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductLinked, setNewProductLinked] = useState<string[]>([]);
  
  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [newReply, setNewReply] = useState({ productId: '', category: '', number: '', text: '' });
  
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const qProducts = query(collection(db, 'users', currentUser.uid, 'qr_products'), orderBy('createdAt', 'desc'));
    const unsubProducts = onSnapshot(qProducts, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QRProduct)));
    });

    const qMainProducts = query(collection(db, 'users', currentUser.uid, 'products'), orderBy('createdAt', 'desc'));
    const unsubMainProducts = onSnapshot(qMainProducts, (snapshot) => {
      setMainProducts(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name } as MainProduct)));
    });

    const qReplies = query(collection(db, 'users', currentUser.uid, 'quick_replies'), orderBy('createdAt', 'desc'));
    const unsubReplies = onSnapshot(qReplies, (snapshot) => {
      setReplies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuickReply)));
    });

    return () => {
      unsubProducts();
      unsubMainProducts();
      unsubReplies();
    };
  }, [currentUser]);

  const handleCreateProduct = async () => {
    if (!currentUser || !newProductName.trim()) return;
    try {
      await addDoc(collection(db, 'users', currentUser.uid, 'qr_products'), {
        name: newProductName.trim(),
        linkedProducts: newProductLinked,
        createdAt: serverTimestamp()
      });
      setNewProductName('');
      setNewProductLinked([]);
      setIsProductModalOpen(false);
    } catch (err) {
      console.error('Error adding product:', err);
    }
  };

  const handleCreateReply = async () => {
    if (!currentUser || !newReply.productId || !newReply.category || !newReply.number || !newReply.text) return;
    try {
      await addDoc(collection(db, 'users', currentUser.uid, 'quick_replies'), {
        ...newReply,
        createdAt: serverTimestamp()
      });
      setNewReply({ productId: '', category: '', number: '', text: '' });
      setIsReplyModalOpen(false);
    } catch (err) {
      console.error('Error adding reply:', err);
    }
  };

  const handleDeleteReply = async (id: string) => {
    if (!currentUser || !window.confirm('Удалить этот быстрый ответ?')) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'quick_replies', id));
    } catch (err) {
      console.error('Error deleting reply:', err);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!currentUser || !window.confirm('Удалить эту категорию? Все связанные ответы также будут удалены.')) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'qr_products', id));
      // Optionally delete related replies here
    } catch (err) {
      console.error('Error deleting product:', err);
    }
  };

  const toggleLinkedProduct = (productId: string) => {
    setNewProductLinked(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const filteredCategories = Array.from(new Set(replies.filter(r => r.productId === selectedProductId).map(r => r.category)));
  const filteredNumbers = Array.from(new Set(replies.filter(r => r.productId === selectedProductId && r.category === selectedCategory).map(r => r.number)));
  
  const selectedReply = replies.find(r => r.productId === selectedProductId && r.category === selectedCategory && r.number === selectedNumber);
  
  let displayedText = selectedReply ? selectedReply.text : '';
  if (buyerName.trim() && displayedText) {
    if (displayedText.includes('{Имя}')) {
      displayedText = displayedText.replace(/{Имя}/g, buyerName);
    } else {
      displayedText = `${buyerName}, \n${displayedText}`;
    }
  }

  const handleCopy = () => {
    if (!displayedText) return;
    navigator.clipboard.writeText(displayedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold">Быстрые ответы</h1>
      </div>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setIsProductModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] border border-white/10 rounded-xl text-white transition-colors"
        >
          Создать категорию товаров
          <div className="bg-green-600/20 text-green-500 p-1 rounded-md ml-2">
            <Plus className="w-4 h-4" />
          </div>
        </button>
        <button
          onClick={() => setIsReplyModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] border border-white/10 rounded-xl text-white transition-colors"
        >
          Добавить быстрый ответ
          <div className="bg-green-600/20 text-green-500 p-1 rounded-md ml-2">
            <Plus className="w-4 h-4" />
          </div>
        </button>
      </div>

      <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6">
        <h3 className="text-sm text-gray-400 mb-4">Выберите параметры</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <select
            value={selectedProductId}
            onChange={(e) => {
              setSelectedProductId(e.target.value);
              setSelectedCategory('');
              setSelectedNumber('');
            }}
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">Категория товаров</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setSelectedNumber('');
            }}
            disabled={!selectedProductId}
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
          >
            <option value="">Подкатегория</option>
            {filteredCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={selectedNumber}
            onChange={(e) => setSelectedNumber(e.target.value)}
            disabled={!selectedCategory}
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
          >
            <option value="">Ключевое слово / Номер</option>
            {filteredNumbers.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <input
            type="text"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            placeholder="Имя покупателя"
            className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="relative">
          <textarea
            value={displayedText}
            readOnly
            placeholder="Здесь появится текст быстрого ответа..."
            className="w-full h-64 bg-[#2a2a2a] border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none resize-none"
          />
          {displayedText && (
            <button
              onClick={handleCopy}
              className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          )}
        </div>
      </div>

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Создать категорию товаров</h2>
            <input
              type="text"
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              placeholder="Название категории (напр. Свечи)"
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
            />
            
            <div className="mb-6">
              <h3 className="text-sm text-gray-400 mb-2">Привязать товары (API):</h3>
              <div className="max-h-40 overflow-y-auto space-y-2 bg-[#2a2a2a] p-2 rounded-xl border border-white/5">
                {mainProducts.map(p => (
                  <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-[#333] rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newProductLinked.includes(p.id)}
                      onChange={() => toggleLinkedProduct(p.id)}
                      className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-[#1a1a1a]"
                    />
                    <span className="text-sm text-white">{p.name}</span>
                  </label>
                ))}
                {mainProducts.length === 0 && (
                  <div className="text-sm text-gray-500 p-2 text-center">Нет доступных товаров</div>
                )}
              </div>
            </div>
            
            <div className="mb-6 max-h-40 overflow-y-auto space-y-2">
              <h3 className="text-sm text-gray-400 mb-2">Существующие категории:</h3>
              {products.map(p => (
                <div key={p.id} className="flex justify-between items-center bg-[#2a2a2a] p-2 rounded-lg">
                  <span className="text-sm">{p.name}</span>
                  <button onClick={() => handleDeleteProduct(p.id)} className="text-red-400 hover:text-red-300 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateProduct}
                disabled={!newProductName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reply Modal */}
      {isReplyModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4">Добавить быстрый ответ</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <select
                value={newReply.productId}
                onChange={(e) => setNewReply({ ...newReply, productId: e.target.value })}
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Выберите категорию</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              
              <input
                type="text"
                value={newReply.category}
                onChange={(e) => setNewReply({ ...newReply, category: e.target.value })}
                placeholder="Подкатегория (напр. Брак)"
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              
              <input
                type="text"
                value={newReply.number}
                onChange={(e) => setNewReply({ ...newReply, number: e.target.value })}
                placeholder="Ключевое слово или Номер (напр. 0)"
                className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <textarea
              value={newReply.text}
              onChange={(e) => setNewReply({ ...newReply, text: e.target.value })}
              placeholder="Текст ответа. Используйте {Имя} для подстановки имени покупателя."
              className="w-full h-40 bg-[#2a2a2a] border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none resize-none mb-6"
            />
            
            <div className="mb-6 max-h-40 overflow-y-auto space-y-2">
              <h3 className="text-sm text-gray-400 mb-2">Существующие ответы:</h3>
              {replies.map(r => {
                const product = products.find(p => p.id === r.productId);
                return (
                  <div key={r.id} className="flex justify-between items-center bg-[#2a2a2a] p-2 rounded-lg">
                    <div className="text-sm truncate pr-4">
                      <span className="text-gray-400">[{product?.name}]</span> {r.category} - {r.number}: {r.text.substring(0, 30)}...
                    </div>
                    <button onClick={() => handleDeleteReply(r.id)} className="text-red-400 hover:text-red-300 p-1 shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsReplyModalOpen(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateReply}
                disabled={!newReply.productId || !newReply.category || !newReply.number || !newReply.text}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
