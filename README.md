# fpo-node
Provider node for pushing and settling data requests for first-party price feeds on NEAR & EVM chains

## Usage

### Pre-requisites

You must have node.js installed. We are using `v14.18.1`.

## For providing data on an EVM chain
First, deploy a `FluxPriceFeed.sol` contract by [cloning the `price-feeds-evm` repository and following the README](https://github.com/fluxprotocol/price-feeds-evm), saving your contract address to use here. Alternatively, leave the default `config.json` contract address to test your API sources without deploying a new contract, using a contract we deployed to Aurora with access control removed. 
You must deploy a new contract for each pair you provide on an EVM chain.

## For providing data on NEAR

To support the NEAR network, the `near-cli` package needs to be installed. (`npm i -g near-cli`)

### General Set-up

```bash
git clone https://github.com/fluxprotocol/oracle-provider-node
cd oracle-provider-node/
npm install
cp .env.example .env # add private key & node ID
nano config.json # populate with contract address, API sources, network, and interval
```

To improve the project and receive better support please consider setting the `ENABLE_ANALYTICS` to `true`. No private keys will be submitted. 

In `config.json`, each price pair is mapped to a single contract and can have any number of sources. The node will push the result of the last source that returns an answer, throwing out sources that do not respond.

## NEAR Setup

First login using the near-cli by doing `NEAR_ENV=testnet near login` (`NEAR_ENV=mainnet` for mainnet). This will store private keys inside the `~/.near-credentials/testnet` (or `/mainnet` for mainnet). If for some reason the data is not in those folders please manually copy the private key over from `~/.near-credentials/default` over to the desired network folder.


In the `config.json` Make sure if you are using NEAR to change the accountId (containing `{{YOUR_ACCOUNT_ID}}`) with your accountId that you just used to login with. Also if you want to deploy for mainnet make sure the `networkType` is set to mainnet and `rpc` is set to `https://rpc.testnet.near.org`.

In the `.env` file you just created change the `NEAR_CREDENTIALS_STORE_PATH` to the root of the `near-credentials` folder. (For example `/home/myname/.near-credentials/`).

Near does not require a new contract deployment for each pair. Each pair is generated automaticly when you push a new pair. See [Contract addresses for NEAR](#contract-addresses) 
Near is also the only one to support batching of transactions, making it cheaper for you to push data on chain. Please see [Batching](#batching)  

# EVM Setup

Change in the `config.json` the `chainId` and `rpc` to the desired EVM chain. Currently it's configured to use the Aurora EVM chain. 

Change in the `.env` the `EVM_PRIVATE_KEY` to your private key (Not a mnemonic but the key that starts with 0x)


### Running

To run:

```bash
npm run start
```

## Configuring `config.json`

|Key|Type|Description|
|---|---|---|
|networks|Network[]|An array of network configurations. (Explained below)
|pairs|Pair[]|An array of pricing pairs with the sources (Explained below)

### Network

Configuration for a specific network. Currently two types are supported. `evm` and `near`. You can use each network type multiple types to combine for example Avalanche, Polygon and Ethereum.

### options for every network

These options are available/required for every network

|Key|Type|Description|
|---|---|---|
|type|string|Lets the node know what the network type is. See docs below on which types are available.
|networkId|number|A custom ID that you fill in. This will be used to connect pairs to a specific network configuration. Can be anything you want to identify the configuration|
|rpc|string|The URL to the network's RPC|
|wssRpc|string/undefined|The URL to the websocket RPC, is required by some modules (not for price pushing)|
|blockFetchingInterval|number/undefined|Interval in ms on when to fetch the latest block, default is 5000ms|

### evm

|Key|Type|Description|
|---|---|---|
|type|"evm"|Lets the node know this is an EVM type chain|
|privateKeyEnvKey|string|The name of the env variable where the private key is stored. (can be set in the `.env` file)|
|chainId|number|The chain id of the EVM chain. (1 = Ethereum)|

Example:

```JSON
{
    "networks": [
        {
            "type": "evm",
            "networkId": 133,
            "privateKeyEnvKey": "EVM_PRIVATE_KEY",
            "chainId": 1313161554,
            "rpc": "https://testnet.aurora.dev"
        }
    ]
}
```

### near

#### accessing / generating NEAR private keys
There are multiple ways to go about this. The simplest method would be to create or sign in to, a NEAR account using the [near web wallet](https://wallet.near.org). And then calling `NEAR_ENV={NETWORK} near login` and following the steps provided by the CLI. This will generate access keys in `~/.near-credentials/{NETWORK}/{MY_ACCOUNT}.near.json` which can then be copied into any environment.
We would also recommend for you to check out batching of transactions, this makes pushing data on chain be done 1 transaction instead of multiple saving you gas. See [Batching](#batching) for more information.

#### configuration

|Key|Type|Description|
|---|---|---|
|type|"near"|Lets the node know this is an EVM type chain|
|credentialsStorePathEnvKey|string|The name of the env variable where the credentials are stored. Not required if you are using `privateKeyEnvKey`|
|privateKeyEnvKey|string|The name of the env variable where the private key is stored (can be set in the `.env` file). Not required if you are using `credentialsStorePathEnvKey`|
|networkType|string|Whether this network is "testnet" or "mainnet"|
|accountId|string|The accountId coupled with the privateKey/credentials|
|maxGas|string/undefined|The maximum amount of gas that should be used by a transaction. Default is 300Tgas|

Example:

```JSON
{
    "networks": [
        {
            "type": "near",
            "networkId": 122,
            "networkType": "testnet",
            "credentialsStorePathEnvKey": "NEAR_CREDENTIALS_STORE_PATH",
            "rpc": "https://rpc.testnet.near.org",
            "accountId": "franklinwaller2.testnet"
        }
    ]
}
```

# Modules

The first party oracle works in modules which allow for extendability of the node. This is configured in the `"modules"` section (root of the `config.json`)

```JSON
{
    "modules": [
        {
            // Module config here
        },
        {
            // Module config here
        }
    ],
}
```

## PushPairModule

Pushes data to a smart contract (for example price feeds)

|Key|Type|Description|
|---|---|---|
|type|"PushPairModule"| Used to identify what type of module this is|
|networkId|number|The id of the network in your `"networks"` configuration.|
|contractAddress|Which address to post the answers to. See below for addresses on NEAR (EVM requires a new contract deployment for each pair)|
|interval|number|Interval between updates in ms.|
|pairs|Pair[]|An array of Pairs, If the networkId is coupled to an EVM network this can only be 1 pair. NEAR allows for multiple pairs and batches them together in 1 transaction, we recommend a max of 20 pairs|


### contract addresses for NEAR
|Network|Contract address|
|---|---|
|testnet|fpo3.franklinwaller2.testnet|
|mainnet|fpo-v1.fluxoracle.near|

### Pairs

Pairs include information for a specific pair such as which sources to fetch from, how often and where to post them.

|Key|Type|Description|
|---|---|---|
|pair|string|Info about the pair. Should be something like "ETH / USD". This info will also be posted on chain depending on the network.|
|sources|Source[]|An array of sources. More on that below.|
|decimals|number|Amount of decimals the price has.|

### Source

Information containing where to fetch data. Uses the [jsonpath-rust](https://github.com/besok/jsonpath-rust) package for finding values using keys.

|Key|Type|Description|
|---|---|---|
|source_path|string|Path to the number value. Uses [jsonpath-rust](https://github.com/besok/jsonpath-rust) for finding values.|
|end_point|string|The URL to a JSON API|
|multiplier|string / undefined|The result value will be multiplied against this value. Can be useful to normalize decimals. Defaults to not being used.|
|http_method|string|HTTP Method (GET, POST, etc)|
|http_body|string|Body to sent along http request|
|http_headers| { [key: string]: string }| Key -> Value pair of headers to attach to the request|

Example:

```JSON
{
    "modules": [
        {
            "networkId": 122,
            "contractAddress": "fpo3.franklinwaller2.testnet",
            "pairs": [
                {
                    "pair": "ETH/USD_SOME_TEST",
                    "decimals": 6,
                    "sources": [
                        {
                            "source_path": "market_data.current_price.usd",
                            "end_point": "https://api.coingecko.com/api/v3/coins/ethereum"
                        }
                    ]
                }
            ],
            "interval": 60000,
            "type": "PushPairModule"
        }
    ]
}
```

## LayerZeroModule

The `LayerZeroModule` is only used by LayerZero, it allows for submitting block headers from one chain to another chain. For this module the `wssRpc` is required for EVM chains.

|Key|Type|Description|
|---|---|---|
|type|"PushPairModule"| Used to identify what type of module this is|
|networkId|number|The id of the network in your `"networks"` configuration. This is also the endpoint id defined by layerzero, so make sure they match|
|oracleContractAddress|string|The address of the LayerZero Oracle|

## BalanceCheckerModule

The `BalanceCheckerModule` is used for checking that account balances have more funds than a user-defined threshold. An error will be logged if an account has insufficient funds.


|Key|Type|Description|
|---|---|---|
|type|"BalanceCheckerModule"| Used to identify what type of module this is|
|networkId|number|The id of the network in your `"networks"` configuration|
|accounts|string[]|A list of account identifiers to be checked|
|threshold|string|The amount below which the check will print an error (big number including decimals) |
|interval|number|Interval between updates in ms|
