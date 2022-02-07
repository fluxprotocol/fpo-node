import { DataRequest } from "./DataRequest";
import { Outcome } from "./Outcome";

export class Job {
    static type = "job";
    id: string = 'job';
    type: string = Job.type;

    constructor() {

    }

    async init(): Promise<boolean> {
        return false;
    }

    async executeRequest(request: DataRequest): Promise<Outcome> {
        throw new Error(`${this.id} not implemented "executeRequest"`);
    }
}
