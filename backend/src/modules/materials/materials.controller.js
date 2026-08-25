import { CrudController } from '../../utils/crud.js';

export const categories = new CrudController({
  table: 'material_categories',
  module: 'materials',
  fields: ['name', 'description', 'is_consumable', 'is_active'],
  searchColumns: ['name', 'description'],
  sortableColumns: ['id', 'name'],
  defaultSort: 'name ASC',
});

export const materials = new CrudController({
  table: 'materials',
  module: 'materials',
  fields: ['category_id', 'name', 'code', 'unit', 'description', 'min_stock_level', 'is_active'],
  searchColumns: ['m.name', 'm.code'],
  listSql: `SELECT m.*, c.name AS category_name FROM materials m LEFT JOIN material_categories c ON c.id = m.category_id`,
  countSql: 'SELECT COUNT(*) AS total FROM materials m LEFT JOIN material_categories c ON c.id = m.category_id',
  filters: [{ key: 'categoryId', column: 'm.category_id' }, { key: 'is_active', column: 'm.is_active' }],
  sortableColumns: ['m.id', 'm.name', 'm.code'],
  defaultSort: 'm.name ASC',
  exportSql: `SELECT m.code, m.name, c.name AS category, m.unit, m.min_stock_level, m.is_active FROM materials m LEFT JOIN material_categories c ON c.id = m.category_id ORDER BY m.name`,
});

export const suppliers = new CrudController({
  table: 'suppliers',
  module: 'materials',
  fields: ['name', 'code', 'contact_person', 'phone', 'email', 'gst_number', 'address', 'city', 'state', 'pincode', 'is_active'],
  searchColumns: ['name', 'code', 'contact_person', 'phone', 'email'],
  filters: [{ key: 'is_active', column: 'suppliers.is_active' }],
  sortableColumns: ['id', 'name'],
  defaultSort: 'name ASC',
});
