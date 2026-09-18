export interface Role { id: number; name: string; code: string; }

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  phone?: string;
  employee_code?: string;
  profile_photo?: string;
  status: 'active' | 'inactive';
  roles: Role[];
  permissions: string[];
  isSuperAdmin: boolean;
  projectAccess: { project_id: number; wing_id: number; project_name: string; wing_name?: string | null }[];
  employee?: {
    id: number; employee_code: string; department?: string | null; designation?: string | null; effective_designation?: string | null; designation_role_name?: string | null;
    date_of_joining?: string | null; employment_type?: string | null; status?: string | null;
    project_name?: string | null; wing_name?: string | null;
  } | null;
}

export interface Paginated<T> {
  success: boolean;
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface ApiResp<T> { success: boolean; data: T; message?: string; unreadCount?: number; duplicate?: boolean; }

export interface Project {
  id: number;
  name: string;
  code: string;
  project_type: string;
  client_name?: string;
  developer_name?: string;
  address?: string; city?: string; state?: string; pincode?: string;
  description?: string;
  start_date?: string;
  expected_completion_date?: string;
  actual_completion_date?: string;
  status: 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
  budget: number;
  overall_progress: number;
  manager_id?: number;
  manager_name?: string;
  wing_count?: number;
  wings?: Wing[];
}

export interface Wing {
  id: number; project_id: number; name: string; code: string;
  floors_count: number; units_count: number;
  start_date?: string; expected_completion_date?: string;
  status: string; progress: number; description?: string;
  project_name?: string;
}

export interface Floor { id: number; project_id: number; wing_id: number; name: string; sequence: number; status: string; progress: number; wing_name?: string; }

export interface UnitInfo {
  id: number; project_id: number; wing_id: number; floor_id?: number;
  unit_number: string; unit_type?: string; carpet_area?: number; saleable_area?: number;
  facing?: string; status: 'available' | 'booked' | 'sold' | 'blocked'; price?: number;
  wing_name?: string; floor_name?: string;
}

export interface ProgressEntry {
  id: number; project_id: number; wing_id?: number; floor_id?: number;
  report_date: string; work_time?: string; work_description?: string; work_completed?: string;
  percentage: number; labour_count: number; material_used?: string; weather?: string; remarks?: string;
  latitude?: number; longitude?: number;
  project_name?: string; wing_name?: string; floor_name?: string; created_by_name?: string;
  photos?: ProgressPhoto[];
}

export interface ProgressPhoto {
  id: number; progress_id: number; file_id?: number; file_path: string; original_name?: string;
  latitude?: number; longitude?: number; captured_at?: string; source: 'camera' | 'upload';
  uploaded_by_name?: string;
}

export interface Milestone {
  id: number; project_id: number; wing_id?: number; name: string; description?: string;
  start_date?: string; target_date?: string; completion_date?: string;
  percentage: number; status: 'pending' | 'in_progress' | 'completed' | 'delayed';
  responsible_user_id?: number; project_name?: string; wing_name?: string; responsible_name?: string; remarks?: string;
}

export interface Drawing {
  id: number; project_id: number; wing_id?: number; category: string;
  drawing_number: string; title: string; approval_status: string; latest_revision?: string;
  project_name?: string; wing_name?: string; current_revision?: string; remarks?: string;
}

export interface Material { id: number; category_id?: number; name: string; code: string; unit: string; description?: string; min_stock_level: number; is_active: number; category_name?: string; }

export interface StockRow {
  project_id: number; project_name: string; material_id: number; material_name: string; material_code: string;
  unit: string; min_stock_level: number; total_received: number; total_consumed: number;
  total_damaged: number; total_returned: number; current_stock: number; low_stock?: boolean | number;
}

export interface Issue {
  id: number; issue_number: string; project_id: number; wing_id?: number; floor_id?: number;
  location?: string; category_id?: number; category_name?: string; priority: 'low' | 'medium' | 'high' | 'critical';
  title: string; description?: string; status: string; due_date?: string;
  raised_by_name?: string; assigned_to_name?: string; assigned_to?: number;
  project_name?: string; wing_name?: string;
}

export interface NotificationItem {
  id: number; title: string; message?: string; type: 'info' | 'success' | 'warning' | 'error';
  module?: string; record_id?: string; is_read: number; created_at: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  /** Optional — omitted means a plain text input. */
  type?: 'text' | 'number' | 'date' | 'time' | 'select' | 'textarea' | 'checkbox' | 'email' | 'password' | 'datetime-local';
  options?: { value: string | number; label: string }[];
  optionsEndpoint?: string;
  optionsParams?: Record<string, any>;
  optionsValueKey?: string;
  optionsLabelKey?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  width?: 'full' | 'half';
}

export interface ColumnConfig<T = any> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
  hideOnMobile?: boolean;
  /** Preferred column width, e.g. 110 or '8rem'. Applied to the header cell. */
  width?: number | string;
}
