#!/usr/bin/env sh
# sh fuzz_p2p.sh Fuzz Config Path: string

yarn build

node 'dist/test/fuzz/fuzz.js' p2p_fuzz_config.yaml