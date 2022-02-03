import { config } from 'dotenv';
import EvmNetwork from './networks/evm/EvmNetwork';
import packageJson from '../package.json';
import { LayerZeroModule } from './modules/layerZero/LayerZeroModule';

config();

export const MAX_LOG_LIFETIME = '14d';
export const DEBUG = process.env.DEBUG === 'true';
export const SENTRY_DSN = 'https://f3df268cea12441c85812120267992f4@o1104820.ingest.sentry.io/6132195';
export const ENABLE_ANALYTICS = process.env.ENABLE_ANALYTICS ? process.env.ENABLE_ANALYTICS === 'true' : true;
export const PROJECT_NAME = packageJson.name;
export const PROJECT_VERSION = packageJson.version;
export const APP_CONFIG_LOCATION = process.env.APP_CONFIG_LOCATION ?? './config.json'


export const AVAILABLE_NETWORKS = [EvmNetwork];
export const AVAILABLE_LISTENERS = [LayerZeroModule];
