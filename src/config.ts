import { config } from 'dotenv';
import packageJson from '../package.json';
import Big from 'big.js';

config();

Big.PE = 1000000;

export const MAX_LOG_LIFETIME = '14d';
export const DEBUG = process.env.DEBUG === 'true';
export const SENTRY_DSN = process.env.SENTRY_DSN;
export const ENABLE_ANALYTICS = process.env.ENABLE_ANALYTICS ? process.env.ENABLE_ANALYTICS === 'true' : true;
export const PROJECT_NAME = packageJson.name;
export const PROJECT_VERSION = packageJson.version;
export const APP_CONFIG_LOCATION = process.env.APP_CONFIG_LOCATION ?? './config.json'

export const NODE_ID = process.env.NODE_ID ?? 'Anonymous';

export const ENABLE_TELEGRAM_NOTIFICATIONS = process.env.ENABLE_TELEGRAM_NOTIFICATIONS === 'true';
export const TELEGRAM_BOT_API = process.env.TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}` : "";
export const TELEGRAM_ALERTS_CHAT_ID = process.env.TELEGRAM_ALERTS_CHAT_ID;
export const TELEGRAM_STATS_CHAT_ID = process.env.TELEGRAM_STATS_CHAT_ID;

export const HEALTHCHECK_ENABLED = process.env.HEALTHCHECK_ENABLED === 'true';
export const HEALTHCHECK_PORT = process.env.HEALTHCHECK_PORT ?? '80';
