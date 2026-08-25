import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permissions.js';
import * as products from './materials.controller.js';
import inventoryRoutes from './inventory.routes.js';

const router = Router();
router.use(authenticate);

const perm = (action) => requirePermission('materials', action);

// Categories
router.get('/categories', perm('view'), products.categories.list);
router.post('/categories', perm('create'), products.categories.create);
router.put('/categories/:id', perm('edit'), products.categories.update);
router.delete('/categories/:id', perm('delete'), products.categories.remove);

// Suppliers
router.get('/suppliers', perm('view'), products.suppliers.list);
router.get('/suppliers/export', perm('export'), products.suppliers.exportCsv);
router.get('/suppliers/:id', perm('view'), products.suppliers.getOne);
router.post('/suppliers', perm('create'), products.suppliers.create);
router.put('/suppliers/:id', perm('edit'), products.suppliers.update);
router.delete('/suppliers/:id', perm('delete'), products.suppliers.remove);

// Inventory lifecycle (requirements / purchase orders / receipts / consumption / returns / stock)
router.use('/', inventoryRoutes);

// Materials (after parameterized inventory routes to avoid collisions)
router.get('/', perm('view'), products.materials.list);
router.get('/export', perm('export'), products.materials.exportCsv);
router.get('/:id', perm('view'), products.materials.getOne);
router.post('/', perm('create'), products.materials.create);
router.put('/:id', perm('edit'), products.materials.update);
router.delete('/:id', perm('delete'), products.materials.remove);

export default router;
