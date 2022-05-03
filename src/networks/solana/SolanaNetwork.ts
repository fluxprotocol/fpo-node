import Big from "big.js";
import * as anchor from "@project-serum/anchor";
import * as helpers from "./helpers";
import logger from "../../services/LoggerService";
import { SolanaNetworkConfig, InternalSolanaNetworkConfig, parseSolanaNetworkConfig } from "./models/SolanaNetworkConfig";
import { Network } from "../../models/Network";
import { TxCallParams } from "../../models/TxCallParams";
import {Connection, Commitment, PublicKey, LAMPORTS_PER_SOL} from "@solana/web3.js";


export default class SolanaNetwork extends Network {
    static type: string = "solana";
    internalConfig: InternalSolanaNetworkConfig;
    private provider: anchor.AnchorProvider;
    private connection : anchor.web3.Connection;
    constructor(config: SolanaNetworkConfig) {
        super(SolanaNetwork.type, config);

        this.internalConfig = parseSolanaNetworkConfig(config);
        
        let arr: number[] = Object.values(Number(this.internalConfig.privateKey))
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

    async initialize(txParams: TxCallParams): Promise<any> {
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
      
      
          await provider_program.methods.initialize(providerAccountBump).accounts({
                providerAccount: providerAccount,
                user: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            }).rpc();


    }

    async createFeed(txParams: TxCallParams): Promise<any> {
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
        const [priceFeedAccount, priceFeedAccountBump] =
        await anchor.web3.PublicKey.findProgramAddress(
        [
            Buffer.from("pricefeed"),
            providerAccount.toBuffer(),
            new anchor.BN(priceFeedIndex).toArrayLike(Buffer),
        ],
        provider_program.programId
        );

        await provider_program.methods.createFeed(priceFeedAccountBump, txParams.params.description, txParams.params.price).accounts( {
            providerAccount: providerAccount,
            feedAccount: priceFeedAccount,
            authority: this.provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        }).rpc();
        
    }
   
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
        const [priceFeedAccount, priceFeedAccountBump] =
        await anchor.web3.PublicKey.findProgramAddress(
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
   
   
    async getBalance(accountId: string): Promise<Big | undefined> {
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
