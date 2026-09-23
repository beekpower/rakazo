const { withAndroidManifest } = require("expo/config-plugins");

// Self-hosted build: the server is plain http on a WireGuard address
// (http://10.0.0.2:5173). Android blocks cleartext in release builds unless
// the application opts in. lib/endpoint.ts still refuses http:// for public
// hosts, so this only widens what the OS allows, not what the app will use.
module.exports = function withCleartextLan(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults.manifest.application[0].$["android:usesCleartextTraffic"] = "true";
    return config;
  });
};
