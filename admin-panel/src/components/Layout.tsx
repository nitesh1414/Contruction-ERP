import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV = [
  { to: '/', label: 'Admin Dashboard', icon: '📊', perm: null },
  { section: 'Access Control', tagline: 'Who uses the platform' },
  { to: '/users', label: 'Users', icon: '👤', perm: 'users.view' },
  { to: '/roles', label: 'Roles & Permissions', icon: '🛡️', perm: 'roles.view' },
  { section: 'Master Data', tagline: 'Configure the operating model' },
  { to: '/projects', label: 'Projects & Wings', icon: '🏗️', perm: 'projects.view' },
  { to: '/masters', label: 'Masters', icon: '🗂️', perm: null },
  { section: 'People & finance operations', tagline: 'Identity, HR, payroll and site cash' },
  { to: '/hrms', label: 'HR & Payroll', icon: '🧑‍💼', perm: 'hrms.view' },
  { to: '/petty-cash', label: 'Petty Cash', icon: '💵', perm: 'petty_cash.view' },
  { section: 'System', tagline: 'Watch it all run' },
  { to: '/audit-logs', label: 'Audit Logs', icon: '📜', perm: 'admin.view' },
  { to: '/notifications', label: 'Broadcast', icon: '📣', perm: 'notifications.create' },
];

const TITLES: Record<string, string> = {
  '/': 'Admin Dashboard', '/users': 'User Management', '/roles': 'Roles & Permissions',
  '/projects': 'Projects & Wings', '/masters': 'Master Data',
  '/hrms': 'HR & Payroll', '/petty-cash': 'Petty Cash',
  '/audit-logs': 'Audit Logs', '/notifications': 'Broadcast Center',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, canAny } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      <aside className="sidebar">
        <div className="brand">
          <div className="logo-mark" aria-label="ERP logo">B</div>
          <span>BuildTrack<small>Admin Console</small></span>
        </div>
        <nav>
          {NAV.map((item, i) => {
            if ('section' in item) return <div key={i} className="nav-section">{(item as any).section}</div>;
            const it = item as any;
            if (it.perm && !canAny(it.perm)) return null;
            return (
              <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                <span className="icon">{it.icon}</span>{it.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-footer">System Administration v1.0<br/>Web · Mobile · Tablet</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div className="page-title">{TITLES[location.pathname] || 'Admin Panel'}</div>
          <div className="badge-stack">
            <span className="chip blue">Admin Console</span>
            <span className="chip">v1.0</span>
          </div>
          <div className="spacer" />
          <div style={{ position: 'relative' }} ref={menuRef}>
            <div className="user-chip" onClick={() => setMenu(!menu)}>
              <span className="avatar">{user?.name?.slice(0, 1)}</span>
              <span><div className="name">{user?.name}</div><div className="role">{user?.roles?.[0]?.name}</div></span>
              <span style={{ color: 'var(--ink-3)' }}>▾</span>
            </div>
            {menu && (
              <div className="card" style={{ position: 'absolute', right: 0, top: 46, width: 200, zIndex: 90, padding: 6, boxShadow: 'var(--shadow-lg)' }}>
                <button className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--danger)' }} onClick={async () => { await logout(); navigate('/login'); }}>🚪 Logout</button>
              </div>
            )}
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
