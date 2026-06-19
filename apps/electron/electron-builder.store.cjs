const {build} = require('./package.json');
const identity = require('./store-identity.json');

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
    identityName: identity.name,
    publisher: identity.publisher,
    publisherDisplayName: identity.publisherDisplayName,
    languages: ['en-US', 'zh-CN', 'ja-JP', 'ko-KR', 'fr-FR', 'de-DE', 'ru-RU'],
  },
};
