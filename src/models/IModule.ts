export interface ModuleConfig {
    type: string;
    networkId: number;
}

export interface IModule {
    type: string;
    id: string;
    moduleConfig: ModuleConfig;

    start(): Promise<boolean>;
    stop(): any;
}
