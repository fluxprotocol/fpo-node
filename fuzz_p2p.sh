#!/usr/bin/env sh
# sh fuzz_p2p.sh Fuzz Config Path: string
# WARNING: Please adjust stack size as necessary for number of nodes you configured.

yarn build

# node --max_old_space_size=16384 'dist/test/fuzz/fuzz.js' p2p_fuzz_config.yaml
node 'dist/test/fuzz/fuzz.js' p2p_fuzz_config.yaml