export interface RoleRef {
  id: number;
  name: string;
  code: string;
}

export interface UserProjectAccess {
  project_id: number;
  wing_id: number | null;
  project_name: string;
  wing_name: string | null;
}

export interface UserProfile {
  id: number;
  employee_code: string | null;
  name: string;
  email: string;
  phone: string | null;
  profile_photo: string | null;
  status: string;
  last_login_at: string | null;
  roles: RoleRef[];
  permissions: string[];
  isSuperAdmin: boolean;
  projects: UserProjectAccess[];
}

export interface LoginResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
}

export interface Project {
  id: number;
  code: string;
  name: string;
  client_name: string | null;
  city: string | null;
  status: string;
  progress: number;
  start_date: string | null;
  end_date: string | null;
}

export interface Wing {
  id: number;
  project_id: number;
  code: string | null;
  name: string;
  status: string;
  progress: number;
}

export interface Floor {
  id: number;
  wing_id: number;
  project_id: number;
  name: string;
  floor_number: number;
}

export interface ProgressPhoto {
  id: number;
  progress_id: number;
  latitude: number | null;
  longitude: number | null;
  captured_at: string | null;
  source: string;
  file_path: string;
  original_name: string;
  file_id?: number;
  uploaded_by_name?: string;
}

export interface ProgressEntry {
  id: number;
  project_id: number;
  wing_id: number | null;
  floor_id: number | null;
  report_date: string;
  work_time: string | null;
  work_description: string | null;
  work_completed: string | null;
  percentage: number;
  labour_count: number;
  material_used: string | null;
  weather: string | null;
  remarks: string | null;
  latitude: number | null;
  longitude: number | null;
  project_name?: string;
  wing_name?: string | null;
  floor_name?: string | null;
  created_by_name?: string;
  photos?: ProgressPhoto[];
}

export interface Worker {
  id: number;
  worker_code: string;
  name: string;
  phone: string | null;
  category_id: number | null;
  category_name?: string | null;
  contractor_name?: string | null;
  daily_wage: number;
  overtime_rate: number;
  project_id: number;
  wing_id: number | null;
  is_active: number;
}

export type AttendanceStatus = 'present' | 'absent' | 'leave' | 'half_day' | 'overtime';

export interface AttendanceRecord {
  id: number;
  worker_id: number;
  worker_name?: string;
  attendance_date: string;
  status: AttendanceStatus;
  overtime_hours: number;
  daily_amount: number;
  overtime_amount: number;
}

export interface Issue {
  id: number;
  issue_number: string;
  project_id: number;
  wing_id: number | null;
  floor_id: number | null;
  location: string | null;
  category_id: number | null;
  category_name?: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  raised_by: number;
  raised_by_name?: string;
  assigned_to: number | null;
  assigned_to_name?: string | null;
  due_date: string | null;
  status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'reopened' | 'closed';
  remarks: string | null;
  created_at: string;
  project_name?: string;
  wing_name?: string | null;
  photos?: ProgressPhoto[];
}

export interface IssueCategory {
  id: number;
  name: string;
}

export interface InspectionItem {
  id: number;
  inspection_id: number;
  checklist_item: string;
  result: 'pending' | 'pass' | 'fail' | 'na';
  remarks: string | null;
}

export interface Inspection {
  id: number;
  inspection_number: string;
  project_id: number;
  wing_id: number | null;
  floor_id: number | null;
  inspection_type_id: number;
  inspection_type_name?: string | null;
  location: string | null;
  inspector_id: number | null;
  inspector_name?: string | null;
  inspection_date: string;
  observation: string | null;
  status: 'pending' | 'passed' | 'failed' | 'reinspection_required' | 'closed';
  remarks: string | null;
  latitude: number | null;
  longitude: number | null;
  project_name?: string;
  wing_name?: string | null;
  items?: InspectionItem[];
  photos?: Array<{ id: number; file_path: string; original_name: string; file_type: string }>;
}

export interface InspectionType {
  id: number;
  name: string;
  checklist_template: string | null;
}

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  type: string;
  is_read: number;
  created_at: string;
}

export interface DashboardOverview {
  projects: {
    total: number;
    avgProgress: number;
    totalBudget: number;
    byStatus: Array<{ status: string; count: number }>;
  };
  wings: { total: number };
  progressTrend: Array<{ d: string; reports: number; avg_pct: number }>;
  materials: { lowStockCount: number };
  issues: { open: number; critical: number };
  inspections: { pending: number };
  testReports: { pending: number };
  attendanceToday: Array<{ status: string; count: number }>;
  payments: {
    labour: { count: number; amount: number };
    vendors: { amount: number };
  };
  sales: { unitsSold: number; value: number; received: number; pending: number };
  costs: { total: number };
  milestones: Array<{ status: string; count: number }>;
  recentProgress: Array<{
    id: number;
    report_date: string;
    percentage: number;
    work_description: string | null;
    project_name: string;
    wing_name: string | null;
    created_by_name: string | null;
  }>;
  recentIssues: Array<{
    id: number;
    issue_number: string;
    title: string;
    priority: string;
    status: string;
    project_name: string;
  }>;
  documentsExpiring: Array<{ id: number; title: string; expiry_date: string }>;
  budgetVsActual: Array<{ id: number; name: string; code: string; budget: number; actual_cost: number }>;
}

export interface Paged<T> {
  success: boolean;
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ApiOk<T> {
  success: boolean;
  data: T;
  message?: string;
  duplicate?: boolean;
}
