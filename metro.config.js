const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('onnx');
// Generated bundles, traces and screenshots should never trigger Fast Refresh.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...['android', 'ios', 'artifacts', 'dist', 'test-report', 'test-results', 'training', 'data', '.tooling'].map(
    (directory) => new RegExp(`^${escapeRegex(path.join(__dirname, directory))}[/\\\\]`),
  ),
];
config.maxWorkers = 2;
module.exports = config;
