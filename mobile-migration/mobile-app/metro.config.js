// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Enable package.json "exports" field resolution (needed by jspdf and others)
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
  "browser",
  "require",
  "react-native",
];

// Force jspdf to always resolve to its browser (ES) build,
// even inside the SSR / node render bundle where Metro would
// otherwise pick the "node" export which contains AMD require()
// calls that Metro cannot transform.
const origResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "jspdf") {
    return {
      type: "sourceFile",
      filePath: path.resolve(
        __dirname,
        "node_modules",
        "jspdf",
        "dist",
        "jspdf.es.min.js",
      ),
    };
  }
  if (origResolveRequest) {
    return origResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
