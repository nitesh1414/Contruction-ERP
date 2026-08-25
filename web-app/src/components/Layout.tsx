import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import type { NotificationItem } from '../api/types';
import { Badge } from './ui';

interface NavItem { to: string; label: string; icon: string; perm?: string; }
interface NavGroup { section: string; items: NavItem[]; }

const NAV: NavGroup[] = [
  {
    section: 'Main',
    items: [
      { to: '/', label: 'Dashboard', icon: '📊' },
      { to: '/projects', label: 'Projects', icon: '🏗️', perm: 'projects.view' },
      { to: '/progress', label: 'Daily Progress', icon: '📈', perm: 'progress.view' },
      { to: '/milestones', label: 'Milestones', icon: '🎯', perm: 'milestones.view' },
    ],
  },
  {
    section: 'Site Management',
    items: [
      { to: '/drawings', label: 'Drawings', icon: '📐', perm: 'drawings.view' },
      { to: '/issues', label: 'Issues', icon: '⚠️', perm: 'issues.view' },
      { to: '/inspections', label: 'Inspections', icon: '🔍', perm: 'inspections.view' },
      { to: '/test-reports', label: 'Test Reports', icon: '🧪', perm: 'test_reports.view' },
      { to: '/documents', label: 'Documents', icon: '📁', perm: 'documents.view' },
    ],
  },
  {
    section: 'Resources & Cost',
    items: [
      { to: '/materials', label: 'Materials', icon: '🧱', perm: 'materials.view' },
      { to: '/boq', label: 'BOQ', icon: '📋', perm: 'boq.view' },
      { to: '/billing', label: 'Billing & Cost', icon: '💰', perm: 'billing.view' },
      { to: '/workforce', label: 'Workforce', icon: '👷', perm: 'workers.view' },
      { to: '/sales', label: 'Sales', icon: '🏠', perm: 'sales.view' },
    ],
  },
  {
    section: 'Insights',
    items: [
      { to: '/reports', label: 'Reports', icon: '📑', perm: 'reports.view' },
    ],
  },
];

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await api.get('/notifications', { params: { limit: 12 } });
      setItems(res.data.data);
      setUnread(res.data.unreadCount || 0);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markRead = async (n: NotificationItem) => {
    if (!n.is_read) {
      try { await api.put(`/notifications/${n.id}/read`); } catch { /* ignore */ }
    }
    load();
    if (n.module && n.record_id) {
      const routes: Record<string, string> = {
        issues: '/issues', milestones: '/milestones', materials: '/materials', inventory: '/materials',
        inspections: '/inspections', test_reports: '/test-reports', sales: '/sales', documents: '/documents',
        drawings: '/drawings', purchase_orders: '/materials?tab=pos', system: '/',
      };
      navigate(routes[n.module] || '/');
      setOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="bell-btn" onClick={() => { setOpen(!open); if (!open) load(); }} aria-label="Notifications">
        🔔{unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 42, width: 340, zIndex: 90, boxShadow: 'var(--shadow-lg)', maxHeight: 430, overflowY: 'auto' }}>
          <div className="card-header" style={{ padding: '10px 14px' }}>
            <h3 style={{ margin: 0 }}>Notifications</h3>
            <div className="actions">
              <button className="btn ghost sm" onClick={async () => { await api.post('/notifications/mark-all-read'); load(); }}>Mark all read</button>
            </div>
          </div>
          {items.length === 0 ? (
            <div className="empty">No notifications</div>
          ) : (
            <ul className="pending-list">
              {items.map((n) => (
                <li key={n.id} onClick={() => markRead(n)} style={{ cursor: 'pointer', background: n.is_read ? 'transparent' : 'var(--brand-soft)', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</div>
                    {n.message && <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{n.message}</div>}
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                  <span className={`badge ${n.type === 'error' ? 'red' : n.type === 'warning' ? 'orange' : n.type === 'success' ? 'green' : 'blue'}`} style={{ fontSize: 0, padding: 3 }} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard', '/projects': 'Projects', '/progress': 'Daily Progress', '/milestones': 'Milestones',
  '/drawings': 'Drawings', '/issues': 'Issues', '/inspections': 'Inspections', '/test-reports': 'Test Reports',
  '/documents': 'Documents', '/materials': 'Materials & Inventory', '/boq': 'Bill of Quantities',
  '/billing': 'Billing & Cost', '/workforce': 'Workforce & Attendance', '/sales': 'Sales', '/reports': 'Reports', '/profile': 'My Profile',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, canAny } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [userMenu, setUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenu(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const title = PAGE_TITLES[location.pathname]
    || (location.pathname.startsWith('/projects/') ? 'Project Details' : 'Construction ERP');

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.svg" alt="ERP" />
          <span>Construction ERP<small>Project Tracking System</small></span>
        </div>
        <nav>
          {NAV.map((group) => {
            const items = group.items.filter((i) => !i.perm || canAny(i.perm));
            if (!items.length) return null;
            return (
              <div key={group.section}>
                <div className="nav-section">{group.section}</div>
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <span className="icon">{item.icon}</span>{item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">Construction ERP v1.0<br/>React + Express + MySQL</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">☰</button>
          <div className="page-title">{title}</div>
          <div className="spacer" />
          <NotificationsBell />
          <div style={{ position: 'relative' }} ref={userMenuRef}>
            <div className="user-chip" onClick={() => setUserMenu(!userMenu)}>
              <span className="avatar">{user?.name?.slice(0, 1)?.toUpperCase()}</span>
              <span>
                <div className="name">{user?.name}</div>
                <div className="role">{user?.roles?.[0]?.name || 'User'}</div>
              </span>
              <span style={{ color: 'var(--ink-3)' }}>▾</span>
            </div>
            {userMenu && (
              <div className="card" style={{ position: 'absolute', right: 0, top: 48, width: 200, zIndex: 90, boxShadow: 'var(--shadow-lg)', padding: 6 }}>
                <button className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => { setUserMenu(false); navigate('/profile'); }}>👤 My Profile</button>
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
