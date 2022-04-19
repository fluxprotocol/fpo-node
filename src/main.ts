import logger from './services/LoggerService';
import { parseAppConfig } from './services/AppConfigService';
import { PROJECT_NAME, PROJECT_VERSION } from './config';
import { aggregate, start_p2p } from './p2p/aggregator';

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

        const p2p = await start_p2p(appConfig.p2p_node, appConfig.peers_file);
        await aggregate(p2p, 'foo');

        logger.info(`🚀 Booted`);
    } catch (error) {
        logger.error(`${error}`);
        process.exit(1);
    }
}

main();
