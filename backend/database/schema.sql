-- ============================================================================
-- Construction Project Tracking System (Construction ERP)
-- MySQL 8.x Schema  ·  InnoDB  ·  utf8mb4
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS)
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 1. Identity & Access
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_code   VARCHAR(30)  NULL UNIQUE,
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(160) NOT NULL UNIQUE,
  phone           VARCHAR(20)  NULL,
  password_hash   VARCHAR(100) NOT NULL,
  profile_photo   VARCHAR(255) NULL,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  last_login_at   DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  code        VARCHAR(60)  NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  is_system   TINYINT(1) NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  module      VARCHAR(60) NOT NULL,
  action      ENUM('view','create','edit','delete','approve','export','upload','download') NOT NULL,
  code        VARCHAR(80) NOT NULL UNIQUE,
  label       VARCHAR(120) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role  FOREIGN KEY (role_id)       REFERENCES roles(id)       ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- wing_id = 0  means "all wings of this project"
CREATE TABLE IF NOT EXISTS user_projects (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  wing_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_project_wing (user_id, project_id, wing_id),
  CONSTRAINT fk_up_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(100) NOT NULL,
  device_info VARCHAR(255) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rt_user (user_id),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_push_tokens (
  user_id         BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  expo_push_token VARCHAR(120) NOT NULL,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_upt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(100) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prt_user (user_id),
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Projects / Wings / Floors / Units
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name                      VARCHAR(160) NOT NULL,
  code                      VARCHAR(30)  NOT NULL UNIQUE,
  project_type              ENUM('residential','commercial','industrial','infrastructure','mixed','other') NOT NULL DEFAULT 'residential',
  client_name               VARCHAR(160) NULL,
  developer_name            VARCHAR(160) NULL,
  address                   VARCHAR(255) NULL,
  city                      VARCHAR(100) NULL,
  state                     VARCHAR(100) NULL,
  pincode                   VARCHAR(10)  NULL,
  description               TEXT NULL,
  start_date                DATE NULL,
  expected_completion_date  DATE NULL,
  actual_completion_date    DATE NULL,
  status                    ENUM('planning','in_progress','on_hold','completed','cancelled') NOT NULL DEFAULT 'planning',
  budget                    DECIMAL(15,2) NOT NULL DEFAULT 0,
  overall_progress          DECIMAL(5,2) NOT NULL DEFAULT 0,
  manager_id                BIGINT UNSIGNED NULL,
  created_by                BIGINT UNSIGNED NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_projects_status (status),
  INDEX idx_projects_manager (manager_id),
  CONSTRAINT fk_projects_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_projects_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wings (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id                BIGINT UNSIGNED NOT NULL,
  name                      VARCHAR(120) NOT NULL,
  code                      VARCHAR(30)  NOT NULL,
  floors_count              INT NOT NULL DEFAULT 0,
  units_count               INT NOT NULL DEFAULT 0,
  start_date                DATE NULL,
  expected_completion_date  DATE NULL,
  actual_completion_date    DATE NULL,
  status                    ENUM('planning','in_progress','on_hold','completed','cancelled') NOT NULL DEFAULT 'planning',
  progress                  DECIMAL(5,2) NOT NULL DEFAULT 0,
  description               TEXT NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wings_project_code (project_id, code),
  CONSTRAINT fk_wings_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FK added after user_projects/projects chain (user_projects references projects? no - it doesn't; safe to add now)
ALTER TABLE user_projects
  ADD CONSTRAINT fk_up_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS floors (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id     BIGINT UNSIGNED NOT NULL,
  wing_id        BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(60) NOT NULL,
  sequence       INT NOT NULL DEFAULT 0,
  status         ENUM('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
  progress       DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_floors_wing_seq (wing_id, sequence),
  CONSTRAINT fk_floors_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_floors_wing    FOREIGN KEY (wing_id)    REFERENCES wings(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS units (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT UNSIGNED NOT NULL,
  wing_id         BIGINT UNSIGNED NOT NULL,
  floor_id        BIGINT UNSIGNED NULL,
  unit_number     VARCHAR(30) NOT NULL,
  unit_type       VARCHAR(40) NULL,
  carpet_area     DECIMAL(10,2) NULL,
  saleable_area   DECIMAL(10,2) NULL,
  facing          VARCHAR(40) NULL,
  status          ENUM('available','booked','sold','blocked') NOT NULL DEFAULT 'available',
  price           DECIMAL(15,2) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_units_wing_number (wing_id, unit_number),
  CONSTRAINT fk_units_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_units_wing    FOREIGN KEY (wing_id)    REFERENCES wings(id)    ON DELETE CASCADE,
  CONSTRAINT fk_units_floor   FOREIGN KEY (floor_id)   REFERENCES floors(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. Milestones / Daily Progress
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS milestones (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id          BIGINT UNSIGNED NOT NULL,
  wing_id             BIGINT UNSIGNED NULL,
  name                VARCHAR(160) NOT NULL,
  description         TEXT NULL,
  start_date          DATE NULL,
  target_date         DATE NULL,
  completion_date     DATE NULL,
  percentage          DECIMAL(5,2) NOT NULL DEFAULT 0,
  status              ENUM('pending','in_progress','completed','delayed') NOT NULL DEFAULT 'pending',
  responsible_user_id BIGINT UNSIGNED NULL,
  remarks             VARCHAR(255) NULL,
  created_by          BIGINT UNSIGNED NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ms_project (project_id, status),
  CONSTRAINT fk_ms_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_ms_wing    FOREIGN KEY (wing_id)    REFERENCES wings(id)    ON DELETE SET NULL,
  CONSTRAINT fk_ms_resp    FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_progress (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id       BIGINT UNSIGNED NOT NULL,
  wing_id          BIGINT UNSIGNED NULL,
  floor_id         BIGINT UNSIGNED NULL,
  report_date      DATE NOT NULL,
  work_time        TIME NULL,
  work_description TEXT NULL,
  work_completed   TEXT NULL,
  percentage       DECIMAL(5,2) NOT NULL DEFAULT 0,
  labour_count     INT NOT NULL DEFAULT 0,
  material_used    TEXT NULL,
  weather          VARCHAR(60) NULL,
  remarks          VARCHAR(255) NULL,
  latitude         DECIMAL(10,7) NULL,
  longitude        DECIMAL(10,7) NULL,
  client_ref       VARCHAR(64) NULL UNIQUE,
  created_by       BIGINT UNSIGNED NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dp_project_date (project_id, report_date),
  CONSTRAINT fk_dp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_dp_wing    FOREIGN KEY (wing_id)    REFERENCES wings(id)    ON DELETE SET NULL,
  CONSTRAINT fk_dp_floor   FOREIGN KEY (floor_id)   REFERENCES floors(id)   ON DELETE SET NULL,
  CONSTRAINT fk_dp_user    FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. File uploads (central file registry)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS file_uploads (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  file_name      VARCHAR(255) NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  file_path      VARCHAR(255) NOT NULL,
  file_type      VARCHAR(100) NOT NULL,
  extension      VARCHAR(12)  NOT NULL,
  size_bytes     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  related_module VARCHAR(60) NULL,
  related_id     BIGINT UNSIGNED NULL,
  source         ENUM('camera','upload') NOT NULL DEFAULT 'upload',
  uploaded_by    BIGINT UNSIGNED NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fu_related (related_module, related_id),
  CONSTRAINT fk_fu_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS progress_photos (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  progress_id  BIGINT UNSIGNED NOT NULL,
  file_id      BIGINT UNSIGNED NOT NULL,
  latitude     DECIMAL(10,7) NULL,
  longitude    DECIMAL(10,7) NULL,
  captured_at  DATETIME NULL,
  source       ENUM('camera','upload') NOT NULL DEFAULT 'camera',
  uploaded_by  BIGINT UNSIGNED NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pp_progress (progress_id),
  CONSTRAINT fk_pp_progress FOREIGN KEY (progress_id) REFERENCES daily_progress(id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_file     FOREIGN KEY (file_id)     REFERENCES file_uploads(id) ON DELETE CASCADE,
  CONSTRAINT fk_pp_user     FOREIGN KEY (uploaded_by) REFERENCES users(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. Drawings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS drawings (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT UNSIGNED NOT NULL,
  wing_id         BIGINT UNSIGNED NULL,
  category        ENUM('architectural','structural','electrical','plumbing','hvac','fire_fighting','interior','other') NOT NULL DEFAULT 'other',
  drawing_number  VARCHAR(60) NOT NULL,
  title           VARCHAR(200) NOT NULL,
  approval_status ENUM('draft','pending_approval','approved','rejected','superseded') NOT NULL DEFAULT 'draft',
  latest_revision VARCHAR(20) NULL,
  remarks         VARCHAR(255) NULL,
  uploaded_by     BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_drawing_number (project_id, drawing_number),
  INDEX idx_drawings_project (project_id, category),
  CONSTRAINT fk_dw_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_dw_wing    FOREIGN KEY (wing_id)    REFERENCES wings(id)    ON DELETE SET NULL,
  CONSTRAINT fk_dw_user    FOREIGN KEY (uploaded_by) REFERENCES users(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS drawing_revisions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  drawing_id    BIGINT UNSIGNED NOT NULL,
  revision_no   VARCHAR(20) NOT NULL,
  revision_date DATE NULL,
  file_id       BIGINT UNSIGNED NULL,
  remarks       VARCHAR(255) NULL,
  status        ENUM('pending_approval','approved','rejected') NOT NULL DEFAULT 'pending_approval',
  approved_by   BIGINT UNSIGNED NULL,
  approved_at   DATETIME NULL,
  uploaded_by   BIGINT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_drawing_revision (drawing_id, revision_no),
  CONSTRAINT fk_dr_drawing  FOREIGN KEY (drawing_id)  REFERENCES drawings(id)     ON DELETE CASCADE,
  CONSTRAINT fk_dr_file     FOREIGN KEY (file_id)     REFERENCES file_uploads(id) ON DELETE SET NULL,
  CONSTRAINT fk_dr_approver FOREIGN KEY (approved_by) REFERENCES users(id)        ON DELETE SET NULL,
  CONSTRAINT fk_dr_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. Materials / Suppliers / Inventory
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS material_categories (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL UNIQUE,
  description   VARCHAR(255) NULL,
  is_consumable TINYINT(1) NOT NULL DEFAULT 1,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS materials (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id      BIGINT UNSIGNED NULL,
  name             VARCHAR(140) NOT NULL,
  code             VARCHAR(40)  NOT NULL UNIQUE,
  unit             VARCHAR(20)  NOT NULL DEFAULT 'nos',
  description      VARCHAR(255) NULL,
  min_stock_level  DECIMAL(12,3) NOT NULL DEFAULT 0,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_materials_category (category_id),
  CONSTRAINT fk_mat_category FOREIGN KEY (category_id) REFERENCES material_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS suppliers (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(160) NOT NULL UNIQUE,
  code           VARCHAR(30)  NULL UNIQUE,
  contact_person VARCHAR(120) NULL,
  phone          VARCHAR(20)  NULL,
  email          VARCHAR(160) NULL,
  gst_number     VARCHAR(30)  NULL,
  address        VARCHAR(255) NULL,
  city           VARCHAR(100) NULL,
  state          VARCHAR(100) NULL,
  pincode        VARCHAR(10)  NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_requirements (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  requirement_no VARCHAR(30) NOT NULL UNIQUE,
  project_id     BIGINT UNSIGNED NOT NULL,
  wing_id        BIGINT UNSIGNED NULL,
  material_id    BIGINT UNSIGNED NOT NULL,
  required_qty   DECIMAL(12,3) NOT NULL,
  unit           VARCHAR(20) NOT NULL,
  required_date  DATE NULL,
  requested_by   BIGINT UNSIGNED NULL,
  status         ENUM('pending','approved','rejected','po_created','fulfilled','cancelled') NOT NULL DEFAULT 'pending',
  approved_by    BIGINT UNSIGNED NULL,
  approved_at    DATETIME NULL,
  remarks        VARCHAR(255) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mr_project (project_id, status),
  CONSTRAINT fk_mr_project  FOREIGN KEY (project_id)   REFERENCES projects(id)  ON DELETE CASCADE,
  CONSTRAINT fk_mr_wing     FOREIGN KEY (wing_id)      REFERENCES wings(id)     ON DELETE SET NULL,
  CONSTRAINT fk_mr_material FOREIGN KEY (material_id)  REFERENCES materials(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mr_requester FOREIGN KEY (requested_by) REFERENCES users(id)    ON DELETE SET NULL,
  CONSTRAINT fk_mr_approver  FOREIGN KEY (approved_by)  REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  po_number              VARCHAR(30) NOT NULL UNIQUE,
  project_id             BIGINT UNSIGNED NOT NULL,
  wing_id                BIGINT UNSIGNED NULL,
  supplier_id            BIGINT UNSIGNED NOT NULL,
  po_date                DATE NOT NULL,
  expected_delivery_date DATE NULL,
  status                 ENUM('draft','pending_approval','approved','sent','partially_received','received','cancelled') NOT NULL DEFAULT 'draft',
  subtotal               DECIMAL(15,2) NOT NULL DEFAULT 0,
  discount               DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_amount             DECIMAL(15,2) NOT NULL DEFAULT 0,
  grand_total            DECIMAL(15,2) NOT NULL DEFAULT 0,
  remarks                VARCHAR(255) NULL,
  created_by             BIGINT UNSIGNED NULL,
  approved_by            BIGINT UNSIGNED NULL,
  approved_at            DATETIME NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_po_project (project_id, status),
  CONSTRAINT fk_po_project  FOREIGN KEY (project_id)  REFERENCES projects(id)  ON DELETE CASCADE,
  CONSTRAINT fk_po_wing     FOREIGN KEY (wing_id)     REFERENCES wings(id)     ON DELETE SET NULL,
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_po_creator  FOREIGN KEY (created_by)  REFERENCES users(id)     ON DELETE SET NULL,
  CONSTRAINT fk_po_approver FOREIGN KEY (approved_by) REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  po_id        BIGINT UNSIGNED NOT NULL,
  material_id  BIGINT UNSIGNED NOT NULL,
  quantity     DECIMAL(12,3) NOT NULL,
  unit         VARCHAR(20) NOT NULL,
  rate         DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_percent  DECIMAL(5,2) NOT NULL DEFAULT 0,
  amount       DECIMAL(15,2) NOT NULL DEFAULT 0,
  received_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_poi_po (po_id),
  CONSTRAINT fk_poi_po       FOREIGN KEY (po_id)       REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_poi_material FOREIGN KEY (material_id) REFERENCES materials(id)       ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_receipts (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  grn_number     VARCHAR(30) NOT NULL UNIQUE,
  po_id          BIGINT UNSIGNED NULL,
  project_id     BIGINT UNSIGNED NOT NULL,
  supplier_id    BIGINT UNSIGNED NULL,
  receipt_date   DATE NOT NULL,
  challan_number VARCHAR(60) NULL,
  remarks        VARCHAR(255) NULL,
  received_by    BIGINT UNSIGNED NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rcpt_project (project_id),
  CONSTRAINT fk_rcpt_po       FOREIGN KEY (po_id)       REFERENCES purchase_orders(id) ON DELETE SET NULL,
  CONSTRAINT fk_rcpt_project  FOREIGN KEY (project_id)  REFERENCES projects(id)        ON DELETE CASCADE,
  CONSTRAINT fk_rcpt_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)       ON DELETE SET NULL,
  CONSTRAINT fk_rcpt_user     FOREIGN KEY (received_by) REFERENCES users(id)           ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_receipt_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  receipt_id   BIGINT UNSIGNED NOT NULL,
  po_item_id   BIGINT UNSIGNED NULL,
  material_id  BIGINT UNSIGNED NOT NULL,
  unit         VARCHAR(20) NOT NULL,
  received_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  damaged_qty  DECIMAL(12,3) NOT NULL DEFAULT 0,
  accepted_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mri_receipt (receipt_id),
  CONSTRAINT fk_mri_receipt FOREIGN KEY (receipt_id)  REFERENCES material_receipts(id)     ON DELETE CASCADE,
  CONSTRAINT fk_mri_po_item FOREIGN KEY (po_item_id)  REFERENCES purchase_order_items(id)  ON DELETE SET NULL,
  CONSTRAINT fk_mri_material FOREIGN KEY (material_id) REFERENCES materials(id)            ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_consumption (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id       BIGINT UNSIGNED NOT NULL,
  wing_id          BIGINT UNSIGNED NULL,
  floor_id         BIGINT UNSIGNED NULL,
  material_id      BIGINT UNSIGNED NOT NULL,
  quantity         DECIMAL(12,3) NOT NULL,
  unit             VARCHAR(20) NOT NULL,
  consumption_date DATE NOT NULL,
  location         VARCHAR(160) NULL,
  used_by          BIGINT UNSIGNED NULL,
  remarks          VARCHAR(255) NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mc_project (project_id, material_id),
  CONSTRAINT fk_mc_project  FOREIGN KEY (project_id)  REFERENCES projects(id)  ON DELETE CASCADE,
  CONSTRAINT fk_mc_wing     FOREIGN KEY (wing_id)     REFERENCES wings(id)     ON DELETE SET NULL,
  CONSTRAINT fk_mc_floor    FOREIGN KEY (floor_id)    REFERENCES floors(id)    ON DELETE SET NULL,
  CONSTRAINT fk_mc_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mc_user     FOREIGN KEY (used_by)     REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_returns (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id  BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  quantity    DECIMAL(12,3) NOT NULL,
  unit        VARCHAR(20) NOT NULL,
  return_date DATE NOT NULL,
  reason      VARCHAR(255) NULL,
  returned_by BIGINT UNSIGNED NULL,
  status      ENUM('pending','approved','completed') NOT NULL DEFAULT 'pending',
  remarks     VARCHAR(255) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mret_project (project_id),
  CONSTRAINT fk_mret_project  FOREIGN KEY (project_id)  REFERENCES projects(id)  ON DELETE CASCADE,
  CONSTRAINT fk_mret_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
  CONSTRAINT fk_mret_user     FOREIGN KEY (returned_by) REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single source of truth for stock: signed quantity ledger
CREATE TABLE IF NOT EXISTS stock_transactions (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id       BIGINT UNSIGNED NOT NULL,
  material_id      BIGINT UNSIGNED NOT NULL,
  txn_type         ENUM('opening','receipt','consumption','return','damage','adjustment') NOT NULL,
  quantity         DECIMAL(12,3) NOT NULL,
  reference_module VARCHAR(40) NULL,
  reference_id     BIGINT UNSIGNED NULL,
  txn_date         DATE NOT NULL,
  remarks          VARCHAR(255) NULL,
  created_by       BIGINT UNSIGNED NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_st_project_material (project_id, material_id),
  CONSTRAINT fk_st_project  FOREIGN KEY (project_id)  REFERENCES projects(id)  ON DELETE CASCADE,
  CONSTRAINT fk_st_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
  CONSTRAINT fk_st_user     FOREIGN KEY (created_by)  REFERENCES users(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. Billing & Cost
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cost_entries (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id    BIGINT UNSIGNED NOT NULL,
  wing_id       BIGINT UNSIGNED NULL,
  entry_type    ENUM('consumable','non_consumable','labour','other') NOT NULL DEFAULT 'consumable',
  category      VARCHAR(60) NULL,
  description   VARCHAR(255) NULL,
  material_id   BIGINT UNSIGNED NULL,
  supplier_id   BIGINT UNSIGNED NULL,
  bill_number   VARCHAR(60) NULL,
  bill_date     DATE NULL,
  entry_date    DATE NOT NULL,
  quantity      DECIMAL(12,3) NOT NULL DEFAULT 0,
  unit          VARCHAR(20) NULL,
  rate          DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_percent   DECIMAL(5,2) NOT NULL DEFAULT 0,
  tax_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount  DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid_amount   DECIMAL(15,2) NOT NULL DEFAULT 0,
  pending_amount DECIMAL(15,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  payment_status ENUM('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
  file_id       BIGINT UNSIGNED NULL,
  remarks       VARCHAR(255) NULL,
  created_by    BIGINT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ce_project (project_id, entry_type),
  CONSTRAINT fk_ce_project  FOREIGN KEY (project_id)  REFERENCES projects(id)      ON DELETE CASCADE,
  CONSTRAINT fk_ce_wing     FOREIGN KEY (wing_id)     REFERENCES wings(id)         ON DELETE SET NULL,
  CONSTRAINT fk_ce_material FOREIGN KEY (material_id) REFERENCES materials(id)     ON DELETE SET NULL,
  CONSTRAINT fk_ce_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)     ON DELETE SET NULL,
  CONSTRAINT fk_ce_file     FOREIGN KEY (file_id)     REFERENCES file_uploads(id)  ON DELETE SET NULL,
  CONSTRAINT fk_ce_user     FOREIGN KEY (created_by)  REFERENCES users(id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8. Workforce (contractors / categories / labour rates / workers / attendance / payments)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contractors (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(160) NOT NULL UNIQUE,
  contact_person VARCHAR(120) NULL,
  phone          VARCHAR(20)  NULL,
  email          VARCHAR(160) NULL,
  gst_number     VARCHAR(30)  NULL,
  address        VARCHAR(255) NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS worker_categories (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL UNIQUE,
  description     VARCHAR(255) NULL,
  base_daily_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS labour_rates (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  worker_category_id BIGINT UNSIGNED NOT NULL,
  contractor_id      BIGINT UNSIGNED NULL,
  daily_rate         DECIMAL(10,2) NOT NULL,
  overtime_rate      DECIMAL(10,2) NOT NULL DEFAULT 0,
  effective_date     DATE NOT NULL,
  remarks            VARCHAR(255) NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lr_category (worker_category_id, effective_date),
  CONSTRAINT fk_lr_category   FOREIGN KEY (worker_category_id) REFERENCES worker_categories(id) ON DELETE CASCADE,
  CONSTRAINT fk_lr_contractor FOREIGN KEY (contractor_id)      REFERENCES contractors(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workers (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  worker_code    VARCHAR(30) NOT NULL UNIQUE,
  name           VARCHAR(120) NOT NULL,
  phone          VARCHAR(20)  NULL,
  category_id    BIGINT UNSIGNED NULL,
  contractor_id  BIGINT UNSIGNED NULL,
  daily_wage     DECIMAL(10,2) NOT NULL DEFAULT 0,
  overtime_rate  DECIMAL(10,2) NOT NULL DEFAULT 0,
  project_id     BIGINT UNSIGNED NULL,
  wing_id        BIGINT UNSIGNED NULL,
  joining_date   DATE NULL,
  id_proof       VARCHAR(60) NULL,
  photo_file_id  BIGINT UNSIGNED NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workers_project (project_id),
  CONSTRAINT fk_wk_category   FOREIGN KEY (category_id)   REFERENCES worker_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_wk_contractor FOREIGN KEY (contractor_id) REFERENCES contractors(id)       ON DELETE SET NULL,
  CONSTRAINT fk_wk_project    FOREIGN KEY (project_id)    REFERENCES projects(id)          ON DELETE SET NULL,
  CONSTRAINT fk_wk_wing       FOREIGN KEY (wing_id)       REFERENCES wings(id)             ON DELETE SET NULL,
  CONSTRAINT fk_wk_photo      FOREIGN KEY (photo_file_id) REFERENCES file_uploads(id)      ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  worker_id       BIGINT UNSIGNED NOT NULL,
  project_id      BIGINT UNSIGNED NOT NULL,
  wing_id         BIGINT UNSIGNED NULL,
  attendance_date DATE NOT NULL,
  shift           ENUM('day','night') NOT NULL DEFAULT 'day',
  check_in        TIME NULL,
  check_out       TIME NULL,
  status          ENUM('present','absent','leave','half_day','overtime') NOT NULL DEFAULT 'present',
  overtime_hours  DECIMAL(4,2) NOT NULL DEFAULT 0,
  daily_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  overtime_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_status  ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  remarks         VARCHAR(255) NULL,
  marked_by       BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance (worker_id, attendance_date, shift),
  INDEX idx_att_project_date (project_id, attendance_date),
  CONSTRAINT fk_att_worker  FOREIGN KEY (worker_id) REFERENCES workers(id)  ON DELETE CASCADE,
  CONSTRAINT fk_att_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_att_wing    FOREIGN KEY (wing_id)    REFERENCES wings(id)    ON DELETE SET NULL,
  CONSTRAINT fk_att_marker  FOREIGN KEY (marked_by)  REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS labour_payments (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  worker_id             BIGINT UNSIGNED NOT NULL,
  project_id            BIGINT UNSIGNED NOT NULL,
  period_start          DATE NOT NULL,
  period_end            DATE NOT NULL,
  total_days            DECIMAL(5,1) NOT NULL DEFAULT 0,
  total_overtime_hours  DECIMAL(6,2) NOT NULL DEFAULT 0,
  gross_amount          DECIMAL(12,2) NOT NULL DEFAULT 0,
  deductions            DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_amount            DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount           DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_date          DATE NULL,
  payment_mode          ENUM('cash','bank_transfer','upi','cheque') NULL,
  status                ENUM('pending','partial','paid') NOT NULL DEFAULT 'pending',
  remarks               VARCHAR(255) NULL,
  created_by            BIGINT UNSIGNED NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lp_worker (worker_id, status),
  CONSTRAINT fk_lp_worker  FOREIGN KEY (worker_id)  REFERENCES workers(id)  ON DELETE CASCADE,
  CONSTRAINT fk_lp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_lp_creator FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 9. BOQ
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS boq_categories (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS boq (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  boq_number    VARCHAR(30) NOT NULL UNIQUE,
  project_id    BIGINT UNSIGNED NOT NULL,
  wing_id       BIGINT UNSIGNED NULL,
  title         VARCHAR(200) NOT NULL,
  description   TEXT NULL,
  status        ENUM('draft','active','completed','cancelled') NOT NULL DEFAULT 'draft',
  tax_percent   DECIMAL(5,2) NOT NULL DEFAULT 0,
  discount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_by    BIGINT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_boq_project (project_id, status),
  CONSTRAINT fk_boq_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_boq_wing    FOREIGN KEY (wing_id)    REFERENCES wings(id)    ON DELETE SET NULL,
  CONSTRAINT fk_boq_creator FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS boq_items (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  boq_id           BIGINT UNSIGNED NOT NULL,
  item_code        VARCHAR(40) NULL,
  description      VARCHAR(255) NOT NULL,
  category_id      BIGINT UNSIGNED NULL,
  unit             VARCHAR(20) NOT NULL DEFAULT 'nos',
  estimated_qty    DECIMAL(12,3) NOT NULL DEFAULT 0,
  rate             DECIMAL(12,2) NOT NULL DEFAULT 0,
  estimated_amount DECIMAL(15,2) GENERATED ALWAYS AS (estimated_qty * rate) STORED,
  actual_qty       DECIMAL(12,3) NOT NULL DEFAULT 0,
  actual_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
  remarks          VARCHAR(255) NULL,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_boqi_boq (boq_id),
  CONSTRAINT fk_boqi_boq      FOREIGN KEY (boq_id)      REFERENCES boq(id)           ON DELETE CASCADE,
  CONSTRAINT fk_boqi_category FOREIGN KEY (category_id) REFERENCES boq_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 10. Quality: Test reports & Inspections
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS test_types (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_reports (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  test_number   VARCHAR(30) NOT NULL UNIQUE,
  test_type_id  BIGINT UNSIGNED NOT NULL,
  project_id    BIGINT UNSIGNED NOT NULL,
  wing_id       BIGINT UNSIGNED NULL,
  material_id   BIGINT UNSIGNED NULL,
  sample_date   DATE NULL,
  test_date     DATE NULL,
  laboratory    VARCHAR(160) NULL,
  test_result   TEXT NULL,
  standard_spec VARCHAR(160) NULL,
  result_status ENUM('pending','pass','fail','inconclusive') NOT NULL DEFAULT 'pending',
  status        ENUM('submitted','approved','rejected') NOT NULL DEFAULT 'submitted',
  file_id       BIGINT UNSIGNED NULL,
  remarks       VARCHAR(255) NULL,
  approved_by   BIGINT UNSIGNED NULL,
  approved_at   DATETIME NULL,
  created_by    BIGINT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tr_project (project_id, result_status),
  CONSTRAINT fk_tr_type     FOREIGN KEY (test_type_id) REFERENCES test_types(id)   ON DELETE RESTRICT,
  CONSTRAINT fk_tr_project  FOREIGN KEY (project_id)   REFERENCES projects(id)     ON DELETE CASCADE,
  CONSTRAINT fk_tr_wing     FOREIGN KEY (wing_id)      REFERENCES wings(id)        ON DELETE SET NULL,
  CONSTRAINT fk_tr_material FOREIGN KEY (material_id)  REFERENCES materials(id)    ON DELETE SET NULL,
  CONSTRAINT fk_tr_file     FOREIGN KEY (file_id)      REFERENCES file_uploads(id) ON DELETE SET NULL,
  CONSTRAINT fk_tr_creator  FOREIGN KEY (created_by)   REFERENCES users(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inspection_types (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(100) NOT NULL UNIQUE,
  checklist_template TEXT NULL,
  is_active          TINYINT(1) NOT NULL DEFAULT 1,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inspections (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  inspection_number  VARCHAR(30) NOT NULL UNIQUE,
  inspection_type_id BIGINT UNSIGNED NOT NULL,
  project_id         BIGINT UNSIGNED NOT NULL,
  wing_id            BIGINT UNSIGNED NULL,
  floor_id           BIGINT UNSIGNED NULL,
  location           VARCHAR(160) NULL,
  inspector_id       BIGINT UNSIGNED NULL,
  inspection_date    DATETIME NOT NULL,
  observation        TEXT NULL,
  status             ENUM('pending','passed','failed','reinspection_required','closed') NOT NULL DEFAULT 'pending',
  remarks            VARCHAR(255) NULL,
  latitude           DECIMAL(10,7) NULL,
  longitude          DECIMAL(10,7) NULL,
  client_ref         VARCHAR(64) NULL UNIQUE,
  created_by         BIGINT UNSIGNED NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_insp_project (project_id, status),
  CONSTRAINT fk_insp_type    FOREIGN KEY (inspection_type_id) REFERENCES inspection_types(id) ON DELETE RESTRICT,
  CONSTRAINT fk_insp_project FOREIGN KEY (project_id)         REFERENCES projects(id)         ON DELETE CASCADE,
  CONSTRAINT fk_insp_wing    FOREIGN KEY (wing_id)            REFERENCES wings(id)            ON DELETE SET NULL,
  CONSTRAINT fk_insp_floor   FOREIGN KEY (floor_id)           REFERENCES floors(id)           ON DELETE SET NULL,
  CONSTRAINT fk_insp_user    FOREIGN KEY (inspector_id)       REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inspection_items (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  inspection_id  BIGINT UNSIGNED NOT NULL,
  checklist_item VARCHAR(255) NOT NULL,
  result         ENUM('pass','fail','na','pending') NOT NULL DEFAULT 'pending',
  remarks        VARCHAR(255) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ii_inspection (inspection_id),
  CONSTRAINT fk_ii_inspection FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 11. Issues
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS issue_categories (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS issues (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  issue_number VARCHAR(30) NOT NULL UNIQUE,
  project_id   BIGINT UNSIGNED NOT NULL,
  wing_id      BIGINT UNSIGNED NULL,
  floor_id     BIGINT UNSIGNED NULL,
  location     VARCHAR(160) NULL,
  category_id  BIGINT UNSIGNED NULL,
  priority     ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  title        VARCHAR(200) NOT NULL,
  description  TEXT NULL,
  latitude     DECIMAL(10,7) NULL,
  longitude    DECIMAL(10,7) NULL,
  raised_by    BIGINT UNSIGNED NULL,
  assigned_to  BIGINT UNSIGNED NULL,
  due_date     DATE NULL,
  status       ENUM('open','assigned','in_progress','resolved','reopened','closed') NOT NULL DEFAULT 'open',
  resolution   TEXT NULL,
  resolved_at  DATETIME NULL,
  closed_at    DATETIME NULL,
  remarks      VARCHAR(255) NULL,
  client_ref   VARCHAR(64) NULL UNIQUE,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_issues_project_status (project_id, status),
  INDEX idx_issues_assigned (assigned_to, status),
  CONSTRAINT fk_is_project  FOREIGN KEY (project_id)   REFERENCES projects(id)         ON DELETE CASCADE,
  CONSTRAINT fk_is_wing     FOREIGN KEY (wing_id)      REFERENCES wings(id)            ON DELETE SET NULL,
  CONSTRAINT fk_is_floor    FOREIGN KEY (floor_id)     REFERENCES floors(id)           ON DELETE SET NULL,
  CONSTRAINT fk_is_category FOREIGN KEY (category_id)  REFERENCES issue_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_is_raiser   FOREIGN KEY (raised_by)    REFERENCES users(id)            ON DELETE SET NULL,
  CONSTRAINT fk_is_assignee FOREIGN KEY (assigned_to)  REFERENCES users(id)            ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS issue_comments (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  issue_id   BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NULL,
  comment    TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ic_issue (issue_id),
  CONSTRAINT fk_ic_issue FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
  CONSTRAINT fk_ic_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 12. Sales
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sales (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT UNSIGNED NOT NULL,
  wing_id         BIGINT UNSIGNED NOT NULL,
  floor_id        BIGINT UNSIGNED NULL,
  unit_id         BIGINT UNSIGNED NOT NULL UNIQUE,
  customer_name   VARCHAR(160) NOT NULL,
  customer_phone  VARCHAR(20)  NULL,
  customer_email  VARCHAR(160) NULL,
  booking_date    DATE NULL,
  sale_date       DATE NULL,
  sale_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
  amount_received DECIMAL(15,2) NOT NULL DEFAULT 0,
  pending_amount  DECIMAL(15,2) GENERATED ALWAYS AS (sale_amount - amount_received) STORED,
  payment_status  ENUM('pending','partially_paid','paid','overdue') NOT NULL DEFAULT 'pending',
  is_gst          TINYINT(1) NOT NULL DEFAULT 0,
  gst_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  other_charges   DECIMAL(15,2) NOT NULL DEFAULT 0,
  status          ENUM('booked','sold','cancelled') NOT NULL DEFAULT 'booked',
  sold_by         BIGINT UNSIGNED NULL,
  remarks         VARCHAR(255) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sales_project (project_id, status),
  CONSTRAINT fk_sa_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_wing    FOREIGN KEY (wing_id)    REFERENCES wings(id)    ON DELETE CASCADE,
  CONSTRAINT fk_sa_floor   FOREIGN KEY (floor_id)   REFERENCES floors(id)   ON DELETE SET NULL,
  CONSTRAINT fk_sa_unit    FOREIGN KEY (unit_id)    REFERENCES units(id)    ON DELETE RESTRICT,
  CONSTRAINT fk_sa_seller  FOREIGN KEY (sold_by)    REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_payments (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sale_id          BIGINT UNSIGNED NOT NULL,
  payment_date     DATE NOT NULL,
  amount           DECIMAL(15,2) NOT NULL,
  payment_mode     ENUM('online','cash','cheque','bank_transfer','upi') NOT NULL DEFAULT 'bank_transfer',
  is_gst           TINYINT(1) NOT NULL DEFAULT 0,
  reference_number VARCHAR(80) NULL,
  remarks          VARCHAR(255) NULL,
  received_by      BIGINT UNSIGNED NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sp_sale (sale_id),
  CONSTRAINT fk_sp_sale FOREIGN KEY (sale_id)     REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_sp_user FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 13. Project Documents
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_documents (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT UNSIGNED NOT NULL,
  wing_id         BIGINT UNSIGNED NULL,
  category        ENUM('agreement','certificate','approval','noc','project_image','demo_image','site_photo','client_document','government_document','other') NOT NULL DEFAULT 'other',
  title           VARCHAR(200) NOT NULL,
  document_number VARCHAR(60) NULL,
  description     VARCHAR(255) NULL,
  file_id         BIGINT UNSIGNED NULL,
  version         VARCHAR(20) NULL,
  expiry_date     DATE NULL,
  uploaded_by     BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pd_project (project_id, category),
  CONSTRAINT fk_pd_project FOREIGN KEY (project_id)  REFERENCES projects(id)     ON DELETE CASCADE,
  CONSTRAINT fk_pd_wing    FOREIGN KEY (wing_id)     REFERENCES wings(id)        ON DELETE SET NULL,
  CONSTRAINT fk_pd_file    FOREIGN KEY (file_id)     REFERENCES file_uploads(id) ON DELETE SET NULL,
  CONSTRAINT fk_pd_user    FOREIGN KEY (uploaded_by) REFERENCES users(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 14. Notifications & Audit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  title      VARCHAR(200) NOT NULL,
  message    TEXT NULL,
  type       ENUM('info','success','warning','error') NOT NULL DEFAULT 'info',
  module     VARCHAR(60) NULL,
  record_id  VARCHAR(40) NULL,
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id, is_read),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_settings (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_key   VARCHAR(60) NOT NULL UNIQUE,
  label       VARCHAR(160) NOT NULL,
  enabled     TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NULL,
  user_name  VARCHAR(120) NULL,
  action     VARCHAR(40) NOT NULL,
  module     VARCHAR(60) NOT NULL,
  record_id  VARCHAR(40) NULL,
  old_value  JSON NULL,
  new_value  JSON NULL,
  ip_address VARCHAR(60) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_module (module, created_at),
  INDEX idx_audit_user (user_id, created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 15. Convenience views
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 16. Equipment Management module
-- ---------------------------------------------------------------------------
-- Track machinery on projects (rented + owned). Captures running
-- hours, deployment hours, breakdown / idle time, hire billing rates.
CREATE TABLE IF NOT EXISTS equipment (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  equipment_code  VARCHAR(40) NOT NULL UNIQUE,
  name            VARCHAR(150) NOT NULL,
  equipment_type  ENUM('excavator','crane','concrete_mixer','tower_crane','bulldozer','loader','generator','compactor','dumper','scaffolding','pump','other') NOT NULL DEFAULT 'other',
  ownership       ENUM('owned','rented','contractor_supplied') NOT NULL DEFAULT 'rented',
  vendor_id       BIGINT UNSIGNED NULL,
  project_id      BIGINT UNSIGNED NULL,
  wing_id         BIGINT UNSIGNED NULL,
  hourly_rate     DECIMAL(10,2) NOT NULL DEFAULT 0,
  daily_rate      DECIMAL(10,2) NOT NULL DEFAULT 0,
  monthly_rate    DECIMAL(12,2) NOT NULL DEFAULT 0,
  capacity        VARCHAR(80) NULL,
  registration_no VARCHAR(60) NULL,
  operator_name   VARCHAR(120) NULL,
  status          ENUM('available','deployed','maintenance','breakdown','idle') NOT NULL DEFAULT 'available',
  deployed_on     DATE NULL,
  remarks         TEXT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_by      BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_eq_project (project_id),
  INDEX idx_eq_status  (status),
  INDEX idx_eq_type    (equipment_type),
  CONSTRAINT fk_eq_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_eq_wing    FOREIGN KEY (wing_id)    REFERENCES wings(id)    ON DELETE SET NULL,
  CONSTRAINT fk_eq_user    FOREIGN KEY (created_by) REFERENCES users(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipment_logs (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  equipment_id    BIGINT UNSIGNED NOT NULL,
  project_id      BIGINT UNSIGNED NOT NULL,
  wing_id         BIGINT UNSIGNED NULL,
  log_date        DATE NOT NULL,
  deployed_hours  DECIMAL(6,2) NOT NULL DEFAULT 0,
  running_hours   DECIMAL(6,2) NOT NULL DEFAULT 0,
  idle_hours      DECIMAL(6,2) NOT NULL DEFAULT 0,
  breakdown_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
  fuel_quantity   DECIMAL(10,2) NOT NULL DEFAULT 0,  -- litres
  operator_name   VARCHAR(120) NULL,
  work_done       VARCHAR(255) NULL,
  status_after    ENUM('available','deployed','maintenance','breakdown','idle') NOT NULL DEFAULT 'deployed',
  remarks         TEXT NULL,
  marked_by       BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_erl_eq   (equipment_id, log_date),
  INDEX idx_erl_proj (project_id, log_date),
  CONSTRAINT fk_erl_eq   FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
  CONSTRAINT fk_erl_proj FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_erl_wing FOREIGN KEY (wing_id)    REFERENCES wings(id)    ON DELETE SET NULL,
  CONSTRAINT fk_erl_user FOREIGN KEY (marked_by)  REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipment_billing (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  equipment_id    BIGINT UNSIGNED NOT NULL,
  project_id      BIGINT UNSIGNED NOT NULL,
  billing_month   CHAR(7) NOT NULL,  -- YYYY-MM
  total_hours     DECIMAL(10,2) NOT NULL DEFAULT 0,
  hourly_rate     DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount    DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_status  ENUM('pending','partial','paid') NOT NULL DEFAULT 'pending',
  paid_amount     DECIMAL(12,2) NOT NULL DEFAULT 0,
  invoice_number  VARCHAR(60) NULL,
  invoice_date    DATE NULL,
  remarks         TEXT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_eq_bill (equipment_id, billing_month),
  CONSTRAINT fk_erb_eq   FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
  CONSTRAINT fk_erb_proj FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW v_equipment_status AS
SELECT
  e.id              AS equipment_id,
  e.equipment_code,
  e.name,
  e.equipment_type,
  e.ownership,
  e.status,
  e.project_id,
  p.name            AS project_name,
  w.name            AS wing_name,
  COALESCE(SUM(erl.deployed_hours), 0)  AS total_deployed_hours,
  COALESCE(SUM(erl.running_hours), 0)   AS total_running_hours,
  COALESCE(SUM(erl.idle_hours), 0)      AS total_idle_hours,
  COALESCE(SUM(erl.breakdown_hours), 0) AS total_breakdown_hours,
  COALESCE(SUM(erl.fuel_quantity), 0)   AS total_fuel,
  MAX(erl.log_date)                    AS last_log_date
FROM equipment e
LEFT JOIN projects p   ON p.id = e.project_id
LEFT JOIN wings w      ON w.id = e.wing_id
LEFT JOIN equipment_logs erl ON erl.equipment_id = e.id
GROUP BY e.id, e.equipment_code, e.name, e.equipment_type, e.ownership,
         e.status, e.project_id, p.name, w.name;


CREATE OR REPLACE VIEW v_stock_summary AS
SELECT
  p.id   AS project_id,
  p.name AS project_name,
  m.id   AS material_id,
  m.name AS material_name,
  m.code AS material_code,
  m.unit,
  m.min_stock_level,
  COALESCE(SUM(CASE WHEN st.txn_type IN ('opening','receipt','adjustment') AND st.quantity > 0 THEN st.quantity ELSE 0 END),0) AS total_received,
  COALESCE(SUM(CASE WHEN st.txn_type = 'consumption' THEN ABS(st.quantity) ELSE 0 END),0) AS total_consumed,
  COALESCE(SUM(CASE WHEN st.txn_type = 'damage'      THEN ABS(st.quantity) ELSE 0 END),0) AS total_damaged,
  COALESCE(SUM(CASE WHEN st.txn_type = 'return'      THEN ABS(st.quantity) ELSE 0 END),0) AS total_returned,
  COALESCE(SUM(st.quantity),0) AS current_stock
FROM stock_transactions st
JOIN projects  p ON p.id = st.project_id
JOIN materials m ON m.id = st.material_id
GROUP BY p.id, p.name, m.id, m.name, m.code, m.unit, m.min_stock_level;

SET FOREIGN_KEY_CHECKS = 1;
-- ---------------------------------------------------------------------------
-- 17. Petty Cash (site-level cash: top-up -> expense -> replenish)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS petty_cash_entries (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id      BIGINT UNSIGNED NOT NULL,
  wing_id         BIGINT UNSIGNED NULL,
  txn_type        ENUM('topup','expense','replenish') NOT NULL DEFAULT 'expense',
  category        VARCHAR(40) NULL,
  amount          DECIMAL(12,2) NOT NULL DEFAULT 0,
  txn_date        DATE NOT NULL,
  description     VARCHAR(255) NULL,
  paid_to         VARCHAR(120) NULL,
  received_by     VARCHAR(120) NULL,
  receipt_file_id BIGINT UNSIGNED NULL,
  remarks         TEXT NULL,
  created_by      BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pce_proj   (project_id, txn_date),
  INDEX idx_pce_cat    (project_id, category),
  INDEX idx_pce_type   (project_id, txn_type),
  CONSTRAINT fk_pce_proj    FOREIGN KEY (project_id)      REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pce_wing    FOREIGN KEY (wing_id)         REFERENCES wings(id)    ON DELETE SET NULL,
  CONSTRAINT fk_pce_user    FOREIGN KEY (created_by)      REFERENCES users(id)    ON DELETE SET NULL,
  CONSTRAINT fk_pce_receipt FOREIGN KEY (receipt_file_id) REFERENCES file_uploads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 18. HRMS (employees + leave + salary structure + payroll)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hrms_employees (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_code    VARCHAR(40) NOT NULL UNIQUE,
  name             VARCHAR(150) NOT NULL,
  email            VARCHAR(120) NULL,
  phone            VARCHAR(20) NULL,
  date_of_birth    DATE NULL,
  date_of_joining  DATE NULL,
  department       VARCHAR(80) NULL,
  designation      VARCHAR(80) NULL,
  project_id       BIGINT UNSIGNED NULL,
  wing_id          BIGINT UNSIGNED NULL,
  bank_account     VARCHAR(40) NULL,
  pan_number       VARCHAR(15) NULL,
  aadhaar_number   VARCHAR(20) NULL,
  address          VARCHAR(255) NULL,
  gender           ENUM('male','female','other') NULL,
  employment_type  ENUM('permanent','contract','probation','intern') NOT NULL DEFAULT 'permanent',
  status           ENUM('active','on_leave','resigned','terminated') NOT NULL DEFAULT 'active',
  user_id          BIGINT UNSIGNED NULL,
  remarks          TEXT NULL,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_emp_proj (project_id),
  INDEX idx_emp_dept (department),
  INDEX idx_emp_st   (status),
  UNIQUE KEY uq_hrms_employee_user (user_id),
  CONSTRAINT fk_emp_proj FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_emp_wing FOREIGN KEY (wing_id)    REFERENCES wings(id)    ON DELETE SET NULL,
  CONSTRAINT fk_emp_user FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hrms_leave_types (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(60) NOT NULL,
  code          VARCHAR(20) NOT NULL UNIQUE,
  annual_quota  INT NOT NULL DEFAULT 0,
  is_paid       TINYINT(1) NOT NULL DEFAULT 1,
  color_code    VARCHAR(10) NULL,
  description   VARCHAR(255) NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hrms_leave_requests (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_id       BIGINT UNSIGNED NOT NULL,
  leave_type_id     BIGINT UNSIGNED NOT NULL,
  from_date         DATE NOT NULL,
  to_date           DATE NOT NULL,
  total_days        DECIMAL(4,1) NOT NULL DEFAULT 0,
  reason            VARCHAR(255) NULL,
  status            ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  applied_on        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by        BIGINT UNSIGNED NULL,
  decided_on        DATETIME NULL,
  decision_remarks  VARCHAR(255) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lr_emp (employee_id, from_date),
  INDEX idx_lr_lt  (leave_type_id),
  INDEX idx_lr_st  (status),
  CONSTRAINT fk_lr_emp FOREIGN KEY (employee_id)   REFERENCES hrms_employees(id)  ON DELETE CASCADE,
  CONSTRAINT fk_lr_lt  FOREIGN KEY (leave_type_id) REFERENCES hrms_leave_types(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hrms_salary_structures (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_id       BIGINT UNSIGNED NOT NULL,
  effective_from    DATE NOT NULL,
  basic             DECIMAL(10,2) NOT NULL DEFAULT 0,
  hra               DECIMAL(10,2) NOT NULL DEFAULT 0,
  da                DECIMAL(10,2) NOT NULL DEFAULT 0,
  special_allowance DECIMAL(10,2) NOT NULL DEFAULT 0,
  other_allowance   DECIMAL(10,2) NOT NULL DEFAULT 0,
  pf_employee       DECIMAL(10,2) NOT NULL DEFAULT 0,
  pf_employer       DECIMAL(10,2) NOT NULL DEFAULT 0,
  esic_employee     DECIMAL(10,2) NOT NULL DEFAULT 0,
  esic_employer     DECIMAL(10,2) NOT NULL DEFAULT 0,
  professional_tax  DECIMAL(10,2) NOT NULL DEFAULT 0,
  remarks           VARCHAR(255) NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ss_emp (employee_id, effective_from),
  CONSTRAINT fk_ss_emp FOREIGN KEY (employee_id) REFERENCES hrms_employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hrms_payroll (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  employee_id        BIGINT UNSIGNED NOT NULL,
  payroll_month      CHAR(7) NOT NULL,
  total_working_days INT NOT NULL DEFAULT 0,
  paid_days          DECIMAL(4,1) NOT NULL DEFAULT 0,
  lop_days           DECIMAL(4,1) NOT NULL DEFAULT 0,
  basic_pay          DECIMAL(10,2) NOT NULL DEFAULT 0,
  hra_pay            DECIMAL(10,2) NOT NULL DEFAULT 0,
  da_pay             DECIMAL(10,2) NOT NULL DEFAULT 0,
  special_pay        DECIMAL(10,2) NOT NULL DEFAULT 0,
  other_pay          DECIMAL(10,2) NOT NULL DEFAULT 0,
  gross_pay          DECIMAL(12,2) NOT NULL DEFAULT 0,
  pf_deduction       DECIMAL(10,2) NOT NULL DEFAULT 0,
  esic_deduction     DECIMAL(10,2) NOT NULL DEFAULT 0,
  professional_tax   DECIMAL(10,2) NOT NULL DEFAULT 0,
  income_tax         DECIMAL(10,2) NOT NULL DEFAULT 0,
  other_deductions   DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_deductions   DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_pay            DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_status     ENUM('pending','paid','partial') NOT NULL DEFAULT 'pending',
  paid_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_date       DATE NULL,
  payment_reference  VARCHAR(60) NULL,
  remarks            VARCHAR(255) NULL,
  generated_by       BIGINT UNSIGNED NULL,
  generated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payroll (employee_id, payroll_month),
  INDEX idx_payroll_month (payroll_month),
  CONSTRAINT fk_pay_emp  FOREIGN KEY (employee_id)  REFERENCES hrms_employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_user FOREIGN KEY (generated_by) REFERENCES users(id)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

