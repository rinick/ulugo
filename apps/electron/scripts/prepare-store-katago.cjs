const fs = require('node:fs/promises');
const {createReadStream, createWriteStream} = require('node:fs');
const {createHash} = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const {Readable} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const manifest = require('../store-katago.json');

const bundleDirectory = path.resolve(__dirname, '../resources/store-katago');
const cacheDirectory = process.env.ULUGO_KATAGO_CACHE || path.join(os.homedir(), '.ulugo');

// electron-builder runs this hook only for the Store configuration.
module.exports = async function prepareStoreKataGo() {
  await fs.mkdir(bundleDirectory, {recursive: true});
  for (const [kind, asset] of Object.entries(manifest)) {
    const fileName = path.basename(new URL(asset.url).pathname);
    const destination = path.join(bundleDirectory, fileName);
    if (await exists(destination)) {
      await verify(destination, asset.sha256);
      console.log(`Using bundled ${fileName}`);
      continue;
    }

    const cached =
      kind === 'model'
        ? path.join(cacheDirectory, 'models', fileName)
        : path.join(cacheDirectory, 'katago', asset.id, fileName);
    const partial = `${destination}.part`;
    try {
      if (await exists(cached)) {
        console.log(`Copying ${cached}`);
        await fs.copyFile(cached, partial);
      } else {
        console.log(`Downloading ${asset.url}`);
        const response = await fetch(asset.url, {signal: AbortSignal.timeout(30 * 60 * 1000)});
        if (!response.ok || response.body == null) {
          throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }
        await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
      }
      await verify(partial, asset.sha256);
      await fs.rename(partial, destination);
    } catch (error) {
      await fs.rm(partial, {force: true});
      throw new Error(`Could not prepare Store asset ${fileName}: ${error.message}`, {cause: error});
    }
  }
};

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function verify(file, expectedHash) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== expectedHash) {
    throw new Error(`SHA-256 mismatch: ${file}. Remove or replace this file before packaging again.`);
  }
}
