import database from './services/DatabaseService';
import logger from './services/LoggerService';
import { parseAppConfig } from './models/AppConfig';
import { DB_NAME, DB_PATH, PROJECT_NAME, PROJECT_VERSION } from './config';

async function main() {
    logger.info(`🧙 Starting ${PROJECT_NAME} v${PROJECT_VERSION}`);

    try {
        await database.startDatabase(DB_PATH, DB_NAME);

        const appConfig = await parseAppConfig();

        const jobBootResults = await Promise.all(appConfig.jobs.map(job => job.init()));
        const didJobBootFail = jobBootResults.some(isStarted => isStarted === false);
        if (didJobBootFail) throw new Error(`Failed to boot due a job issue`);

        const moduleBootResults = await Promise.all(appConfig.modules.map(module => module.start()));
        const didModuleBootFail = moduleBootResults.some(isStarted => isStarted === false);
        if (didModuleBootFail) throw new Error(`Failed to boot due a module issue`);

        logger.info(`🚀 Booted`);
    } catch (error) {
        logger.error(`${error}`);
        process.exit(1);
    }
}

main();
