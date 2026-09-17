import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Roles from './pages/Roles';
import Masters from './pages/Masters';
import ProjectsAdmin from './pages/ProjectsAdmin';
import AuditLogs from './pages/AuditLogs';
import Broadcast from './pages/Broadcast';
import ExternalModule from './pages/ExternalModule';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="spinner-wrap" style={{ height: '100vh' }}><div className="spinner" /><span>Loading…</span></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Require({ perm, children }: { perm?: string | null; children: React.ReactElement }) {
  const { canAny } = useAuth();
  if (perm && !canAny(perm)) {
    return <div className="card card-pad empty"><div className="big">🔒</div><h2>No access</h2><p>You don't have permission to view this section.</p></div>;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Layout><Dashboard /></Layout></RequireAuth>} />
      <Route path="/users" element={<RequireAuth><Layout><Require perm="users.view"><Users /></Require></Layout></RequireAuth>} />
      <Route path="/roles" element={<RequireAuth><Layout><Require perm="roles.view"><Roles /></Require></Layout></RequireAuth>} />
      <Route path="/projects" element={<RequireAuth><Layout><Require perm="projects.view"><ProjectsAdmin /></Require></Layout></RequireAuth>} />
      <Route path="/masters" element={<RequireAuth><Layout><Masters /></Layout></RequireAuth>} />
      <Route path="/hrms" element={<RequireAuth><Layout><Require perm="hrms.view"><ExternalModule slug="hrms" /></Require></Layout></RequireAuth>} />
      <Route path="/petty-cash" element={<RequireAuth><Layout><Require perm="petty_cash.view"><ExternalModule slug="petty-cash" /></Require></Layout></RequireAuth>} />
      <Route path="/audit-logs" element={<RequireAuth><Layout><Require perm="admin.view"><AuditLogs /></Require></Layout></RequireAuth>} />
      <Route path="/notifications" element={<RequireAuth><Layout><Require perm="notifications.create"><Broadcast /></Require></Layout></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
