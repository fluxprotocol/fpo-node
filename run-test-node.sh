#!/usr/bin/env sh
# sh run-test-node NODE_INDEX (0, 1, 2)

yarn build

node 'dist/test/integration/p2p/communication.js' $1