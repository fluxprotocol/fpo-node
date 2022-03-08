import { config } from 'dotenv';
import EvmNetwork from './networks/evm/EvmNetwork';
import packageJson from '../package.json';
import { LayerZeroModule } from './modules/layerZero/LayerZeroModule';
import { PushPairModule } from './modules/pushPair/PushPairModule';
import { BalanceCheckerModule } from './modules/balanceChecker/BalanceCheckerModule';
import { FetchJob } from './jobs/fetch/FetchJob';
import { NearNetwork } from './networks/near/NearNetwork';

config();

export const MAX_LOG_LIFETIME = '14d';
export const DEBUG = process.env.DEBUG === 'true';
export const SENTRY_DSN = process.env.SENTRY_DSN ?? 'https://f3df268cea12441c85812120267992f4@o1104820.ingest.sentry.io/6132195';
export const ENABLE_ANALYTICS = process.env.ENABLE_ANALYTICS ? process.env.ENABLE_ANALYTICS === 'true' : true;
export const PROJECT_NAME = packageJson.name;
export const PROJECT_VERSION = packageJson.version;
export const APP_CONFIG_LOCATION = process.env.APP_CONFIG_LOCATION ?? './config.json'

export const AVAILABLE_NETWORKS = [EvmNetwork, NearNetwork];
export const AVAILABLE_MODULES = [LayerZeroModule, PushPairModule, BalanceCheckerModule];
export const AVAILABLE_JOBS = [FetchJob];
export const NODE_ID = process.env.NODE_ID ?? 'Anonymous';
