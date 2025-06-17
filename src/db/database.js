import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { Logger } from '../utils/logger.js';

const { Pool } = pg;

export class Database {
  constructor() {
    this.logger = new Logger('Database');
    this.pool = null;
    this.supabase = null;
  }

  async connect() {
    try {
      // Initialize Postgres connection
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false
        }
      });

      // Test connection
      await this.pool.query('SELECT NOW()');
      this.logger.info('Connected to Postgres database');

      // Initialize Supabase client (optional, for additional features)
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        this.supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
        this.logger.info('Initialized Supabase client');
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.logger.info('Disconnected from database');
    }
  }

  async query(text, params) {
    try {
      const start = Date.now();
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      this.logger.debug('Query executed', {
        text: text.substring(0, 100),
        duration,
        rows: result.rowCount
      });

      return result;
    } catch (error) {
      this.logger.error('Query failed', error, { text });
      throw error;
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}