import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg } from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetUrl, setResetUrl] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim() });
      setDone(true);
      if (res.data.resetUrl) setResetUrl(res.data.resetUrl);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="logo-row"><img src="/logo.svg" alt="logo" /><h1>Forgot password</h1></div>
        {error && <div className="auth-error">{error}</div>}
        {done ? (
          <div>
            <p style={{ color: 'var(--ink-2)' }}>If this email is registered, a reset link has been sent (also delivered as an in-app notification).</p>
            {resetUrl && (
              <p style={{ fontSize: 12, wordBreak: 'break-all' }} className="muted">
                Development mode — open the reset link: <Link to={new URL(resetUrl).pathname + new URL(resetUrl).search}>Reset password</Link>
              </p>
            )}
            <Link to="/login" className="btn outline" style={{ marginTop: 12, display: 'inline-block' }}>← Back to login</Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="field">
              <label>Email address</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <button className="btn primary" style={{ width: '100%', padding: 11 }} disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            <div style={{ textAlign: 'center', marginTop: 12 }}><Link to="/login" style={{ fontSize: 13 }}>← Back to login</Link></div>
          </form>
        )}
      </div>
    </div>
  );
}
