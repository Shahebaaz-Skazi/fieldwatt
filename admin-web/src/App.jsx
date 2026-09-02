import React, { useState, lazy, Suspense } from 'react';
import useAuthStore from './store/authStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// Lazy load non-landing pages
const Areas = lazy(() => import('./pages/Areas'));
const Agents = lazy(() => import('./pages/Agents'));
const Assignment = lazy(() => import('./pages/Assignment'));
const Import = lazy(() => import('./pages/Import'));
const MapView = lazy(() => import('./pages/Map'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Reports = lazy(() => import('./pages/Reports'));
const SelfReading = lazy(() => import('./pages/SelfReading'));
const WhatsAppPanel = lazy(() => import('./pages/WhatsAppPanel'));
const WhatsAppDashboard = lazy(() => import('./pages/WhatsAppDashboard'));
const AgentPerformance = lazy(() => import('./pages/AgentPerformance'));

import { LayoutDashboard, MapPin, Users, FileSpreadsheet, Map, LogOut, ShieldAlert, BarChart3, UserCheck, MessageSquare, TrendingUp, RefreshCw } from 'lucide-react';

const App = () => {
  if (window.location.pathname === '/self-reading') {
    return (
      <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading self reading portal...</div>}>
        <SelfReading />
      </Suspense>
    );
  }

  if (window.location.pathname === '/whatsapp') {
    // <Route element={<WhatsAppDashboard />} path="/whatsapp"/>
    const token = useAuthStore.getState().token;
    if (!token) return <Login />;
    return (
      <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading outreach dashboard...</div>}>
        <WhatsAppDashboard />
      </Suspense>
    );
  }

  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isViewer = user?.role === 'viewer';
  const isPerformanceViewer = user?.role === 'agent_performance_viewer';
  const activePage = useAuthStore((state) => state.activePage);
  const setActivePage = useAuthStore((state) => state.setActivePage);
  const logout = useAuthStore((state) => state.logout);

  // pageKeys allows resetting a component when the user re-clicks its active sidebar link
  const [pageKeys, setPageKeys] = useState({
    dashboard: 0,
    areas: 0,
    agents: 0,
    assignment: 0,
    import: 0,
    map: 0,
    alerts: 0,
    reports: 0,
    whatsapp: 0,
    whatsapp_outreach: 0,
    performance: 0
  });

  if (!token) {
    return <Login />;
  }

  const handleNavClick = (page) => {
    if (activePage === page) {
      setPageKeys(prev => ({ ...prev, [page]: prev[page] + 1 }));
    } else {
      setActivePage(page);
    }
  };

  const renderActivePage = () => {
    if (isPerformanceViewer) {
      return <AgentPerformance key={pageKeys.performance || 'performance'} performanceViewerMode={true} />;
    }

    if (isViewer) {
      return <Dashboard key={pageKeys.dashboard} viewerMode={true} />;
    }

    switch (activePage) {
      case 'dashboard':
        return <Dashboard key={pageKeys.dashboard} />;
      case 'areas':
        return <Areas key={pageKeys.areas} />;
      case 'agents':
        return <Agents key={pageKeys.agents} />;
      case 'assignment':
        return <Assignment key={pageKeys.assignment} />;
      case 'import':
        return <Import key={pageKeys.import} />;
      case 'map':
        return <MapView key={pageKeys.map} />;
      case 'alerts':
        return <Alerts key={pageKeys.alerts} />;
      case 'reports':
        return <Reports key={pageKeys.reports} />;
      case 'performance':
        return <AgentPerformance key={pageKeys.performance || 'performance'} />;
      case 'whatsapp':
        return <WhatsAppPanel key={pageKeys.whatsapp} />;
      case 'whatsapp_outreach':
        return <WhatsAppDashboard key={pageKeys.whatsapp_outreach} />;
      default:
        return <Dashboard key={pageKeys.dashboard} />;
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
                  onClick={() => handleNavClick('performance')}
                  className={`nav-link active`}
                >
                  <TrendingUp size={18} />
                  Agent Performance
                </button>
              </li>
            ) : isViewer ? (
              <li>
                <button
                  onClick={() => handleNavClick('dashboard')}
                  className={`nav-link ${activePage === 'dashboard' ? 'active' : ''}`}
                >
                  <LayoutDashboard size={18} />
                  Dashboard
                </button>
              </li>
            ) : (
              <>
                <li>
                  <button
                    onClick={() => handleNavClick('dashboard')}
                    className={`nav-link ${activePage === 'dashboard' ? 'active' : ''}`}
                  >
                    <LayoutDashboard size={18} />
                    Dashboard
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('areas')}
                    className={`nav-link ${activePage === 'areas' ? 'active' : ''}`}
                  >
                    <MapPin size={18} />
                    Areas Browser
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('agents')}
                    className={`nav-link ${activePage === 'agents' ? 'active' : ''}`}
                  >
                    <Users size={18} />
                    Manage Agents
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('import')}
                    className={`nav-link ${activePage === 'import' ? 'active' : ''}`}
                  >
                    <FileSpreadsheet size={18} />
                    Import Excel
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('assignment')}
                    className={`nav-link ${activePage === 'assignment' ? 'active' : ''}`}
                  >
                    <UserCheck size={18} />
                    Bulk Assign
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('whatsapp')}
                    className={`nav-link ${activePage === 'whatsapp' ? 'active' : ''}`}
                  >
                    <MessageSquare size={18} />
                    WhatsApp
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('map')}
                    className={`nav-link ${activePage === 'map' ? 'active' : ''}`}
                  >
                    <Map size={18} />
                    MapView
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('alerts')}
                    className={`nav-link ${activePage === 'alerts' ? 'active' : ''}`}
                  >
                    <ShieldAlert size={18} />
                    Anomaly Alerts
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('reports')}
                    className={`nav-link ${activePage === 'reports' ? 'active' : ''}`}
                  >
                    <BarChart3 size={18} />
                    Analytics & Reports
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('performance')}
                    className={`nav-link ${activePage === 'performance' ? 'active' : ''}`}
                  >
                    <TrendingUp size={18} />
                    Agent Performance
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => handleNavClick('whatsapp_outreach')}
                    className={`nav-link ${activePage === 'whatsapp_outreach' ? 'active' : ''}`}
                  >
                    <MessageSquare size={18} />
                    WhatsApp Outreach
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
          <button onClick={logout} className="nav-link nav-link-logout">
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
          {renderActivePage()}
        </Suspense>
      </main>
    </div>
  );
};

export default App;
