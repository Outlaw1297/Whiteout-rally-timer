const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "../packages/shared");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Non-workspace layout: allow Metro to watch/resolve @whiteout/shared outside mobile/.
// Do NOT set disableHierarchicalLookup — that breaks nested deps like expo-asset
// (shipped under node_modules/expo/node_modules) and fails EAS "Bundle JavaScript".
config.watchFolders = [...(config.watchFolders || []), sharedRoot];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "@whiteout/shared": sharedRoot,
};

module.exports = config;
