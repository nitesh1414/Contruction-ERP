# Installation Guide

This guide installs the full Construction Project Tracking System on a development machine:
**backend API**, **web app**, **admin panel** and **mobile app**.

---

## 1. Prerequisites

| Software | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 LTS (≥ 20 recommended) | https://nodejs.org |
| npm | ≥ 9 | ships with Node |
| MySQL Server | ≥ 8.0 | or MariaDB ≥ 10.6 |
| Git | any recent | |
| Expo Go (phone) | latest | only for mobile dev without a native build |
| Android Studio / Xcode | latest | only for native mobile builds (see MOBILE_BUILD.md) |

Check:

```bash
node -v     # v18+
npm -v      # 9+
mysql --version
```

## 2. Clone

```bash
git clone https://github.com/nitesh1414/Contruction-ERP.git
cd Contruction-ERP
```

## 3. Backend API

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` (see the annotated reference below), then create the database:

```bash
npm run db:setup      # = migrate (creates DB + 55 tables) + seed (roles, demo data)
npm run dev           # API on http://localhost:4000
```

Sanity check:

```bash
curl http://localhost:4000/api/health
# {"success":true,"message":"Construction ERP API is up", ...}
```

### Backend environment variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `production` disables verbose errors |
| `PORT` | `4000` | API listen port |
| `CORS_ORIGINS` | localhost origins | Comma-separated allowed browser origins for the web app & admin panel |
| `DB_HOST` `DB_PORT` | `localhost` `3306` | MySQL host/port |
| `DB_USER` `DB_PASSWORD` | — | MySQL credentials |
| `DB_NAME` | `construction_erp` | Database name (created automatically by migrate) |
| `DB_CONNECTION_LIMIT` | `10` | mysql2 pool size |
| `JWT_SECRET` | — | **Required.** Long random string for access tokens |
| `JWT_EXPIRES_IN` | `12h` | Access-token lifetime |
| `JWT_REFRESH_SECRET` | — | **Required.** Different long random string for refresh tokens |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh-token lifetime |
| `RESET_TOKEN_EXPIRES_MINUTES` | `30` | Password-reset token validity |
| `FRONTEND_BASE_URL` | `http://localhost:5173` | Used to build reset-password links |
| `UPLOAD_DIR` | `uploads` | File storage directory (relative to backend/) |
| `MAX_FILE_SIZE_MB` | `20` | Upload cap per file (JPG/JPEG/PNG/WEBP/PDF/XLS/XLSX/DOC/DOCX) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | admin@constructionerp.com / Admin@123 | First super-admin account created by the seeder |

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 4. Web app (project/site portal)

```bash
cd web-app
npm install
npm run dev          # http://localhost:5173
```

The Vite dev server proxies `/api/*` → the backend (default `http://localhost:4000`). To point it elsewhere, create `web-app/.env`:

```env
API_PROXY_TARGET=http://your-api-host:4000
```

For a production build:

```bash
VITE_API_URL=https://api.your-domain.com npm run build   # static output in dist/
```

## 5. Admin panel

```bash
cd admin-panel
npm install
npm run dev          # http://localhost:5174
```

Same proxy behaviour as the web app (`API_PROXY_TARGET`), same production build flow (`VITE_API_URL`).

## 6. Mobile app

```bash
cd mobile
npm install
```

Configure the API URL (device must be able to reach the backend):

```bash
cp .env.example .env
# EXPO_PUBLIC_API_URL=http://192.168.1.10:4000     ← your machine's LAN IP
```

- Physical phone on the same Wi-Fi → use your computer's LAN IP.
- Android emulator → `http://10.0.2.2:4000`.
- If unset, the app auto-derives the host from the Expo dev server (`:4000`).

Run:

```bash
npx expo start       # scan QR with Expo Go, or press `a` for Android emulator
```

Full native build instructions (APK/AAB/IPA, EAS Build, signing): **[MOBILE_BUILD.md](MOBILE_BUILD.md)**.

## 7. Default accounts after seeding

See the table in the [root README](../README.md#seed-logins). **Change every password before going live.**

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `ECONNREFUSED` from migrate | MySQL not running / wrong host+port in `.env` |
| `Access denied for user` | Fix `DB_USER`/`DB_PASSWORD`; user needs CREATE/ALTER rights |
| Web app loads but API 401s everywhere | Backend not running, or stale token — log out/in |
| CORS error in browser | Add the web origin to `CORS_ORIGINS` and restart the API |
| Exceeded uploads | Files > `MAX_FILE_SIZE_MB` are rejected; raise the limit |
| Mobile app can't reach API | Phone and server on same network; use LAN IP, not `localhost`; check firewall allows port 4000 |
| `db:setup` re-run errors | It is idempotent; to start clean use `npm run db:reset` |
