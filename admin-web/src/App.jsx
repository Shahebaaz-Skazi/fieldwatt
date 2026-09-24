import React, { useState, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// Lazy load non-landing pages
const Areas = lazy(() => import('./pages/Areas'));
const Agents = lazy(() => import('./pages/Agents'));
const Assignment = lazy(() => import('./pages/Assignment'));
const Import = lazy(() => import('./pages/Import'));
const Reports = lazy(() => import('./pages/Reports'));
const SelfReading = lazy(() => import('./pages/SelfReading'));
const AgentPerformance = lazy(() => import('./pages/AgentPerformance'));
const Corrections = lazy(() => import('./pages/Corrections'));
// Fallback if WhatsAppDashboard doesn't exist
const WhatsAppDashboard = lazy(() => import('./pages/Dashboard').catch(() => ({ default: () => <div style={{padding:'40px'}}>WhatsApp Module Not Available</div> })));

import { LayoutDashboard, MapPin, Users, FileSpreadsheet, Map, LogOut, ShieldAlert, BarChart3, UserCheck, MessageSquare, TrendingUp, RefreshCw } from 'lucide-react';

const App = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const navigate = useNavigate();
  const location = useLocation();

  const isViewer = user?.role === 'viewer';
  const isPerformanceViewer = user?.role === 'agent_performance_viewer';

  // pageKeys allows resetting a component when the user re-clicks its active sidebar link
  const [pageKeys, setPageKeys] = useState({
    '/': 0,
    '/areas': 0,
    '/agents': 0,
    '/assignment': 0,
    '/import': 0,
    '/corrections': 0,
    '/reports': 0,
    '/performance': 0
  });

  // Handle special public/unauthenticated routes first
  if (location.pathname === '/self-reading') {
    return (
      <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading self reading portal...</div>}>
        <SelfReading />
      </Suspense>
    );
  }

  // Handle auth enforcement
  if (!token) {
    return <Login />;
  }

  // Ensure role-based routing
  if (isPerformanceViewer && location.pathname !== '/performance' && location.pathname !== '/self-reading') {
    return <Navigate to="/performance" replace />;
  }

  if (isViewer && location.pathname !== '/' && location.pathname !== '/self-reading') {
    return <Navigate to="/" replace />;
  }

  const handleNavClick = (path) => {
    if (location.pathname === path) {
      setPageKeys(prev => ({ ...prev, [path]: (prev[path] || 0) + 1 }));
    } else {
      navigate(path);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo">
          <img src="/logo.png" alt="Logo" style={{ width: '28px', height: '28px', borderRadius: '6px' }} />
          Field<span>Watt</span>
        </div>
        
        <nav style={{ flex: 1 }}>
          <ul className="nav-links">
            {isPerformanceViewer ? (
              <li>
                <button
                  onClick={() => handleNavClick('/performance')}
                  className={`nav-link ${location.pathname === '/performance' ? 'active' : ''}`}
                >
                  <TrendingUp size={18} />
                  Agent Performance
                </button>
              </li>
            ) : isViewer ? (
              <li>
                <button
                  onClick={() => handleNavClick('/')}
                  className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
                >
                  <LayoutDashboard size={18} />
                  Dashboard
                </button>
              </li>
            ) : (
              <>
                <li>
                  <button
                    onClick={() => handleNavClick('/')}
                    className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
                  >
                    <LayoutDashboard size={18} />
                    Dashboard
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('/areas')}
                    className={`nav-link ${location.pathname.startsWith('/areas') ? 'active' : ''}`}
                  >
                    <MapPin size={18} />
                    Areas Browser
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('/agents')}
                    className={`nav-link ${location.pathname.startsWith('/agents') ? 'active' : ''}`}
                  >
                    <Users size={18} />
                    Manage Agents
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('/import')}
                    className={`nav-link ${location.pathname.startsWith('/import') ? 'active' : ''}`}
                  >
                    <FileSpreadsheet size={18} />
                    Import Excel
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('/corrections')}
                    className={`nav-link ${location.pathname.startsWith('/corrections') ? 'active' : ''}`}
                  >
                    <ShieldAlert size={18} />
                    Corrections
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('/assignment')}
                    className={`nav-link ${location.pathname.startsWith('/assignment') ? 'active' : ''}`}
                  >
                    <UserCheck size={18} />
                    Bulk Assign
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('/reports')}
                    className={`nav-link ${location.pathname.startsWith('/reports') ? 'active' : ''}`}
                  >
                    <BarChart3 size={18} />
                    Analytics & Reports
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('/performance')}
                    className={`nav-link ${location.pathname.startsWith('/performance') ? 'active' : ''}`}
                  >
                    <TrendingUp size={18} />
                    Agent Performance
                  </button>
                </li>
              </>
            )}
          </ul>
        </nav>

        {/* Sidebar Footer / Admin profile context */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: '600', color: 'var(--text)', fontSize: '13px' }}>{user?.name || 'Administrator'}</span>
            <span style={{ color: 'var(--muted)', fontSize: '11px' }}>{user?.email || 'admin@fieldwatt.com'}</span>
          </div>
          <button onClick={() => { logout(); navigate('/'); }} className="nav-link nav-link-logout">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Panel Content Pane */}
      <main className="main-content">
        <Suspense fallback={
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--muted)',
            gap: '12px'
          }}>
            <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--accent3)' }} />
            <span>Loading page...</span>
          </div>
        }>
          <Routes>
            <Route path="/" element={
              isPerformanceViewer 
                ? <Navigate to="/performance" replace /> 
                : <Dashboard key={pageKeys['/']} viewerMode={isViewer} />
            } />
            <Route path="/areas" element={<Areas key={pageKeys['/areas']} />} />
            <Route path="/agents" element={<Agents key={pageKeys['/agents']} />} />
            <Route path="/assignment" element={<Assignment key={pageKeys['/assignment']} />} />
            <Route path="/import" element={<Import key={pageKeys['/import']} />} />
            <Route path="/corrections" element={<Corrections key={pageKeys['/corrections']} />} />
            <Route path="/reports" element={<Reports key={pageKeys['/reports']} />} />
            <Route path="/performance" element={<AgentPerformance key={pageKeys['/performance']} performanceViewerMode={isPerformanceViewer} />} />
            <Route path="/whatsapp" element={<WhatsAppDashboard key={pageKeys['/whatsapp']} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
};

export default App;
