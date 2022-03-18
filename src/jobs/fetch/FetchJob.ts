import logger from "../../services/LoggerService";
import { DataRequest } from "../../models/DataRequest";
import { Job } from "../../models/Job";
import { Outcome, OutcomeType } from "../../models/Outcome";
import { createSafeAppConfigString } from '../../models/AppConfig';
import { executeFetch } from './executeFetch';

export class FetchJob extends Job {
    static type = 'FetchJob';
    id = FetchJob.type;
    type = FetchJob.type;

    async init(): Promise<boolean> {
        return true;
    }

    async executeRequest(request: DataRequest): Promise<Outcome> {
        try {
            const executeResult = await executeFetch(request.args);
            logger.debug(`[${this.id}-${request.internalId}] exit with ${executeResult.code} \n ${executeResult.logs.join('\n')}`);

            if (executeResult.code !== 0) {
                // One or more sources have failed, but it's still a valid answer, we will continue execution after this
                if (executeResult.code === 3) {
                    logger.warn(`[${this.id}] One or more sources could not be resolved, see vm logs for more info`, {
                        logs: executeResult.logs,
                        config: createSafeAppConfigString(this.appConfig),
                        args: request.args,
                    });
                } else {
                    logger.error(`[${this.id}] Exited with code ${executeResult.code} ${executeResult.logs}`, {
                        logs: executeResult.logs,
                        config: createSafeAppConfigString(this.appConfig),
                        args: request.args,
                    });

                    return {
                        type: OutcomeType.Invalid,
                        logs: executeResult.logs,
                    }
                }
            }

            const lastLog = executeResult.logs.pop();

            if (!lastLog) {
                logger.error(`[${this.id}] No logs outputted by VM for ${request.internalId}`, {
                    logs: executeResult.logs,
                    config: createSafeAppConfigString(this.appConfig),
                    args: request.args,
                });

                return {
                    type: OutcomeType.Invalid,
                    logs: executeResult.logs,
                }
            }

            const logResult = JSON.parse(lastLog);

            if (logResult.type !== 'Valid') {
                logger.error(`[${this.id}] Invalid request code: ${executeResult.code} ${executeResult.logs}`, {
                    logs: executeResult.logs,
                    config: createSafeAppConfigString(this.appConfig),
                    args: request.args,
                });

                return {
                    type: OutcomeType.Invalid,
                    logs: executeResult.logs,
                };
            }

            return {
                type: OutcomeType.Answer,
                logs: executeResult.logs,
                answer: logResult.value,
            };
        } catch (error) {
            logger.error(`[${this.id}] ${error}`, {
                args: request.args,
            });

            return {
                type: OutcomeType.Invalid,
                logs: [`${error}`],
            }
        }
    }
}
