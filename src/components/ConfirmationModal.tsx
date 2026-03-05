import React from 'react';
import { X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

export default function ConfirmationModal({ isOpen, onClose, onConfirm, title, message }: ConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl transform transition-all">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-full"
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-gray-300 mb-6 text-sm leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 border border-red-500/20 text-sm font-medium transition-colors"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
