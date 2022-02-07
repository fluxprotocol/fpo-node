import logger from './services/LoggerService';
import { parseAppConfig } from './models/AppConfig';
import { PROJECT_NAME, PROJECT_VERSION } from './config';

async function main() {
    logger.info(`🧙 Starting ${PROJECT_NAME} v${PROJECT_VERSION}`);

    const appConfig = await parseAppConfig();

    await Promise.all(appConfig.networks.map(network => network.init()));
    appConfig.modules.forEach(module => module.start());
}

main();
