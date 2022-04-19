import { AppConfig } from "./AppConfig";
import { DataRequest } from "./DataRequest";
import { IJob } from "./IJob";
import { Outcome } from "./Outcome";

export class Job implements IJob {
    static type = "job";
    id: string = 'job';
    type: string = Job.type;
    appConfig: AppConfig;

    constructor(appConfig: AppConfig) {
        this.appConfig = appConfig;
    }

    async init(): Promise<boolean> {
        return false;
    }

    async executeRequest(request: DataRequest): Promise<Outcome> {
        throw new Error(`${this.id} not implemented "executeRequest"`);
    }
}
