import loadBasicFetchBinary from "./loadBinary";
import logger from "../../services/LoggerService";
import { DataRequest } from "../../models/DataRequest";
import { ExecuteResult } from '@fluxprotocol/oracle-vm/dist/models/ExecuteResult';
import { Job } from "../../models/Job";
import { Outcome, OutcomeType } from "../../models/Outcome";
import { createSafeAppConfigString } from '../../models/AppConfig';
import { execute, InMemoryCache } from '@fluxprotocol/oracle-vm';
import { executeFetch } from './executeFetch';

export class FetchJob extends Job {
    static type = 'FetchJob';
    id = FetchJob.type;
    type = FetchJob.type;
    vmCache: InMemoryCache = new InMemoryCache();

    async init(): Promise<boolean> {
        try {
            await loadBasicFetchBinary();
            return true;
        } catch (error) {
            logger.error(`[${this.id}] ${error}`);
            return false;
        }
    }

    async executeRequest(request: DataRequest): Promise<Outcome> {
        try {
            const binary = await loadBasicFetchBinary();
            const params = {
                args: request.args,
                binary,
                env: {},
                gasLimit: (300_000_000_000_000).toString(),
                randomSeed: '0x0001',
                timestamp: 1,
            };
            const executeResult = await execute(params, this.vmCache);
            console.log("===== VM output ===== \n", executeResult);

            const executeResult2: ExecuteResult = await executeFetch(params);
            console.log("===== JS output ===== \n", executeResult2);

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
