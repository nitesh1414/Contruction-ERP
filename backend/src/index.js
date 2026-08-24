import { createApp } from './app.js';
import { config } from './config/index.js';
import { checkConnection } from './db/pool.js';

const app = createApp();

async function start() {
  try {
    await checkConnection();
    console.log(`[db] Connected to MySQL at ${config.db.host}:${config.db.port}/${config.db.database}`);
  } catch (err) {
    console.error(`[db] MySQL connection failed: ${err.message}`);
    console.error('[db] The API will keep running; database-backed endpoints will fail until MySQL is reachable.');
  }
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[api] Construction ERP API listening on http://0.0.0.0:${config.port} (${config.env})`);
  });
}

start();
