const fs = require('node:fs');
const path = require('node:path');
const {version} = require('../package.json');

const releaseDirectory = path.resolve(__dirname, '../../../release');
const appxPath = path.join(releaseDirectory, `ulugo-${version}-windows-x64.appx`);
const msixPath = path.join(releaseDirectory, `ulugo-${version}-windows-x64.msix`);

fs.rmSync(msixPath, {force: true});
fs.renameSync(appxPath, msixPath);
console.log(`Microsoft Store package: ${msixPath}`);
