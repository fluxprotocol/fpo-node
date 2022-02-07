export declare enum OutcomeType {
    Answer = 0,
    Invalid = 1
}

export interface OutcomeAnswer {
    answer: string;
    type: OutcomeType.Answer;
}

export interface OutcomeInvalid {
    type: OutcomeType.Invalid;
}

export declare type Outcome = OutcomeAnswer | OutcomeInvalid;
