import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  port: number;
  host: string;
  apiPrefix: string;
  corsOrigins: string[];
  frontendUrl: string;
  telephonyProvider: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
    issuer: string;
  };
  redisUrl: string;
  storageBucket: string;
}

/** Validated environment object. Fails fast when required values are absent. */
export const config: AppConfig = {
  env: (process.env.NODE_ENV as AppConfig['env']) ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  apiPrefix: process.env.API_PREFIX ?? '/api/v1',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3001').split(','),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
  telephonyProvider: (process.env.TELEPHONY_PROVIDER ?? 'EXOTEL').toUpperCase(),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '14d',
    issuer: process.env.JWT_ISSUER ?? 'callcenter-crm',
  },
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  storageBucket: process.env.STORAGE_BUCKET ?? 'callcenter-crm',
};