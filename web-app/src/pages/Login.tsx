import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { errMsg } from '../api/client';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    const dest = location.state?.from?.pathname || '/';
    navigate(dest, { replace: true });
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="logo-row">
          <img src="/logo.svg" alt="logo" />
          <div>
            <h1>Construction ERP</h1>
            <p className="sub" style={{ margin: 0 }}>Project Tracking System</p>
          </div>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Email address</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button className="btn primary" style={{ width: '100%', padding: 11 }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div style={{ textAlign: 'right', marginTop: 10 }}>
          <Link to="/forgot-password" style={{ fontSize: 13 }}>Forgot password?</Link>
        </div>
        <div className="auth-hint">
          Demo (after seeding): super admin <code>admin@constructionerp.com</code> / <code>Admin@123</code>
          <br />role users: pm@ / engineer@ / store@ / sales@ / accounts@ @constructionerp.com — <code>Password@123</code>
        </div>
      </div>
    </div>
  );
}
