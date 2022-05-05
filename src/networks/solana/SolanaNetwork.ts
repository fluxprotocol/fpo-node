import Big from "big.js";
import * as anchor from "@project-serum/anchor";
import * as helpers from "./helpers";
import logger from "../../services/LoggerService";
import { SolanaNetworkConfig, InternalSolanaNetworkConfig, parseSolanaNetworkConfig } from "./models/SolanaNetworkConfig";
import { Network } from "../../models/Network";
import { TxCallParams } from "../../models/TxCallParams";
import {Connection, Commitment, PublicKey, LAMPORTS_PER_SOL} from "@solana/web3.js";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { DataRequestBatchResolved } from "../../models/DataRequestBatch";

export default class SolanaNetwork extends Network {
    static type: string = "solana";
    internalConfig?: InternalSolanaNetworkConfig;
    provider!: anchor.AnchorProvider;
    connection!: anchor.web3.Connection;
    constructor(config: SolanaNetworkConfig) {
        super(SolanaNetwork.type, config);

        this.internalConfig = parseSolanaNetworkConfig(config);
        const bytes = bs58.decode(this.internalConfig.privateKey)

        let arr = Object.values(bytes)
        let secret = new Uint8Array(arr)
        const provider_pair = anchor.web3.Keypair.fromSecretKey(secret)
        const commitment: Commitment = 'processed';
        this.connection = new Connection(this.internalConfig.rpc, { commitment, wsEndpoint: this.internalConfig.wss});

        this.provider = helpers.getProvider(
            this.connection,
            provider_pair
        );
    
        this.queue.start(this.onQueueBatch.bind(this));

    }
    async init() {
        // this.internalConfig = parseSolanaNetworkConfig(this.networkConfig);
        // const bytes = bs58.decode(this.internalConfig.privateKey)

        // let arr = Object.values(bytes)
        // let secret = new Uint8Array(arr)
        // const provider_pair = anchor.web3.Keypair.fromSecretKey(secret)
        // const commitment: Commitment = 'processed';
        // this.connection = new Connection(this.internalConfig.rpc, { commitment, wsEndpoint: this.internalConfig.wss});

        // this.provider = helpers.getProvider(
        //     this.connection,
        //     provider_pair
        // );
    
        // this.queue.start(this.onQueueBatch.bind(this));
        return;
    }
    async view(txParams: TxCallParams): Promise<any> {
        // if (!this.internalConfig) throw new Error(`[${this.id}] Config is not loaded`);

        // const result = await this.internalConfig.account.viewFunction(txParams.address, txParams.method, txParams.params);
        // return result;
        console.log("SOLANA VIEW FN")

        if (!txParams.abi) throw new Error(`[${this.id}] ABI is required for tx ${JSON.stringify(txParams)}`);
        
        const provider_program = new anchor.Program(txParams.abi, txParams.address, this.provider);
        // console.log("provider_program ", provider_program);
        console.log("provider_program.programId ", provider_program.programId.toBase58());


        const [providerAccount, providerAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("provider"), this.provider.wallet.publicKey.toBuffer()],
            provider_program.programId
        );
            
        console.log("providerAccount ", providerAccount.toBase58());
        console.log("providerAccountBump ", providerAccountBump);
    
        // await helpers.requestAirdrop(this.connection, this.provider.wallet.publicKey);
    

        const provider_state_initial = await provider_program.account.provider.fetch(providerAccount);
        const priceFeedIndex = provider_state_initial.feedsCount;
        console.log("provider_state_initial", provider_state_initial)

        console.log("priceFeedIndex", priceFeedIndex)
        console.log("txParams.params.pair", txParams.params.pair)
        console.log("txParams.params.decimals", txParams.params.decimals)

        const [priceFeedAccount, priceFeedAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
            [
                Buffer.from("pricefeed"),
                providerAccount.toBuffer(),
                txParams.params.pair,
                new anchor.BN(txParams.params.decimals).toArrayLike(Buffer)
                
            ],
            provider_program.programId
        );
        console.log("priceFeedAccount", priceFeedAccount.toBase58())

