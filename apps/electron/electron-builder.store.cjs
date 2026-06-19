const fs = require('node:fs');
const path = require('node:path');
const {build} = require('./package.json');

const identity = fs.readFileSync(path.resolve(__dirname, '../../identity.txt'), 'utf8');

function identityValue(name) {
  const line = identity.split(/\r?\n/).find((item) => item.trimStart().startsWith(name));
  if (line == null) throw new Error(`Missing ${name} in identity.txt`);
  return line.trimStart().slice(name.length).trim();
}

module.exports = {
  ...build,
  directories: {
    ...build.directories,
    buildResources: 'resources',
  },
  appx: {
    artifactName: 'ulugo-${version}-windows-${arch}.${ext}',
    applicationId: 'Ulugo',
    backgroundColor: '#f4b458',
    displayName: 'Ulugo',
    identityName: identityValue('Package/Identity/Name'),
    publisher: identityValue('Package/Identity/Publisher'),
    publisherDisplayName: identityValue('Package/Properties/PublisherDisplayName'),
    languages: ['en-US', 'zh-CN', 'ja-JP', 'ko-KR', 'fr-FR', 'de-DE', 'ru-RU'],
  },
};
