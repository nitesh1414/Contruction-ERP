import React, { useState } from 'react';
import { api, downloadExport, errMsg } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useFetch } from '../hooks/useFetch';
import {
  Badge, ConfirmDialog, DataTable, Field, fmtDate, fmtMoney, Modal, PaginationBar, StatCard, useToast,
} from '../components/ui';
import type { ColumnConfig } from '../api/types';

type Props = {
  slug: 'hrms' | 'petty-cash';
};

function HrmsAdminView() {
  const { can } = useAuth();
  const { data: summary } = useFetch<any>('/hrms/summary');
  const [employeePage, setEmployeePage] = useState(1);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const { data: employees, loading: employeesLoading } = useFetch<any>('/hrms/employees', {
    page: employeePage, limit: 20, search: employeeSearch,
  });
  const { data: leave, loading: leaveLoading, reload: reloadLeave } = useFetch<any>('/hrms/leave-requests', { limit: 8 });
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data: payroll, loading: payrollLoading, reload: reloadPayroll } = useFetch<any>('/hrms/payroll', { limit: 8, payroll_month: month });
  const employeeRows = employees?.data || [];
  const employeeTotal = employees?.pagination?.total ?? 0;
  const leaveRows = leave?.data || [];
  const payrollRows = payroll?.data || [];
  const linkedCount = summary?.linkedLogins ?? employeeRows.filter((employee: any) => employee.user_id).length;
  const toast = useToast();
  const [paymentFor, setPaymentFor] = useState<any>(null);
  const [payment, setPayment] = useState({ paid_amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_reference: '' });
  const [generating, setGenerating] = useState(false);

  const decideLeave = async (row: any, status: 'approved' | 'rejected') => {
    try { await api.put(`/hrms/leave-requests/${row.id}/decide`, { status }); toast.push(`Leave ${status}`); reloadLeave(); }
    catch (error) { toast.push(errMsg(error), 'error'); }
  };
  const openPayment = (row: any) => {
    setPaymentFor(row);
    setPayment({ paid_amount: row.paid_amount ? String(row.paid_amount) : String(row.net_pay || ''), payment_date: row.payment_date ? String(row.payment_date).slice(0, 10) : new Date().toISOString().slice(0, 10), payment_reference: row.payment_reference || '' });
  };
  const savePayment = async () => {
    if (!paymentFor) return;
    try { await api.put(`/hrms/payroll/${paymentFor.id}/payment`, { ...payment, paid_amount: Number(payment.paid_amount || 0) }); toast.push('Payroll payment updated'); setPaymentFor(null); reloadPayroll(); }
    catch (error) { toast.push(errMsg(error), 'error'); }
  };
  const generatePayroll = async () => {
    setGenerating(true);
    try { const response = await api.post('/hrms/payroll/generate-bulk', { payroll_month: month }); const skipped = response.data?.skipped?.length || 0; toast.push(skipped ? `Payroll generated with ${skipped} skipped record(s)` : `Payroll generated for ${month}`, skipped ? 'info' : 'success'); reloadPayroll(); }
    catch (error) { toast.push(errMsg(error), 'error'); }
    finally { setGenerating(false); }
  };

  const employeeColumns: ColumnConfig<any>[] = [
    { key: 'employee_code', label: 'Code' },
    { key: 'name', label: 'Employee', render: (row) => <strong>{row.name}</strong> },
    { key: 'designation', label: 'Designation', render: (row) => <span>{row.designation}{row.designation_role_name ? ` · ${row.designation_role_name}` : ''}</span> },
    { key: 'department', label: 'Department' },
    { key: 'project_name', label: 'Project' },
    { key: 'user_id', label: 'Login', render: (row) => row.user_id
      ? <Badge value="completed" label={`Linked${row.user_name ? ` · ${row.user_name}` : ''}`} />
      : <Badge value="draft" label="No login" /> },
    { key: 'status', label: 'Status', render: (row) => <Badge value={row.status} /> },
  ];
  const leaveColumns: ColumnConfig<any>[] = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'leave_type_code', label: 'Type', render: (row) => <Badge value="info" label={row.leave_type_code} /> },
    { key: 'from_date', label: 'From', render: (row) => fmtDate(row.from_date) },
    { key: 'to_date', label: 'To', render: (row) => fmtDate(row.to_date) },
    { key: 'total_days', label: 'Days' },
    { key: 'status', label: 'Status', render: (row) => <Badge value={row.status} /> },
    { key: '_actions', label: '', align: 'right', render: (row) => row.status === 'pending' && can('hrms.approve') ? <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}><button className="btn outline sm" onClick={() => decideLeave(row, 'approved')}>Approve</button><button className="btn outline sm" style={{ color: 'var(--danger)' }} onClick={() => decideLeave(row, 'rejected')}>Reject</button></div> : null },
  ];
  const payrollColumns: ColumnConfig<any>[] = [
    { key: 'employee_name', label: 'Employee', render: (row) => <strong>{row.employee_name}</strong> },
    { key: 'gross_pay', label: 'Gross', render: (row) => fmtMoney(row.gross_pay), align: 'right' },
    { key: 'net_pay', label: 'Net', render: (row) => fmtMoney(row.net_pay), align: 'right' },
    { key: 'paid_amount', label: 'Paid', render: (row) => fmtMoney(row.paid_amount), align: 'right' },
    { key: 'payment_status', label: 'Payment', render: (row) => <Badge value={row.payment_status} /> },
    { key: '_actions', label: '', align: 'right', render: (row) => can('hrms.edit') ? <button className="btn outline sm" onClick={() => openPayment(row)}>Record payment</button> : null },
  ];

  return (
    <div>
      <div className="page-intro" style={{ marginBottom: 14 }}>
        <div><h2 style={{ marginBottom: 3 }}>HR & Payroll operations</h2><p className="muted" style={{ margin: 0 }}>Employee identity, login access, leave approvals and payroll status in one admin view.</p></div>
        <div className="actions"><span className="chip blue">{can('hrms.edit') ? 'Operational access' : 'Read-only access'}</span>{can('hrms.create') && <button className="btn primary sm" disabled={generating} onClick={generatePayroll}>{generating ? 'Generating…' : 'Generate payroll'}</button>}</div>
      </div>
      <div className="stat-grid">
        <StatCard icon="👥" label="Active employees" value={summary?.active ?? '—'} color="var(--brand-soft)" />
        <StatCard icon="🔐" label="Linked logins" value={linkedCount ?? '—'} sub="Shown in current employee page" color="var(--accent-soft)" />
        <StatCard icon="⏳" label="Pending leave" value={summary?.pendingLeave ?? '—'} color="var(--warning-soft)" />
        <StatCard icon="💳" label={`Payroll due · ${summary?.month || month}`} value={fmtMoney(summary?.payroll?.pending_net ?? summary?.payroll?.net_due)} color="var(--success-soft)" />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header">
          <div><h3>Employee identity & login coverage</h3><span className="muted" style={{ fontSize: 12 }}>Shared with the Project Tracking HR & Payroll panel · {employeeTotal} total</span></div>
          <input className="input" value={employeeSearch} onChange={(event) => { setEmployeeSearch(event.target.value); setEmployeePage(1); }} placeholder="Search employees…" style={{ width: 190, marginLeft: 'auto' }} />
        </div>
        <DataTable columns={employeeColumns} rows={employeeRows} loading={employeesLoading} rowKey="id" />
        <PaginationBar page={employeePage} total={employeeTotal} limit={20} onPage={setEmployeePage} />
      </div>
      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="card-header"><h3>Recent leave workflow</h3></div>
          <DataTable columns={leaveColumns} rows={leaveRows} loading={leaveLoading} rowKey="id" />
        </div>
        <div className="card">
          <div className="card-header"><h3>Payroll payment status</h3><input className="input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} style={{ width: 140, marginLeft: 'auto' }} /></div>
          <DataTable columns={payrollColumns} rows={payrollRows} loading={payrollLoading} rowKey="id" />
        </div>
      </div>
      {paymentFor && <Modal title={`Record payment · ${paymentFor.employee_name}`} onClose={() => setPaymentFor(null)} size="sm"
        footer={<><button className="btn outline" onClick={() => setPaymentFor(null)}>Cancel</button><button className="btn primary" onClick={savePayment}>Save payment</button></>}>
        <p className="form-hint" style={{ marginTop: 0 }}>Net payable: <strong>{fmtMoney(paymentFor.net_pay)}</strong>. Payment status is calculated from the amount.</p>
        <Field config={{ key: 'paid_amount', label: 'Amount paid (₹)', type: 'number', required: true }} value={payment.paid_amount} onChange={(value) => setPayment((state) => ({ ...state, paid_amount: value }))} />
        <Field config={{ key: 'payment_date', label: 'Payment date', type: 'date' }} value={payment.payment_date} onChange={(value) => setPayment((state) => ({ ...state, payment_date: value }))} />
        <Field config={{ key: 'payment_reference', label: 'Reference / UTR', type: 'text' }} value={payment.payment_reference} onChange={(value) => setPayment((state) => ({ ...state, payment_reference: value }))} />
      </Modal>}
    </div>
  );
}

