import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { errMsg } from '../api/client';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) { navigate('/', { replace: true }); }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
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
          <div className="logo-mark">B</div>
          <div><h1>BuildTrack Admin</h1><p className="sub" style={{ margin: 0 }}>System Administration Console</p></div>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Email address</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@constructionerp.com" autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button className="btn primary" style={{ width: '100%', padding: 11 }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in to Admin'}</button>
        </form>
        <div className="auth-hint">Admin access only — use your administrator credentials. Project users: <Link to="/login" style={{ pointerEvents: 'none', color: 'var(--ink-3)' }}>use the web app</Link>.</div>
      </div>
    </div>
  );
}
