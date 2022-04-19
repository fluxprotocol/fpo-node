# Flux data feed deployment (EVM  networks)

## 1. Smart contracts

Checkout and install [`fpo-evm`][fpo-evm] smart contracts:

```bash
$ git clone git@github.com:fluxprotocol/fpo-evm.git
$ cd fpo-evm
$ yarn
$ yarn compile
```

Configure the environment variables required to deploy the smart contracts:

- `INFURA_API_KEY`, to send transactions to the network
- `MNEMONIC`, to sign the transactions (by default the validator address will be set to the one used here),
- `ETHERSCAN_API_KEY`, to verify the deployed smart contracts

Those variables can be defined in the file `.env` or directly in the CLI:

```env
INFURA_API_KEY=
MNEMONIC=
ETHERSCAN_API_KEY=
```

Deploy FluxPriceFeedFactory smart contract to the specified network by using the flag `--network`:

```bash
$ npx hardhat deploy:FluxPriceFeedFactory --network aurora-testnet

validator =  0x0A0a0cC87A87f2f00697e303d110821eB7E5e595
FluxPriceFeedFactory deployed to:  0x4041345E2900D83a7498b94743292606E7564B0A
```

### Alternative: deploy single price feed contracts

Alternatively, "single" price feeds can be deployed instead of the factory contract. In this case, the `--decimals` and
price feed `description` should be provided:

```bash
$ npx hardhat deploy:FluxPriceFeed --decimals 8 --description "ETH/USD" --network aurora-testnet

FluxPriceFeed deployed to:  0xFC92AA30458f54fC8d6695D089E19bD0ab5a4b19
```

In case the validator address should be different from the one used for deploying the contracts, the `--validator`
flag could be used. For example:

```bash
$ npx hardhat deploy:FluxPriceFeedFactory --validator 0x0A0a0cC87A87f2f00697e303d110821eB7E5e595 --network aurora-testnet

validator =  0x0A0a0cC87A87f2f00697e303d110821eB7E5e595
FluxPriceFeedFactory deployed to:  0x4018fb3d026fb376a99fE56ad6C25f0819263ee1
```

### Contract verification

It is recommended to verify the deployed smart contracts.

`FluxPriceFeed` contract verification:

```bash
$ npx hardhat verify 0x0435465F09362ed1D1994Bb9E76b56B22D640067 0x0A0a0cC87A87f2f00697e303d110821eB7E5e595 8 "ETH/USD" --network goerli

Nothing to compile
No need to generate any newer typings.
Compiling 1 file with 0.8.12
Successfully submitted source code for contract
contracts/FluxPriceFeed.sol:FluxPriceFeed at 0x0435465F09362ed1D1994Bb9E76b56B22D640067
for verification on the block explorer. Waiting for verification result...

Successfully verified contract FluxPriceFeed on Etherscan.
https://goerli.etherscan.io/address/0x0435465F09362ed1D1994Bb9E76b56B22D640067#code
```

Unfortunately, `FluxPriceFeedFactory` contract verification does not work at the moment:

```bash
$ npx hardhat verify 0x6dD4Fe82d43D6e671EA1bEE59a94E74a718E3684 0x0A0a0cC87A87f2f00697e303d110821eB7E5e595 --network goerli
```

However, all `FluxPriceFeed` contracts automatically deployed by the factory contract can be verified. To retrieve
the `FluxPriceFeed` address from the factory contract, the following hardhat task can be used:

```bash
$ npx hardhat fetchFactoryPricePairAddress --contract 0x6dD4Fe82d43D6e671EA1bEE59a94E74a718E3684 --pricepairs "Price-ETH/USD-8" --network goerli

Oracles Addresses:  [ '0x054aB0455cD1865cBC5fC470e76E872F8DF8E881' ]
```

NOTE: On Aurora, the contracts by the factory seem not to have a bytecode in the Aurora explorer, which makes impossible
their verification.

## 2. FPO node

The recommended approach to run a [`fpo-node`][fpo-node] is with Docker containers.

