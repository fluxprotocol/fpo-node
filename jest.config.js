const { jsWithTs: tsjPreset } = require('ts-jest/presets');

module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleDirectories: [
        'src',
        'node_modules'
    ],
    transform: {
        ...tsjPreset.transform,
    },
    testPathIgnorePatterns: [
        'dist',
    ],
};
