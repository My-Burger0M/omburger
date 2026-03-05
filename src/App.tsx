import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Products from './pages/Products';
import UnitEconomy from './pages/UnitEconomy';
import OFR from './pages/OFR';
import BotScenarios from './pages/BotScenarios';
import Dialogs from './pages/Dialogs';
import Mailings from './pages/Mailings';
import CRM from './pages/CRM';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#121212] text-white">
        <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  
  if (!currentUser) {
    return <Navigate to="/login" />;
  }
  
  return <>{children}</>;
}

function AppContent() {
  const { currentUser } = useAuth();
  
  return (
    <Routes>
      <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/" />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <div className="flex h-screen bg-[#121212] text-white font-sans overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/products" element={<Products />} />
                <Route path="/unit" element={<UnitEconomy />} />
                <Route path="/ofr" element={<OFR />} />
                <Route path="/scenarios" element={<BotScenarios />} />
                <Route path="/dialogs" element={<Dialogs />} />
                <Route path="/mailings" element={<Mailings />} />
                <Route path="/crm" element={<CRM />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}
