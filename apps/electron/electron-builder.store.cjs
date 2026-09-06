const {build} = require('./package.json');
const identity = require('./store-identity.json');
const bundledKataGo = require('./store-katago.json');

module.exports = {
  ...build,
  beforePack: require('./scripts/prepare-store-katago.cjs'),
  extraResources: [
    ...build.extraResources,
    {
      from: 'resources/store-katago',
      to: 'bundled-katago',
      filter: Object.values(bundledKataGo).map((asset) => new URL(asset.url).pathname.split('/').pop()),
    },
    {from: 'store-katago.json', to: 'bundled-katago/manifest.json'},
  ],
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
    minVersion: '10.0.17763.0',
    languages: ['en-US', 'zh-CN', 'ja-JP', 'ko-KR', 'fr-FR', 'de-DE', 'ru-RU'],
  },
};
