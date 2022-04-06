# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.1.0](https://github.com/fluxprotocol/fpo-node/compare/v1.0.0...v1.1.0) (2022-04-06)


### Features

* **balancechecker:** Add support for telegram stats and error messages ([c2b17ce](https://github.com/fluxprotocol/fpo-node/commit/c2b17ce529df237e3c223511305d95ee930d837c))
* **healthcheck:** Add healthcheck endpoint ([c3da10b](https://github.com/fluxprotocol/fpo-node/commit/c3da10b85e01d212d50b31ac6ad26bdcd1f10a95))

## 1.0.0 (2022-04-01)


### Features

* **evm:** Add network config in error logs ([9356ea1](https://github.com/fluxprotocol/fpo-node/commit/9356ea10467e147014a41bfaf1c144d4db9b7d6d))
* **init:** Initial FPO version ([683dca4](https://github.com/fluxprotocol/fpo-node/commit/683dca4fba47132a703cb8ae462b8b0a39353937))
* **jobs:** Add basic http fetch (no wasm) ([23df62c](https://github.com/fluxprotocol/fpo-node/commit/23df62cdeb014f613a5d0192865ddcab87849d33))
* **logger:** Use metadata for sentry fingerprint ([4fd704e](https://github.com/fluxprotocol/fpo-node/commit/4fd704e1b6c277f906cf4251f1db62192956d480))
* **logs:** Add node version to error logs ([dc649f8](https://github.com/fluxprotocol/fpo-node/commit/dc649f81fb3e367d86c6850d7b8a06364ca71512))
* **logs:** Add project version to all logs for identifying through Sentry ([92770c9](https://github.com/fluxprotocol/fpo-node/commit/92770c9ca347eb1cad27de3156dbb217ba96470b))
* **logs:** Add serverName for identifying node ([169f256](https://github.com/fluxprotocol/fpo-node/commit/169f256d4b275c9e6775f00ff1fa9441b5b53a83))
* **modules:** Add balance checker module ([9132ec3](https://github.com/fluxprotocol/fpo-node/commit/9132ec3bc1b70c95eaf5144773534f1de8e65911))
* **modules:** Add feed checker for EVM contracts ([888f71d](https://github.com/fluxprotocol/fpo-node/commit/888f71d0c234c1ed04f2ea4fc8fc8387cac1d3f6))
* **modules:** Add feed checker for NEAR contracts ([ada99a0](https://github.com/fluxprotocol/fpo-node/commit/ada99a047020637d41d21d3c1f6b75b7951fcaf1))
* **modules:** Add FeedCheckerModule skeleton ([17b6db1](https://github.com/fluxprotocol/fpo-node/commit/17b6db1df5ea3accfe3e142c4960689ecd71652b))
* **networks:** Add get balance ([7778966](https://github.com/fluxprotocol/fpo-node/commit/7778966cf37c46ac5c91dd287c3d5be8ca753b6b))
* **pairchecker:** Add option for notifying only errors ([b55a662](https://github.com/fluxprotocol/fpo-node/commit/b55a66253d8eeb47a74d4050abe71244555124b3))
* **pairchecker:** Add telegram notifications ([ed11e4c](https://github.com/fluxprotocol/fpo-node/commit/ed11e4cd63ccd86045f931fc8729403cadc39fe2))
* **pairchecker:** Catch errors while fetching last timestamp ([61105ce](https://github.com/fluxprotocol/fpo-node/commit/61105ce6e3466ce0d27100f0d21ff4476f0dc712))
* **pairchecker:** Improve telegram notifications ([076e02b](https://github.com/fluxprotocol/fpo-node/commit/076e02bc77b0bba89d9766c4364ea1e9164101e2))
* **pricepair:** Add batching together of prices for EVM chains ([038635e](https://github.com/fluxprotocol/fpo-node/commit/038635e83fb44e0e84ab359a3f970638dbfa9d78))
* **pushpair:** Set dynamic interval for NEAR and EVM factory feeds ([d405d7a](https://github.com/fluxprotocol/fpo-node/commit/d405d7a5fca7519135b49a7bdb7b48377fd51726))
* **pushpair:** Set dynamic interval for single EVM feeds ([1f037f8](https://github.com/fluxprotocol/fpo-node/commit/1f037f891b48ae0c1fa472f4740dfde5fda9044d))


### Bug Fixes

* **logs:** Fix issue where encoding metadata would crash ([2d8a84d](https://github.com/fluxprotocol/fpo-node/commit/2d8a84d849258eb93bdb235e2ce04d816971d3b7))
* **logs:** Fix issue where fingerprinting was done incorrectly ([6bfdcd8](https://github.com/fluxprotocol/fpo-node/commit/6bfdcd8c8b73fd55cea843af8b549ac9ec1872ab))
* **networks:** Move try/catch inside of for loop ([0f35aab](https://github.com/fluxprotocol/fpo-node/commit/0f35aab0aa5ac2b83988cc7cf311078b8daeef23))
* **queue:** Fix issue where queue could submit too soon causing incorrect nonce issues ([c7f2255](https://github.com/fluxprotocol/fpo-node/commit/c7f225572c215b1c8bf8f046c47b757922401f8c))
