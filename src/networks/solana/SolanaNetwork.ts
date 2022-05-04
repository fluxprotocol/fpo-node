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
    
        await helpers.requestAirdrop(this.connection, this.provider.wallet.publicKey);
    

        const provider_state_initial = await provider_program.account.provider.fetch(providerAccount);
        const priceFeedIndex = provider_state_initial.feedsCount;
        console.log("provider_state_initial", provider_state_initial)

        console.log("priceFeedIndex", priceFeedIndex)
        const [priceFeedAccount, priceFeedAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
            [
                Buffer.from("pricefeed"),
                providerAccount.toBuffer(),
                new anchor.BN(priceFeedIndex - 1).toArrayLike(Buffer),
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

    // async onQueueBatch(batch: DataRequestBatchResolved): Promise<void> {
    //     try {
    //         if (!this.internalConfig) throw new Error(`[${this.id}] Config is not loaded`);
    //         const maxGas = new anchor.BN(this.internalConfig.maxGas);

    //         const actions = batch.requests.map((request) => {
    //             return transactions.functionCall(request.txCallParams.method, {
    //                 ...request.txCallParams.params,
    //             }, maxGas.div(new BN(batch.requests.length)), new BN(request.txCallParams.amount));
    //         });

    //         // Near blocks access to actions that can batch... Yet they document the method...
    //         // @ts-ignore
    //         const txOutcome = await this.internalConfig.account.signAndSendTransaction({
    //             receiverId: batch.targetAddress,
    //             actions,
    //         });

    //         if (isTransactionFailure(txOutcome)) {
    //             logger.error(`[${this.id}] Batch could not be completed`, {
    //                 txOutcome: JSON.stringify(txOutcome),
    //             });
    //         }
    //     } catch (error) {
    //         logger.error(`[${this.id}] On queue batch unknown error`, {
    //             error
    //         });
    //     }
    // }


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
   
    async updateFeed(txParams: TxCallParams): Promise<any> {
        // IDL
        if (!txParams.abi) throw new Error(`[${this.id}] ABI is required for tx ${JSON.stringify(txParams)}`);
        
        const provider_program = new anchor.Program(txParams.abi, txParams.address, this.provider);
        const [providerAccount, providerAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("provider"), this.provider.wallet.publicKey.toBuffer()],
            provider_program.programId
        );
            
        console.log("providerAccount ", providerAccount.toBase58());
        console.log("providerAccountBump ", providerAccountBump);
    
        await helpers.requestAirdrop(this.connection, this.provider.wallet.publicKey);
    

        const provider_state_initial = await provider_program.account.provider.fetch(providerAccount);
        const priceFeedIndex = provider_state_initial.feedsCount;
        const [priceFeedAccount, priceFeedAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
            [
                Buffer.from("pricefeed"),
                providerAccount.toBuffer(),
                new anchor.BN(priceFeedIndex).toArrayLike(Buffer),
            ],
            provider_program.programId
        );

       
        await provider_program.methods.updateFeed(txParams.params.price).accounts( {
            providerAccount: providerAccount,
            feedAccount: priceFeedAccount,
            authority: this.provider.wallet.publicKey,
        }).rpc();

    }
   
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
