import DatabaseConstructor, { Database } from "better-sqlite3";
import { DEBUG } from "../config";
import logger from "../services/LoggerService";


// Should genericize at some point.
export default class DBLogger {
	private db: Database;

	constructor(logFile: string) {
		logger.info("Setting up log file...");

		const db_opts = DEBUG ? { verbose: logger.info } : { verbose: logger.debug };
		this.db = new DatabaseConstructor(`${process.env.FUZZ_LOGS ?? 'logs'}/${logFile}`, db_opts);


		this.db.exec(`CREATE TABLE IF NOT EXISTS logs (
			tx_id TEXT NOT NULL,
			ts TIMESTAMP NOT NULL,
			answers TEXT NOT NULL,
			PRIMARY KEY(tx_id, ts)
            );`);
		this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS timestamps on logs(ts);`);
		this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS transactions on logs(tx_id);`);
		logger.info("Done setting up log file...");
	}

	log(hash: string, answers: string): void {
		this.db
			.prepare(`INSERT INTO logs VALUES (?, ?, ?);`)
			.run(hash, Date.now(), answers);
	}

	close(): void {
		this.db.close();
	}
}