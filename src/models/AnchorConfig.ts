interface Source {
    source_path: string;
    end_point: string;
    multiplier?: string;
    http_method?: string;
    http_body?: string;
    http_headers?: {
        [key: string]: string;
    };
}

export interface AnchorConfig {
    anchorDeviationPercentage: number;
    anchorSources: Source[];
    anchorPushOnCheckFail: boolean;
    anchorRetriesBeforeFail: number;
    anchorWaitBetweenTriesInMs: number;
}