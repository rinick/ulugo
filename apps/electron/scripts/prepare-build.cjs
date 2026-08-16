const {existsSync, rmSync, statSync} = require('node:fs');
const {spawnSync} = require('node:child_process');
const path = require('node:path');

const workspaceDirectory = path.resolve(__dirname, '../../..');
const outputDirectory = path.join(__dirname, '..', 'dist');
const privateEntry = path.join(workspaceDirectory, 'packages/go-protocol/src/index.ts');
const privateTsconfig = path.join(workspaceDirectory, 'packages/go-protocol/tsconfig.electron.json');

rmSync(outputDirectory, {recursive: true, force: true});

if (!existsSync(privateEntry) || statSync(privateEntry).size === 0 || !existsSync(privateTsconfig)) process.exit(0);

const tsc = path.join(workspaceDirectory, 'node_modules/typescript/bin/tsc');
const result = spawnSync(process.execPath, [tsc, '-p', privateTsconfig], {stdio: 'inherit'});
if (result.error != null) throw result.error;
process.exit(result.status ?? 1);
