import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
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
import EventCalendar from './pages/EventCalendar';
import Teams from './pages/Teams';
import KnowledgeBase from './pages/KnowledgeBase';
import CostSettings from './pages/CostSettings';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  return (
    <Routes>
      <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/" />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <div className="flex h-screen bg-[#121212] text-white font-sans overflow-hidden relative">
            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
              <div 
                className="fixed inset-0 bg-black/50 z-40 md:hidden"
                onClick={() => setIsMobileMenuOpen(false)}
              />
            )}
            
            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 z-50 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-in-out`}>
              <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
            </div>

            <main className="flex-1 overflow-y-auto w-full">
              {/* Mobile Header */}
              <div className="md:hidden flex items-center justify-between p-4 border-b border-white/10 bg-[#1a1a1a] sticky top-0 z-30">
                <div className="font-bold text-lg italic">OM</div>
                <button 
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Menu size={24} />
                </button>
              </div>
              
              <div className="p-4 md:p-8">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/unit" element={<UnitEconomy />} />
                  <Route path="/ofr" element={<OFR />} />
                  <Route path="/scenarios" element={<BotScenarios />} />
                  <Route path="/dialogs" element={<Dialogs />} />
                  <Route path="/mailings" element={<Mailings />} />
                  <Route path="/crm" element={<CRM />} />
                  <Route path="/calendar" element={<EventCalendar />} />
                  <Route path="/teams" element={<Teams />} />
                  <Route path="/knowledge-base" element={<KnowledgeBase />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/cost-settings" element={<CostSettings />} />
                </Routes>
              </div>
            </main>
          </div>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  React.useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.ctrlKey && e.key === 'U')
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}
