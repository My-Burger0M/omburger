import React, { useState } from 'react';
import { X, Package, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Order {
  id: string;
  platform: string;
  orderId: string;
  date: string;
  product: string;
  article: string;
  price: number;
  status: string;
}

interface MarketplaceOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  orders: Order[];
}

export default function MarketplaceOrdersModal({ isOpen, onClose, title, orders }: MarketplaceOrdersModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'wb' | 'ozon'>('all');

  if (!isOpen) return null;

  const filteredOrders = orders.filter(order => {
    const product = order.product || '';
    const article = order.article || '';
    const orderId = order.orderId || '';
    
    const matchesSearch = product.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          article.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          orderId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlatform = platformFilter === 'all' || order.platform === platformFilter;
    return matchesSearch && matchesPlatform;
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e1e1e] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-white/10">
        <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Package className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{title}</h2>
              <p className="text-sm text-gray-400">Всего заказов: {filteredOrders.length}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row gap-4 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по товару, артикулу или номеру заказа..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value as any)}
              className="bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-purple-500 transition-colors"
            >
              <option value="all">Все платформы</option>
              <option value="wb">Wildberries</option>
              <option value="ozon">Ozon</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Заказы не найдены</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map(order => (
                <div key={order.id} className="bg-[#2a2a2a] rounded-xl p-4 flex items-center justify-between border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-[#1e1e1e] flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-gray-400 uppercase">{order.platform}</span>
                    </div>
                    <div>
                      <h4 className="font-medium text-white">{order.product || 'Неизвестный товар'}</h4>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span>Арт: {order.article}</span>
                        <span>•</span>
                        <span>Заказ: {order.orderId}</span>
                        <span>•</span>
                        <span>{order.date ? format(new Date(order.date), 'dd MMM yyyy HH:mm', { locale: ru }) : 'Нет даты'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-400">{order.price} ₽</div>
                    <div className="text-xs text-gray-400 mt-1">{order.status === 'cancelled' ? 'Отменен' : 'Заказан'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
