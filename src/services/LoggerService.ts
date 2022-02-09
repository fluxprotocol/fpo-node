import winston, { format } from 'winston';

import { DEBUG, ENABLE_ANALYTICS, MAX_LOG_LIFETIME, PROJECT_NAME, SENTRY_DSN } from '../config';
import Sentry from 'winston-transport-sentry-node';
import 'winston-daily-rotate-file';

const logFormat = format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`);

const logger = winston.createLogger({
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
    ),
    transports: [
        new winston.transports.DailyRotateFile({
            level: 'debug',
            filename: `${PROJECT_NAME}-%DATE%.log`,
            datePattern: 'YYYY-MMM-DD',
            zippedArchive: true,
            dirname: `logs/`,
            format: logFormat,
            maxFiles: MAX_LOG_LIFETIME,
        }),
        new winston.transports.Console({
            level: 'info',
            format: format.combine(
                format.colorize(),
                logFormat,
            ),
        }),
    ],
});

if (ENABLE_ANALYTICS) {
    logger.add(new Sentry({
        sentry: {
            dsn: SENTRY_DSN,
        },
        level: 'warn',
    }));
}

logger.transports.forEach((transport) => {
    // @ts-ignore
    if (transport.name === 'console') {
        transport.level = DEBUG ? 'debug' : 'info';
    }
});

export default logger;
