# sh test-integration.sh NODE_INDEX (0, 1, 2)

yarn build

# node 'dist/test/integration/p2p/communication.js' 0
# node 'dist/test/integration/p2p/communication.js' 1

node 'dist/test/integration/p2p/communication.js' $1