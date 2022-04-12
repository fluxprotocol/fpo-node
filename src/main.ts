import logger from './services/LoggerService';
import { parseAppConfig } from './services/AppConfigService';
import { PROJECT_NAME, PROJECT_VERSION } from './config';

async function main() {
    logger.info(`🧙 Starting ${PROJECT_NAME} v${PROJECT_VERSION}`);

    try {
        const appConfig = await parseAppConfig();

        await Promise.all(appConfig.networks.map(network => network.init()));

        const jobBootResults = await Promise.all(appConfig.jobs.map(job => job.init()));
        const didJobBootFail = jobBootResults.some(isStarted => isStarted === false);
        if (didJobBootFail) throw new Error(`Failed to boot due a job issue`);

        const moduleBootResults = await Promise.all(appConfig.modules.map(module => module.start()));
        const didModuleBootFail = moduleBootResults.some(isStarted => isStarted === false);
        if (didModuleBootFail) throw new Error(`Failed to boot due a module issue`);

        await appConfig.healthcheck.start();

        logger.info(`🚀 Booted`);
    } catch (error) {
        logger.error(`${error}`);
        process.exit(1);
    }
}

main();
