import pg from 'pg';
import { runMigrations } from '../../src/infrastructure/orm/migrate.ts';
import { createPool } from '../../src/infrastructure/orm/pool.ts';
import { TEST_DATABASE_URL } from './db.ts';

async function ensureTestDatabase(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }
}

export default async function setup(): Promise<void> {
  await ensureTestDatabase();
  const pool = createPool(TEST_DATABASE_URL);
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
