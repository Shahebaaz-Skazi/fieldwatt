import React, { useState } from 'react';
import useAuthStore from './store/authStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Areas from './pages/Areas';
import Agents from './pages/Agents';
import Assignment from './pages/Assignment';
import Import from './pages/Import';
import MapView from './pages/Map';
import Alerts from './pages/Alerts';
import Reports from './pages/Reports';
import { LayoutDashboard, MapPin, Users, FileSpreadsheet, Map, LogOut, ShieldAlert, BarChart3, UserCheck } from 'lucide-react';

const App = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
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
    reports: 0
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
      default:
        return <Dashboard key={pageKeys.dashboard} />;
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo">
          Field<span>Watt</span>
        </div>
        
        <nav style={{ flex: 1 }}>
          <ul className="nav-links">
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
        {renderActivePage()}
      </main>
    </div>
  );
};

export default App;