const CATEGORIES = [
  { value: 'travel', label: 'Travel / local conveyance' },
  { value: 'food_catering', label: 'Food / tea / refreshments' },
  { value: 'fuel', label: 'Fuel & lubricants' },
  { value: 'labour_incentive', label: 'Labour incentives / advances' },
  { value: 'tools', label: 'Tools & small consumables' },
  { value: 'office_admin', label: 'Office & admin' },
  { value: 'misc', label: 'Misc / others' },
];

function PettyCashAdminView() {
  const toast = useToast();
  const { can } = useAuth();
  const [projectId, setProjectId] = useState('');
  const [page, setPage] = useState(1);
  const { data: projects } = useFetch<any>('/projects', { limit: 200 });
  const { data, loading, reload } = useFetch<any>('/petty-cash', { page, limit: 20, projectId: projectId || undefined });
  const { data: summary } = useFetch<any>(projectId ? '/petty-cash/summary' : null, { projectId: projectId || undefined });
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState<any>({ txn_type: 'expense', txn_date: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const rows = data?.data || [];

  const openNew = () => { setForm({ project_id: projectId ? Number(projectId) : '', txn_type: 'expense', category: 'misc', txn_date: new Date().toISOString().slice(0, 10), amount: '', description: '', paid_to: '' }); setEdit('new'); };
  const openEdit = (row: any) => { setForm({ ...row }); setEdit(row); };
  const save = async () => {
    if (!form.project_id || !form.amount || !form.txn_date) { toast.push('Project, amount and date are required', 'error'); return; }
    if (form.txn_type === 'expense' && !form.paid_to) { toast.push('Paid to is required for an expense', 'error'); return; }
    setBusy(true);
    try {
      const payload = { ...form, project_id: Number(form.project_id), amount: Number(form.amount) };
      if (edit === 'new') await api.post('/petty-cash', payload);
      else await api.put(`/petty-cash/${edit.id}`, payload);
      toast.push(edit === 'new' ? 'Petty-cash entry added' : 'Petty-cash entry updated');
      setEdit(null); reload();
    } catch (error) { toast.push(errMsg(error), 'error'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await api.delete(`/petty-cash/${deleting.id}`); toast.push('Petty-cash entry deleted'); setDeleting(null); reload(); }
    catch (error) { toast.push(errMsg(error), 'error'); }
    finally { setBusy(false); }
  };
  const exportRows = async () => {
    try { await downloadExport(`/petty-cash/export${projectId ? `?projectId=${projectId}` : ''}`, 'petty-cash.csv'); toast.push('Petty-cash export downloaded'); }
    catch (error) { toast.push(errMsg(error), 'error'); }
  };
  const columns: ColumnConfig<any>[] = [
    { key: 'txn_date', label: 'Date', render: (row) => fmtDate(row.txn_date) },
    { key: 'project_name', label: 'Project' },
    { key: 'txn_type', label: 'Type', render: (row) => <Badge value={row.txn_type === 'expense' ? 'warning' : 'success'} label={row.txn_type} /> },
    { key: 'category', label: 'Category', render: (row) => CATEGORIES.find((category) => category.value === row.category)?.label || row.category || '—' },
    { key: 'paid_to', label: 'Paid to' },
    { key: 'amount', label: 'Amount', render: (row) => fmtMoney(row.amount), align: 'right' },
    { key: '_actions', label: '', align: 'right', render: (row) => <div className="flex gap-sm" style={{ justifyContent: 'flex-end' }}>
      {can('petty_cash.edit') && <button className="btn outline sm" onClick={() => openEdit(row)}>Edit</button>}
      {can('petty_cash.delete') && <button className="btn outline sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleting(row)}>Delete</button>}
    </div> },
  ];

  return (
    <div>
      <div className="page-intro" style={{ marginBottom: 14 }}>
        <div><h2 style={{ marginBottom: 3 }}>Petty Cash operations</h2><p className="muted" style={{ margin: 0 }}>Project-scoped top-ups, expenses, replenishments and receipts.</p></div>
        <div className="actions"><button className="btn outline sm" onClick={exportRows}>⬇ Export</button>{can('petty_cash.create') && <button className="btn primary sm" onClick={openNew}>+ Add entry</button>}</div>
      </div>
      <div className="filter-bar">
        <div className="field" style={{ minWidth: 260 }}><label>Project summary</label><select className="input" value={projectId} onChange={(event) => { setProjectId(event.target.value); setPage(1); }}><option value="">All accessible projects</option>{(projects?.data || []).map((project: any) => <option key={project.id} value={project.id}>{project.name} · {project.code}</option>)}</select></div>
      </div>
      {projectId && summary && <div className="stat-grid" style={{ marginBottom: 14 }}>
        <StatCard icon="💰" label="Balance" value={fmtMoney(summary.balance)} color="var(--success-soft)" />
        <StatCard icon="➕" label="Top-ups" value={fmtMoney(summary.total_topup)} color="var(--accent-soft)" />
        <StatCard icon="🧾" label="Expenses" value={fmtMoney(summary.total_expense)} color="var(--warning-soft)" />
        <StatCard icon="📒" label="Entries" value={summary.total_entries ?? '—'} color="var(--brand-soft)" />
      </div>}
      <div className="card"><div className="card-header"><h3>Cash ledger</h3></div><DataTable columns={columns} rows={rows} loading={loading} rowKey="id" /><PaginationBar page={page} total={data?.pagination?.total || 0} limit={20} onPage={setPage} /></div>
      {edit !== null && <Modal title={edit === 'new' ? 'New petty-cash entry' : 'Edit petty-cash entry'} onClose={() => setEdit(null)} size="lg" footer={<><button className="btn outline" onClick={() => setEdit(null)} disabled={busy}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save entry'}</button></>}>
        <div className="form-grid">
          <Field config={{ key: 'project_id', label: 'Project', type: 'select', required: true, options: (projects?.data || []).map((project: any) => ({ value: project.id, label: `${project.name} · ${project.code}` })) }} value={form.project_id} onChange={(value) => setForm((state: any) => ({ ...state, project_id: value }))} />
          <Field config={{ key: 'txn_type', label: 'Transaction type', type: 'select', required: true, options: [{ value: 'expense', label: 'Expense' }, { value: 'topup', label: 'Top-up' }, { value: 'replenish', label: 'Replenish' }] }} value={form.txn_type} onChange={(value) => setForm((state: any) => ({ ...state, txn_type: value }))} />
          <Field config={{ key: 'category', label: 'Category', type: 'select', options: CATEGORIES }} value={form.category} onChange={(value) => setForm((state: any) => ({ ...state, category: value }))} />
          <Field config={{ key: 'amount', label: 'Amount (₹)', type: 'number', required: true }} value={form.amount} onChange={(value) => setForm((state: any) => ({ ...state, amount: value }))} />
          <Field config={{ key: 'txn_date', label: 'Date', type: 'date', required: true }} value={form.txn_date} onChange={(value) => setForm((state: any) => ({ ...state, txn_date: value }))} />
          <Field config={{ key: 'paid_to', label: 'Paid to' , type: 'text' }} value={form.paid_to} onChange={(value) => setForm((state: any) => ({ ...state, paid_to: value }))} />
          <Field config={{ key: 'received_by', label: 'Received by', type: 'text' }} value={form.received_by} onChange={(value) => setForm((state: any) => ({ ...state, received_by: value }))} />
          <Field config={{ key: 'description', label: 'Description', type: 'text' }} value={form.description} onChange={(value) => setForm((state: any) => ({ ...state, description: value }))} />
          <Field config={{ key: 'remarks', label: 'Remarks', type: 'textarea', width: 'full' }} value={form.remarks} onChange={(value) => setForm((state: any) => ({ ...state, remarks: value }))} />
        </div>
      </Modal>}
      {deleting && <ConfirmDialog message={`Delete petty-cash entry "${deleting.description || deleting.paid_to || deleting.txn_type}"?`} onCancel={() => setDeleting(null)} onConfirm={remove} busy={busy} />}
    </div>
  );
}

export default function ExternalModule({ slug }: Props) {
  return slug === 'hrms' ? <HrmsAdminView /> : <PettyCashAdminView />;
}
