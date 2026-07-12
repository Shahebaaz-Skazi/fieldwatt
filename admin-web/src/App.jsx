import React from 'react';
import useAuthStore from './store/authStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Areas from './pages/Areas';
import Agents from './pages/Agents';
import Import from './pages/Import';
import MapView from './pages/Map';
import Alerts from './pages/Alerts';
import Reports from './pages/Reports';
import { LayoutDashboard, MapPin, Users, FileSpreadsheet, Map, LogOut, ShieldAlert, BarChart3 } from 'lucide-react';

const App = () => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const activePage = useAuthStore((state) => state.activePage);
  const setActivePage = useAuthStore((state) => state.setActivePage);
  const logout = useAuthStore((state) => state.logout);

  if (!token) {
    return <Login />;
  }

  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard />;
      case 'areas':
        return <Areas />;
      case 'agents':
        return <Agents />;
      case 'import':
        return <Import />;
      case 'map':
        return <MapView />;
      case 'alerts':
        return <Alerts />;
      case 'reports':
        return <Reports />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo">
          Field<span>Watt</span>
        </div>
        
        <nav>
          <ul className="nav-links">
            <li>
              <button
                onClick={() => setActivePage('dashboard')}
                className={`nav-link ${activePage === 'dashboard' ? 'active' : ''}`}
              >
                <LayoutDashboard size={18} />
                Dashboard
              </button>
            </li>
            <li>
              <button
                onClick={() => setActivePage('areas')}
                className={`nav-link ${activePage === 'areas' ? 'active' : ''}`}
              >
                <MapPin size={18} />
                Areas Browser
              </button>
            </li>
            <li>
              <button
                onClick={() => setActivePage('agents')}
                className={`nav-link ${activePage === 'agents' ? 'active' : ''}`}
              >
                <Users size={18} />
                Manage Agents
              </button>
            </li>
            <li>
              <button
                onClick={() => setActivePage('import')}
                className={`nav-link ${activePage === 'import' ? 'active' : ''}`}
              >
                <FileSpreadsheet size={18} />
                Import Excel
              </button>
            </li>
            <li>
              <button
                onClick={() => setActivePage('map')}
                className={`nav-link ${activePage === 'map' ? 'active' : ''}`}
              >
                <Map size={18} />
                MapView
              </button>
            </li>
            <li>
              <button
                onClick={() => setActivePage('alerts')}
                className={`nav-link ${activePage === 'alerts' ? 'active' : ''}`}
              >
                <ShieldAlert size={18} />
                Anomaly Alerts
              </button>
            </li>
            <li>
              <button
                onClick={() => setActivePage('reports')}
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
