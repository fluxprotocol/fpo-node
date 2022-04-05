import logger from "../services/LoggerService";
import express from "express";

export interface HealthcheckConfig {
    enabled: boolean;
    port: number;
}

export class Healthcheck {
    static type = "Healthcheck";
    config: HealthcheckConfig;

    constructor(healthcheckConfig: HealthcheckConfig) {
        this.config = healthcheckConfig;
    }

    async start(): Promise<boolean> {
        if (this.config.enabled) {
            const app = express();
            app.get('/healthcheck', (_req, res) => {
                const healthcheck = {
                    message: 'OK',
                    timestamp: Date.now(),
                    uptime: process.uptime()
                };

                try {
                    res.send(healthcheck);
                } catch (e) {
                    healthcheck.message = `Error: ${e}`;
                    res.status(503).send();
                }
            })

            app.listen(this.config.port, () => {
                logger.info(`[${Healthcheck.type}] Service listening on port ${this.config.port}`)
            });
        }

        return this.config.enabled;
    }
}