Before running the container, some configurations are required:

1. environment variables
2. JSON config file

Define the environment variables by, for example, modifying the file `.env.example` and copying it to `.env`:

```env
DEBUG=true

EVM_PRIVATE_KEY={COPY PRIVATE KEY HERE}

NEAR_ENV=testnet
NEAR_NO_LOGS=true
NEAR_CREDENTIALS_STORE_PATH=/home/{COPY USERNAME HERE OR MODIFY PATH}/.near-credentials/

ENABLE_ANALYTICS=true
SENTRY_DSN={COPY SENTRY DSN HERE}
```

Define the application modules configuration with a JSON file, e.g. `config.json`:

```json
{
  "networks": [
    {
      "type": "evm",
      "networkId": 133,
      "privateKeyEnvKey": "EVM_PRIVATE_KEY",
      "chainId": 1313161554,
      "rpc": "https://testnet.aurora.dev/API-KEY"
    }
  ],
  "modules": [
    {
      "type": "PushPairModule",
      "networkId": 133,
      "contractAddress": "0x522ca545c2A51E6A0f401B67485d7Ca9f6F1c563",
      "pairsType": "factory",
      "pairs": [
        {
          "pair": "ETH/USD",
          "decimals": 8,
          "sources": [
            {
              "source_path": "market_data.current_price.usd",
              "end_point": "https://api.coingecko.com/api/v3/coins/ethereum"
            }
          ]
        }
      ],
      "interval": 300000
    }
  ]
}
```

Additional information about the configuration is available at the `README` of the [`fpo-node` repository][fpo-node].

Run the Docker container taking into account the path of the `.env` and `config.json` files:

```bash
$ docker run -d \
    --name fpo-node \
    --env-file $PWD/.env \
    --volume $PWD/config.json:/usr/src/app/config.json \
    --volume ~/.near-credentials:/usr/src/app/.near-credentials \
    --restart always \
    fluxprotocol/fpo-node
```

Alternatively, the Docker container can be executed with `docker-compose`.

Example of `docker-compose.yaml` file using the `.env` environment variables:

```yaml
version: "3"

services:
  fpo-node:
    image: fluxprotocol/fpo-node
    environment:
      - DEBUG=${DEBUG}
      - ENABLE_ANALYTICS=${ENABLE_ANALYTICS}
      - EVM_PRIVATE_KEY=${EVM_PRIVATE_KEY}
      - NEAR_CREDENTIALS_STORE_PATH=/usr/src/app/.near-credentials
      - NEAR_ENV=${NEAR_ENV}
      - NEAR_NO_LOGS=${NEAR_NO_LOGS}
      - NEAR_PRIVATE_KEY=${NEAR_PRIVATE_KEY}
      - NODE_ID=${NODE_ID}
      - SENTRY_DSN=${SENTRY_DSN}
      - ENABLE_TELEGRAM_NOTIFICATIONS=${ENABLE_TELEGRAM_NOTIFICATIONS}
      - TELEGRAM_ALERTS_CHAT_ID=${TELEGRAM_ALERTS_CHAT_ID}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - TELEGRAM_STATS_CHAT_ID=${TELEGRAM_STATS_CHAT_ID}
    volumes:
      - ./config.json:/usr/src/app/config.json
      - ~/.near-credentials/:/usr/src/app/.near-credentials
```

To run the docker-compose service:

```bash
$ docker-compose up -d
```

### Alternative: run from source code

Alternatively, a `fpo-node` can be run directly from the source code.


Install the code repository:

```bash
git clone https://github.com/fluxprotocol/fpo-node
cd fpo-node
yarn
```

Before starting running the `fpo-node` make sure that all required configurations are properly defined, i.e. environment
variables and the JSON config file.

Run the `fpo-node`:
```bash
yarn start
```


[fpo-node]: https://github.com/fluxprotocol/fpo-node
[fpo-evm]: https://github.com/fluxprotocol/fpo-evm
