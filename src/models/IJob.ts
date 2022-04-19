import { DataRequest } from "./DataRequest";
import { Outcome } from "./Outcome";

export interface IJob {
    type: string;
    id: string;
    init(): Promise<boolean>;
    executeRequest(request: DataRequest): Promise<Outcome>
}