        // const provider_state = await provider_program.account.provider.fetch(providerAccount);
        const priceFeedState = await provider_program.account.priceFeed.fetch(priceFeedAccount);
        console.log("priceFeedState: ", priceFeedState);
        console.log("Number(priceFeedState.lastUpdate) ", Number(priceFeedState.lastUpdate))
        return (Number(priceFeedState.lastUpdate));
    }

    
    async onQueueBatch(batch: DataRequestBatchResolved): Promise<void> {
        for await (const request of batch.requests) {
            try {
                if (!request.txCallParams.abi) {
                    logger.warn(`[${this.id}] Tx ${request.internalId} was not processed due to missing ABI`);
                    continue; 
                }

                // const contract = new Contract(request.txCallParams.address, request.txCallParams.abi, this.wallet);
                const provider_program = new anchor.Program(request.txCallParams.abi, request.txCallParams.address, this.provider);

                const [providerAccount, providerAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
                    [Buffer.from("provider"), this.provider.wallet.publicKey.toBuffer()],
                    provider_program.programId
                );
                    
                console.log("providerAccount ", providerAccount.toBase58());
                console.log("providerAccountBump ", providerAccountBump);
            
                // await helpers.requestAirdrop(this.connection, this.provider.wallet.publicKey);
                console.log("ONQUEUEBATCH txParams.params.pair", request.txCallParams.params.pair)
                console.log("ONQUEUEBATCH txParams.params.decimals", request.txCallParams.params.decimals)
        
                const provider_state_initial = await provider_program.account.provider.fetch(providerAccount);
                const priceFeedIndex = provider_state_initial.feedsCount;
                const [priceFeedAccount, priceFeedAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
                    [
                        Buffer.from("pricefeed"),
                        providerAccount.toBuffer(),
                        // new anchor.BN(priceFeedIndex - 1).toArrayLike(Buffer),
                        request.txCallParams.params.pair,
                        new anchor.BN(request.txCallParams.params.decimals).toArrayLike(Buffer)
                    ],
                    provider_program.programId
                );
        
               
                await provider_program.methods.updateFeed(request.txCallParams.params.price).accounts( {
                    providerAccount: providerAccount,
                    feedAccount: priceFeedAccount,
                    authority: this.provider.wallet.publicKey,
                }).rpc();
        
                // if (!contract[request.txCallParams.method]) {
                //     logger.warn(`[${this.id}] Tx ${request.internalId} was not processed due to missing method ${request.txCallParams.method}`);
                //     continue;
                // }

                // const args = Object.values(request.txCallParams.params);
                // await contract[request.txCallParams.method](...args);

            } catch (error: any) {
                // Try to check if SERVER ERROR was because a node already pushed the same update
                //
                // Error messages (i.e. `error.body.error.message`) differ depending on the network.
                //  - Aurora Testnet: `ERR_INCORRECT_NONCE`
                //  - Goerli: `already known`
                if (error.code === 'SERVER_ERROR' && error.body) {
                    try {
                        const body = JSON.parse(error.body);
                        if (body.error && body.error.code && body.error.code === -32000 && body.error.message
                            && (body.error.message === 'ERR_INCORRECT_NONCE' || body.error.message === 'already known')
                        ) {
                            logger.debug(`[${this.id}-onQueueBatch] [${request.internalId}] Request seems to be already pushed (${body.error.message})`);

                            continue;
                        }
                    } catch (error) {
                        // Do nothing as error will be logged in next lines
                    }
                }

                logger.error(`[${this.id}-onQueueBatch] [${request.internalId}] On queue batch unknown error`, {
                    error,
                    config: this.networkConfig,
                    fingerprint: `${this.type}-${this.networkId}-onQueueBatch-unknown`,
                });
            }
        }
    }


    // async initialize(txParams: TxCallParams): Promise<any> {
    //     // IDL
    //     if (!txParams.abi) throw new Error(`[${this.id}] ABI is required for tx ${JSON.stringify(txParams)}`);
        
    //     const provider_program = new anchor.Program(txParams.abi, txParams.address, this.provider);
    //     const [providerAccount, providerAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
    //         [Buffer.from("provider"), this.provider.wallet.publicKey.toBuffer()],
    //         provider_program.programId
    //       );
              
    //       console.log("providerAccount ", providerAccount.toBase58());
    //       console.log("providerAccountBump ", providerAccountBump);
      
    //       await helpers.requestAirdrop(this.connection, this.provider.wallet.publicKey);
      
      
    //       await provider_program.methods.initialize(providerAccountBump).accounts({
    //             providerAccount: providerAccount,
    //             user: this.provider.wallet.publicKey,
    //             systemProgram: anchor.web3.SystemProgram.programId,
    //         }).rpc();


    // }
    


    // async createFeed(txParams: TxCallParams): Promise<any> {
    //     // IDL
    //     if (!txParams.abi) throw new Error(`[${this.id}] ABI is required for tx ${JSON.stringify(txParams)}`);
        
    //     const provider_program = new anchor.Program(txParams.abi, txParams.address, this.provider);
    //     const [providerAccount, providerAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
    //         [Buffer.from("provider"), this.provider.wallet.publicKey.toBuffer()],
    //         provider_program.programId
    //     );
            
    //     console.log("providerAccount ", providerAccount.toBase58());
    //     console.log("providerAccountBump ", providerAccountBump);
    
    //     await helpers.requestAirdrop(this.connection, this.provider.wallet.publicKey);
    

    //     const provider_state_initial = await provider_program.account.provider.fetch(providerAccount);
    //     const priceFeedIndex = provider_state_initial.feedsCount;
    //     const [priceFeedAccount, priceFeedAccountBump] =
    //     await anchor.web3.PublicKey.findProgramAddress(
    //     [
    //         Buffer.from("pricefeed"),
    //         providerAccount.toBuffer(),
    //         new anchor.BN(priceFeedIndex).toArrayLike(Buffer),
    //     ],
    //     provider_program.programId
    //     );

    //     await provider_program.methods.createFeed(priceFeedAccountBump, txParams.params.description, txParams.params.price).accounts( {
    //         providerAccount: providerAccount,
    //         feedAccount: priceFeedAccount,
    //         authority: this.provider.wallet.publicKey,
    //         systemProgram: anchor.web3.SystemProgram.programId,
    //     }).rpc();
        
    // }

    // async createFeed(idl: any, programId: string, description: string, price: number ): Promise<any> {
    //     // IDL
    //     if (!idl) throw new Error(`[${this.id}] IDL is required for tx`);
        
    //     const provider_program = new anchor.Program(idl, programId, this.provider);
    //     const [providerAccount, providerAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
    //         [Buffer.from("provider"), this.provider.wallet.publicKey.toBuffer()],
    //         provider_program.programId
    //     );
            
    //     console.log("providerAccount ", providerAccount.toBase58());
    //     console.log("providerAccountBump ", providerAccountBump);
    
    //     await helpers.requestAirdrop(this.connection, this.provider.wallet.publicKey);
    

    //     const provider_state_initial = await provider_program.account.provider.fetch(providerAccount);
    //     const priceFeedIndex = provider_state_initial.feedsCount;
    //     const [priceFeedAccount, priceFeedAccountBump] =
    //     await anchor.web3.PublicKey.findProgramAddress(
    //     [
    //         Buffer.from("pricefeed"),
    //         providerAccount.toBuffer(),
    //         new anchor.BN(priceFeedIndex).toArrayLike(Buffer),
    //     ],
    //     provider_program.programId
    //     );

    //     await provider_program.methods.createFeed(priceFeedAccountBump, description, price).accounts( {
    //         providerAccount: providerAccount,
    //         feedAccount: priceFeedAccount,
    //         authority: this.provider.wallet.publicKey,
    //         systemProgram: anchor.web3.SystemProgram.programId,
    //     }).rpc();
        
    // }
   
    // async updateFeed(txParams: TxCallParams): Promise<any> {
    //     // IDL
    //     if (!txParams.abi) throw new Error(`[${this.id}] ABI is required for tx ${JSON.stringify(txParams)}`);
        
    //     const provider_program = new anchor.Program(txParams.abi, txParams.address, this.provider);
    //     const [providerAccount, providerAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
    //         [Buffer.from("provider"), this.provider.wallet.publicKey.toBuffer()],
    //         provider_program.programId
    //     );
            
    //     console.log("providerAccount ", providerAccount.toBase58());
    //     console.log("providerAccountBump ", providerAccountBump);
    
    //     await helpers.requestAirdrop(this.connection, this.provider.wallet.publicKey);
    

    //     const provider_state_initial = await provider_program.account.provider.fetch(providerAccount);
    //     const priceFeedIndex = provider_state_initial.feedsCount;
    //     const [priceFeedAccount, priceFeedAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
    //         [
    //             Buffer.from("pricefeed"),
    //             providerAccount.toBuffer(),
    //             new anchor.BN(priceFeedIndex).toArrayLike(Buffer),
    //         ],
    //         provider_program.programId
    //     );

       
    //     await provider_program.methods.updateFeed(txParams.params.price).accounts( {
    //         providerAccount: providerAccount,
    //         feedAccount: priceFeedAccount,
    //         authority: this.provider.wallet.publicKey,
    //     }).rpc();

    // }
   
    // async updateFeed(idl: any, programId: string, price: number ): Promise<any> {
    //     // IDL
    //     if (!idl) throw new Error(`[${this.id}] IDL is required for tx`);
        
    //     const provider_program = new anchor.Program(idl, programId, this.provider);
    //     const [providerAccount, providerAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
    //         [Buffer.from("provider"), this.provider.wallet.publicKey.toBuffer()],
    //         provider_program.programId
    //     );
            
    //     console.log("providerAccount ", providerAccount.toBase58());
    //     console.log("providerAccountBump ", providerAccountBump);
    
    //     await helpers.requestAirdrop(this.connection, this.provider.wallet.publicKey);
    

    //     const provider_state_initial = await provider_program.account.provider.fetch(providerAccount);
    //     const priceFeedIndex = provider_state_initial.feedsCount;
    //     const [priceFeedAccount, priceFeedAccountBump] =
    //     await anchor.web3.PublicKey.findProgramAddress(
    //     [
    //         Buffer.from("pricefeed"),
    //         providerAccount.toBuffer(),
    //         new anchor.BN(priceFeedIndex).toArrayLike(Buffer),
    //     ],
    //     provider_program.programId
    //     );

       
    //     await provider_program.methods.updateFeed(price).accounts( {
    //         providerAccount: providerAccount,
    //         feedAccount: priceFeedAccount,
    //         authority: this.provider.wallet.publicKey,
    //     }).rpc();

    // }
   
   
    async getBalance(accountId: string): Promise<Big | undefined> {
        console.log("SOLANA GET BALANCE")
        try {
            const acc: PublicKey = new PublicKey(accountId);
            const response = await this.connection.getAccountInfo(acc);
            let balance;
            if(response != null){
                balance = response.lamports/LAMPORTS_PER_SOL;
            }

            if (!balance) return;

            return new Big(balance.toString());
        } catch (error) {
            logger.error(`[${this.id}-getBalance] Get balance unknown error`, {
                error,
                config: this.networkConfig,
                fingerprint: `${this.type}-${this.networkId}-getBalance-unknown`,
            });
            return undefined;
        }
    }

    getWalletPublicAddress() {
        return this.provider.wallet.publicKey;
    }
}
