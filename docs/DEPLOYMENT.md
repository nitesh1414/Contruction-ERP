# Production Deployment Guide

Reference topology:

```
                 ┌────────────┐        ┌──────────────────────┐
 Browser ─ HTTPS │  Nginx     │ static │  web-app dist        │  (portal)
 Mobile ── HTTPS │  (reverse  ├───────▶│  admin-panel dist    │  (admin)
                 │   proxy)   │  /api  │  backend (Node) ◀──▶ MySQL 8
                 └────────────┘        └──────────────────────┘
```

- **API** — Node 20 + PM2 (or systemd) behind Nginx on `api.your-domain.com`
- **Web app & admin panel** — static builds served by Nginx on `app.your-domain.com` and `admin.your-domain.com`
- **MySQL 8** — private network only, dedicated user
- **Uploads** — `backend/uploads/` on persistent disk, backed up with the DB

---

## 1. Server preparation (Ubuntu 24.04 example)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx mysql-server ufw
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

## 2. MySQL hardening

```bash
sudo mysql_secure_installation
sudo mysql -u root -p
```

```sql
CREATE USER 'erp'@'localhost' IDENTIFIED BY '<strong-password>';
GRANT ALL PRIVILEGES ON construction_erp.* TO 'erp'@'localhost';
FLUSH PRIVILEGES;
```

MySQL should listen on `127.0.0.1` only (`bind-address = 127.0.0.1` in `mysqld.cnf`) when the API is colocated.

## 3. Backend

```bash
cd /var/www
git clone https://github.com/nitesh1414/Contruction-ERP.git construction-erp
cd construction-erp/backend
npm ci --omit=dev
cp .env.example .env
```

Production `.env` essentials:

```env
NODE_ENV=production
PORT=4000
CORS_ORIGINS=https://app.your-domain.com,https://admin.your-domain.com
DB_HOST=127.0.0.1
DB_USER=erp
DB_PASSWORD=<strong-password>
DB_NAME=construction_erp
JWT_SECRET=<64+ random hex>
JWT_REFRESH_SECRET=<different 64+ random hex>
FRONTEND_BASE_URL=https://app.your-domain.com
UPLOAD_DIR=/var/www/construction-erp/backend/uploads
MAX_FILE_SIZE_MB=20
```

Migrate, seed (skip `--force` demo data on real deployments — seeder inserts only RBAC + admin when you stop after the roles section; run once, then change the admin password), then start under PM2:

```bash
npm run migrate && npm run seed
pm2 start src/index.js --name construction-erp-api --max-memory-restart 400M
pm2 save && pm2 startup        # respawn on reboot
```

Health check: `curl http://127.0.0.1:4000/api/health`.

> **Remove demo logins** before onboarding real users if you used the seeded demo users; keep only the super admin and set a strong password immediately.

## 4. Frontend builds

```bash
cd ../web-app
npm ci
VITE_API_URL=https://api.your-domain.com npm run build     # → dist/

cd ../admin-panel
npm ci
VITE_API_URL=https://api.your-domain.com npm run build
```

Both apps call `VITE_API_URL` at runtime if set at build time; alternatively serve them on the same domain and keep the built-in relative `/api` behaviour with the proxy block below.

## 5. Nginx

`/etc/nginx/sites-available/construction-erp`:

```nginx
server {
    listen 80;
    server_name api.your-domain.com;
    client_max_body_size 25m;              # match MAX_FILE_SIZE_MB
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

server {
    listen 80;
    server_name app.your-domain.com;
    root /var/www/construction-erp/web-app/dist;
    index index.html;
    location / { try_files $uri /index.html; }        # SPA fallback
}

server {
    listen 80;
    server_name admin.your-domain.com;
    root /var/www/construction-erp/admin-panel/dist;
    index index.html;
    location / { try_files $uri /index.html; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/construction-erp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 6. HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.your-domain.com -d app.your-domain.com -d admin.your-domain.com
sudo certbot renew --dry-run            # auto-renewal timer is installed
```

The mobile app **requires HTTPS in production** (Android blocks cleartext by default) — point `mobile/app.json → expo.extra.apiUrl` at `https://api.your-domain.com` before running EAS builds.

## 7. Checklist — go-live

- [ ] `NODE_ENV=production`, unique strong `JWT_SECRET` / `JWT_REFRESH_SECRET`
- [ ] `CORS_ORIGINS` lists only the real web origins
- [ ] Super-admin password changed; demo users removed/disabled
- [ ] MySQL bound to localhost or private subnet; firewall allows only 22/80/443
- [ ] `uploads/` on persistent storage with correct ownership (`pm2` user can write)
- [ ] `client_max_body_size` ≥ `MAX_FILE_SIZE_MB`
- [ ] Health monitoring: `pm2 monit`, log rotate (`pm2 install pm2-logrotate`)
- [ ] DB + uploads backups scheduled (below)
- [ ] Smoke test passes against production: `BASE_URL=https://api.your-domain.com npm run smoke`

## 8. Backups

Daily DB dump + uploads archive (cron `/etc/cron.d/erp-backup`):

```cron
15 2 * * * erp mysqldump -u erp -p'<password>' --single-transaction construction_erp | gzip > /backups/db/erp-$(date +\%F).sql.gz
30 2 * * * erp tar czf /backups/uploads/erp-uploads-$(date +\%F).tar.gz -C /var/www/construction-erp/backend uploads
```

Keep ≥ 14 days locally and sync to object storage. Test restores quarterly:

```bash
gunzip -c erp-2026-08-01.sql.gz | mysql -u erp -p construction_erp_restore
```

## 9. Updating

```bash
cd /var/www/construction-erp
git pull
(cd backend && npm ci --omit=dev && npm run migrate && pm2 restart construction-erp-api)
(cd web-app && npm ci && VITE_API_URL=https://api.your-domain.com npm run build)
(cd admin-panel && npm ci && VITE_API_URL=https://api.your-domain.com npm run build)
```

Migrations are idempotent (`CREATE … IF NOT EXISTS`), so re-running `migrate` on an existing database is safe.

## 10. Scaling notes

- One API process handles hundreds of concurrent site users; scale horizontally with PM2 cluster mode (`pm2 start src/index.js -i max`) — the app is stateless (JWT + shared MySQL + shared uploads dir / NFS).
- Add MySQL indexes only via schema.sql so fresh installs match production.
- For multi-server uploads move `uploads/` to shared storage or object storage behind `/api/files`.
