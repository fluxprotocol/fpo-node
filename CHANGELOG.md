# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.3.1](https://github.com/fluxprotocol/fpo-node/compare/v1.3.0...v1.3.1) (2022-06-01)


### Bug Fixes

* **fetchjob:** Fix big integer precision loss ([6e685dc](https://github.com/fluxprotocol/fpo-node/commit/6e685dc294eba730cfadedec70f3af3710e1d5c2))

## [1.3.0](https://github.com/fluxprotocol/fpo-node/compare/v1.2.1...v1.3.0) (2022-05-20)


### Features

* **pairCheckerDeviation:** Add support for checking price updates with deviation pushing enabled ([263d2d1](https://github.com/fluxprotocol/fpo-node/commit/263d2d1fba0c9555b1835f29a317a7d14bee8538))
* **pushpair:** Add support for deviation percentages before pushing ([96d8482](https://github.com/fluxprotocol/fpo-node/commit/96d84821378c8336e83d4f932b13fd3c561b0a06))


### Bug Fixes

* **big:** Fix issue where Big.js would use scientific notation instead of writing out the full number ([07afe7e](https://github.com/fluxprotocol/fpo-node/commit/07afe7eaecbccad810f6792dc7b322994f3bcd68))
* **pairchecker:** Fix issue where stale or undefined prices where being used for checking against ([9674055](https://github.com/fluxprotocol/fpo-node/commit/967405579d871de6671f09968f29d10d65e84252))
* **pairDeviationChecker:** Send telegram msg with markdown ([06a70e6](https://github.com/fluxprotocol/fpo-node/commit/06a70e62f921ed78e2e78da12f0440c759788b6a))
* **pushpair:** Fetch Last Update now returns oldest pair update ([1c82253](https://github.com/fluxprotocol/fpo-node/commit/1c8225346398eede95d5a8ddf3c7e61c6aa1af11))
* **pushPair:** Fix issue where on NEAR a division by zero would occur on new pairs ([5e030e7](https://github.com/fluxprotocol/fpo-node/commit/5e030e7b00ec249405827b727db014f90ca1170e))
* **pushpair:** Fix issue where some non-volatile pairs would never get updated due wrong checked timestamps ([2c4d787](https://github.com/fluxprotocol/fpo-node/commit/2c4d787d46e6cb0efbc05d3e1aa5e5e8fd8b0ae4))

### [1.2.1](https://github.com/fluxprotocol/fpo-node/compare/v1.2.0...v1.2.1) (2022-05-05)


### Bug Fixes

* **telegram:** Fix issue where a telegram http error could silently crash the node ([96eef48](https://github.com/fluxprotocol/fpo-node/commit/96eef4833a8c79bb90a57adab73ef22dc6286a6c))

## [1.2.0](https://github.com/fluxprotocol/fpo-node/compare/v1.1.0...v1.2.0) (2022-04-19)


### Features

* **fetchjob:** Implement retrying of fetching sources ([3a7d9d5](https://github.com/fluxprotocol/fpo-node/commit/3a7d9d5a2a05b79fa743608006a405f5168aade0))
* **pushpair:** Add support to Factory contract v2 ([f9c5437](https://github.com/fluxprotocol/fpo-node/commit/f9c543750b4fb369bd0833c7682403a6d45f8c46))


### Bug Fixes

* **pairchecker:** Send notification update after fetch error ([b870d84](https://github.com/fluxprotocol/fpo-node/commit/b870d849e339025b3f4114d0df3bd75d3b98c063))
* **tests:** Fix issue where circular dependencies would make tests not run ([58fe77c](https://github.com/fluxprotocol/fpo-node/commit/58fe77c1f6db2a8bde183ea98538740f1435be4d))

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
