import React, { useState } from 'react';
import useAuthStore from '../store/authStore';
import api from '../utils/api';
import { Lock, Mail, Zap, CheckCircle2, ShieldAlert } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/admin/login', { email, password });
      login(response.user, response.token);
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      position: 'relative',
      overflow: 'hidden',
      padding: '20px'
    }}>
      {/* Subtle Light Gray Decorative Background Glows */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 0, 0, 0.02) 0%, rgba(0, 0, 0, 0) 70%)',
        top: '-10%',
        left: '-10%',
        zIndex: 1
      }} />
      <div style={{
        position: 'absolute',
        width: '600px',
        height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 0, 0, 0.02) 0%, rgba(0, 0, 0, 0) 70%)',
        bottom: '-10%',
        right: '-10%',
        zIndex: 1
      }} />

      {/* Light Grid Pattern */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.02) 1px, transparent 1px)',
        backgroundSize: '30px 30px',
        zIndex: 1
      }} />

      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: '40px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03), 0 1px 2px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
        zIndex: 2,
        position: 'relative'
      }}>
        {/* Top Header Badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: '#111827',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
          }}>
            <Zap size={28} color="#fff" strokeWidth={2.5} />
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '30px',
              fontWeight: '850',
              letterSpacing: '-0.5px',
              color: '#111827',
              marginBottom: '4px'
            }}>
              Field<span style={{ color: '#6b7280' }}>Watt</span>
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '13px', fontWeight: '500' }}>
              Electricity Operations Management
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            lineHeight: '1.4'
          }}>
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Administrator Email
            </label>
            <div style={{ position: 'relative', marginTop: '6px' }}>
              <Mail size={16} style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted)'
              }} />
              <input
                type="email"
                required
                className="form-input"
                placeholder="admin@fieldwatt.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '44px',
                  backgroundColor: '#ffffff',
                  borderColor: '#e5e7eb',
                  color: '#111827',
                  fontSize: '14px',
                  transition: 'border-color 0.2s'
                }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Dashboard Password
            </label>
            <div style={{ position: 'relative', marginTop: '6px' }}>
              <Lock size={16} style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted)'
              }} />
              <input
                type="password"
                required
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '44px',
                  backgroundColor: '#ffffff',
                  borderColor: '#e5e7eb',
                  color: '#111827',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '14px',
              marginTop: '10px',
              fontFamily: 'var(--font-display)',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '10px',
              backgroundColor: '#111827',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            {loading ? 'Initializing Console...' : 'Log In to Console'}
          </button>
        </form>

        {/* Demo Credentials Box */}
        <div style={{
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '12px',
          color: 'var(--muted)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <span style={{ color: '#111827', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={12} /> Live Demo Login Details:
          </span>
          <p>Email: <strong style={{ color: '#111827' }}>admin@fieldwatt.com</strong></p>
          <p>Password: <strong style={{ color: '#111827' }}>admin123</strong></p>
        </div>
      </div>
    </div>
  );
};

export default Login;
