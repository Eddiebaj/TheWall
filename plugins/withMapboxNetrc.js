const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = function withMapboxNetrc(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const token = process.env.MAPBOX_DOWNLOADS_TOKEN;
      if (token) {
        const netrcPath = path.join(os.homedir(), '.netrc');
        const entry = `machine api.mapbox.com\n  login mapbox\n  password ${token}\n`;
        fs.appendFileSync(netrcPath, entry);
        fs.chmodSync(netrcPath, '600');
      }
      return config;
    },
  ]);
};
