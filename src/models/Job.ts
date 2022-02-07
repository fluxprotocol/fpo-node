import { DataRequest } from "./DataRequest";
import { Outcome } from "./Outcome";

export class Job {
    static type = "job";

    constructor(public id: string) {

    }

    async executeRequest(request: DataRequest): Promise<Outcome> {
        throw new Error(`${this.id} not implemented "executeRequest"`);
    }
}
