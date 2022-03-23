import logger from './services/LoggerService';
import { parseAppConfig } from './models/AppConfig';
import { PROJECT_NAME, PROJECT_VERSION } from './config';
import Communicator from './p2p/communication';

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

        // Should we default more of the options and only ask for
        // A peer id file, and the port?
        const p2p = new Communicator('send');
        logger.info(`🚀 Booted`);
    } catch (error) {
        logger.error(`${error}`);
        process.exit(1);
    }
}

main();
