import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logo, setLogo] = useState<string | null>(localStorage.getItem('admin_logo'));
  const navigate = useNavigate();

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const docRef = doc(db, 'public', 'settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().logo) {
          setLogo(docSnap.data().logo);
          localStorage.setItem('admin_logo', docSnap.data().logo);
        }
      } catch (error) {
        console.error('Error fetching logo:', error);
      }
    };
    fetchLogo();
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setLogo(base64);
        localStorage.setItem('admin_logo', base64);
        try {
          await setDoc(doc(db, 'public', 'settings'), { logo: base64 }, { merge: true });
        } catch (error) {
          console.error('Error saving logo to DB:', error);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/network-request-failed') {
        setError('Ошибка сети. Пожалуйста, отключите VPN, проверьте подключение к интернету или отключите блокировщик рекламы.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Неверный email или пароль. Пожалуйста, проверьте введенные данные.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Слишком много неудачных попыток входа. Пожалуйста, подождите немного и попробуйте снова.');
      } else {
        setError('Произошла ошибка при входе. Проверьте email и пароль.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 text-white font-sans relative overflow-hidden"
      style={{
        backgroundImage: 'url("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop")',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div className="bg-[#1a1a1a]/80 backdrop-blur-md p-8 rounded-2xl border border-white/10 w-full max-w-md shadow-2xl relative z-10">
        <div className="flex justify-center mb-8 relative">
          <label className="cursor-pointer group relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center overflow-hidden shadow-lg transition-transform group-hover:scale-105">
              {logo ? (
                <img src={logo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold italic">OM</span>
              )}
            </div>
            <div className="absolute inset-0 bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <span className="text-[10px] text-white font-medium text-center px-1">Изменить<br/>лого</span>
            </div>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleLogoUpload} 
              className="hidden" 
            />
          </label>
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
