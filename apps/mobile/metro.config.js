const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// Let Metro know where to resolve packages in monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Don't disable hierarchical lookup - pnpm needs it
config.resolver.disableHierarchicalLookup = false;

// Ensure we can resolve workspace packages
config.resolver.extraNodeModules = {
  '@pick-rivals/shared-types': path.resolve(monorepoRoot, 'packages/shared-types'),
};

module.exports = config;
