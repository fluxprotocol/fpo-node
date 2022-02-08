export enum OutcomeType {
    Answer = 0,
    Invalid = 1
}

export interface OutcomeAnswer {
    answer: string;
    logs: string[];
    type: OutcomeType.Answer;
}

export interface OutcomeInvalid {
    logs: string[];
    type: OutcomeType.Invalid;
}

export type Outcome = OutcomeAnswer | OutcomeInvalid;
