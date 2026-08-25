import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errMsg } from '../api/client';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { email: email.trim(), token: token.trim(), newPassword: password });
      setDone(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="logo-row"><img src="/logo.svg" alt="logo" /><h1>Reset password</h1></div>
        {error && <div className="auth-error">{error}</div>}
        {done ? (
          <div>
            <p style={{ color: 'var(--ink-2)' }}>✅ Your password has been reset. You can now sign in with your new password.</p>
            <Link to="/login" className="btn primary" style={{ marginTop: 12, display: 'inline-block' }}>Go to login</Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="field"><label>Email</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label>Reset token</label><input className="input mono" required value={token} onChange={(e) => setToken(e.target.value)} placeholder="from the reset link" /></div>
            <div className="field"><label>New password (min 8 chars)</label><input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div className="field"><label>Confirm new password</label><input className="input" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            <button className="btn primary" style={{ width: '100%', padding: 11 }} disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
