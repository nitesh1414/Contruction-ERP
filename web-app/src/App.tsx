import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import ProgressPage from './pages/ProgressPage';
import Milestones from './pages/Milestones';
import Drawings from './pages/Drawings';
import Materials from './pages/Materials';
import BoqList from './pages/BoqList';
import BoqDetail from './pages/BoqDetail';
import Billing from './pages/Billing';
import Quality from './pages/Quality';
import Issues from './pages/Issues';
import Workforce from './pages/Workforce';
import HRMS from './pages/HRMS';
import PettyCash from './pages/PettyCash';
import SalesPage from './pages/SalesPage';
import Documents from './pages/Documents';
import Reports from './pages/Reports';
import Equipment from './pages/Equipment';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="spinner-wrap" style={{ height: '100vh' }}><div className="spinner" /><span>Loading…</span></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function RequirePermission({ perm, children }: { perm: string; children: React.ReactElement }) {
  const { canAny } = useAuth();
  if (!canAny(perm)) {
    return (
      <div className="card card-pad empty">
        <div className="big">🔒</div>
        <h2>No access</h2>
        <p>You don't have permission to view this module. Contact your administrator.</p>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/"
        element={<RequireAuth><Layout>
          <Dashboard />
        </Layout></RequireAuth>}
      />
      <Route path="/profile" element={<RequireAuth><Layout><Profile /></Layout></RequireAuth>} />
      <Route path="/projects" element={<RequireAuth><Layout><RequirePermission perm="projects.view"><Projects /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/projects/:id" element={<RequireAuth><Layout><RequirePermission perm="projects.view"><ProjectDetail /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/projects/:id/wings/:wingId" element={<RequireAuth><Layout><RequirePermission perm="projects.view"><ProjectDetail /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/progress" element={<RequireAuth><Layout><RequirePermission perm="progress.view"><ProgressPage /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/milestones" element={<RequireAuth><Layout><RequirePermission perm="milestones.view"><Milestones /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/drawings" element={<RequireAuth><Layout><RequirePermission perm="drawings.view"><Drawings /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/materials" element={<RequireAuth><Layout><RequirePermission perm="materials.view"><Materials /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/boq" element={<RequireAuth><Layout><RequirePermission perm="boq.view"><BoqList /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/boq/:id" element={<RequireAuth><Layout><RequirePermission perm="boq.view"><BoqDetail /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/billing" element={<RequireAuth><Layout><RequirePermission perm="billing.view"><Billing /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/inspections" element={<RequireAuth><Layout><RequirePermission perm="inspections.view"><Quality tab="inspections" /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/test-reports" element={<RequireAuth><Layout><RequirePermission perm="test_reports.view"><Quality tab="tests" /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/issues" element={<RequireAuth><Layout><RequirePermission perm="issues.view"><Issues /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/workforce" element={<RequireAuth><Layout><RequirePermission perm="workers.view"><Workforce /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/hrms" element={<RequireAuth><Layout><RequirePermission perm="hrms.view"><HRMS /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/petty-cash" element={<RequireAuth><Layout><RequirePermission perm="petty_cash.view"><PettyCash /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/sales" element={<RequireAuth><Layout><RequirePermission perm="sales.view"><SalesPage /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/documents" element={<RequireAuth><Layout><RequirePermission perm="documents.view"><Documents /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><Layout><RequirePermission perm="reports.view"><Reports /></RequirePermission></Layout></RequireAuth>} />
      <Route path="/equipment" element={<RequireAuth><Layout><RequirePermission perm="projects.view"><Equipment /></RequirePermission></Layout></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
