export interface TxCallParams {
    /** The address of the contract */
    address: string;

    /** Method to call on smart contract */
    method: string;

    /** Amount of native token to send along */
    amount: string;

    /** Some chains (EVM) need an ABI in order to call the contract and encode params */
    abi?: any;

    /** parameters to send with calling of transaction */
    params: {
        [key: string]: any,
    }
}
