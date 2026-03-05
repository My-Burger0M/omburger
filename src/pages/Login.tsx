import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err: any) {
      console.error('Login error:', err);
      setError(`Ошибка входа: ${err.message || 'Проверьте email и пароль'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4 text-white font-sans">
      <div className="bg-[#1a1a1a] p-8 rounded-2xl border border-white/10 w-full max-w-md shadow-2xl">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center">
            <span className="text-3xl font-bold italic">OM</span>
          </div>
        </div>
        
        <h2 className="text-2xl font-bold mb-6 text-center">
          Вход в админ-панель
        </h2>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              placeholder="admin@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#2a2a2a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-purple-500/20"
          >
            {loading ? 'Подождите...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
