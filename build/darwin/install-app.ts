/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from 'util';
import product from '../../product.json' with { type: 'json' };

const repoRoot = path.resolve(import.meta.dirname, '../..');

/** Copy and verify the replacement before swapping bundles; restore the old app on failure. */
export function replaceApp(source: string, destination: string, verify: (appPath: string) => void): void {
	source = fs.realpathSync(source);
	destination = path.join(fs.realpathSync(path.dirname(destination)), path.basename(destination));
	if (source === destination || source.startsWith(destination + path.sep) || destination.startsWith(source + path.sep)) {
		throw new Error('The source and destination app bundles must be separate.');
	}
	if (fs.existsSync(destination) && (fs.lstatSync(destination).isSymbolicLink() || !fs.statSync(destination).isDirectory())) {
		throw new Error(`The destination is not an app directory: ${destination}`);
	}
	verify(source);
	const staging = fs.mkdtempSync(path.join(path.dirname(destination), '.es-code-install-'));
	const replacement = path.join(staging, path.basename(destination));
	const previous = path.join(staging, 'previous.app');
	let previousMoved = false;
	let replacementInstalled = false;
	let cleanup = true;
	try {
		execFileSync('/usr/bin/ditto', [source, replacement], { stdio: 'inherit' });
		verify(replacement);
		if (fs.existsSync(destination)) {
			fs.renameSync(destination, previous);
			previousMoved = true;
		}
		fs.renameSync(replacement, destination);
		replacementInstalled = true;
		verify(destination);
	} catch (error) {
		try {
			if (replacementInstalled) {
				fs.rmSync(destination, { recursive: true });
			}
			if (previousMoved) {
				fs.renameSync(previous, destination);
			}
		} catch (restoreError) {
			cleanup = false;
			throw new AggregateError([error, restoreError], `Installation and rollback failed. The previous app is preserved at ${previous}.`);
		}
		throw error;
	} finally {
		if (cleanup) {
			fs.rmSync(staging, { recursive: true, force: true });
		}
	}
}

/** Check the app identity, signature, and packaged workbench checksums. */
function verifyApp(appPath: string): void {
	const identifier = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(appPath, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
	if (identifier !== product.darwinBundleIdentifier) {
		throw new Error(`Expected an ${product.nameLong} app bundle: ${appPath}`);
	}
	execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
	const appRoot = path.join(appPath, 'Contents/Resources/app');
	const packagedProduct = JSON.parse(fs.readFileSync(path.join(appRoot, 'product.json'), 'utf8')) as { checksums?: Record<string, string> };
	if (!packagedProduct.checksums || !Object.keys(packagedProduct.checksums).length) {
		throw new Error(`The app has no packaged payload checksums: ${appPath}`);
	}
	for (const [file, expected] of Object.entries(packagedProduct.checksums)) {
		const actual = createHash('sha256').update(fs.readFileSync(path.join(appRoot, 'out', file))).digest('base64').replace(/=+$/, '');
		if (actual !== expected) {
			throw new Error(`Packaged payload checksum mismatch: ${file}`);
		}
	}
}

/** Refuse to replace a running installation, including its helper processes. */
function ensureAppStopped(destination: string): void {
	const commands = execFileSync('/bin/ps', ['-axww', '-o', 'comm='], { encoding: 'utf8' });
	if (commands.split('\n').some(command => command.trim().startsWith(destination + path.sep))) {
		throw new Error(`Quit ${product.nameLong}, then run this command from macOS Terminal.`);
	}
}

async function main(): Promise<void> {
	const { values } = parseArgs({ options: { from: { type: 'string' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
	if (values.help) {
		console.log('Usage: npm run install-app -- [--from /path/to/ES Code.app] [--dry-run]\n\nBuilds the current checkout, signs it, replaces the Applications bundle, and reopens it.\n--from installs an existing signed package instead of rebuilding.\n--dry-run prints the plan without building or installing.\nQuit ES Code before running this command from macOS Terminal. No permanent backup is kept.');
		return;
	}
	if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) {
		throw new Error('Installing the app is supported on macOS arm64 and x64.');
	}
	const buildRoot = path.resolve(repoRoot, process.env.VSCODE_BUILD_ROOT || '.build/install-app');
	const source = values.from ? path.resolve(values.from) : path.join(buildRoot, `VSCode-darwin-${process.arch}`, `${product.nameLong}.app`);
	const destination = path.join('/Applications', `${product.nameLong}.app`);
	const task = `vscode-darwin-${process.arch}-min`;
	if (values['dry-run']) {
		if (values.from) {
			verifyApp(source);
		}
		console.log(values.from ? `Use existing package: ${source}` : `Build: npm run gulp -- ${task}\nBuild output: ${source}`);
		console.log(`Verify, replace, and reopen: ${destination}\nNo permanent backup. Settings and extensions stay in their existing locations.`);
		return;
	}
	ensureAppStopped(destination);
	if (!values.from) {
		execFileSync(process.execPath, ['--experimental-strip-types', '--max-old-space-size=8192', path.join(repoRoot, 'node_modules/gulp/bin/gulp.js'), task], {
			cwd: repoRoot,
			env: { ...process.env, VSCODE_BUILD_ROOT: buildRoot },
			stdio: 'inherit'
		});
		execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', source], { stdio: 'inherit' });
	}
	ensureAppStopped(destination);
	console.log(`Installing ${source} to ${destination}`);
	replaceApp(source, destination, verifyApp);
	console.log('Installed and verified. The previous app has been removed.');
	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	delete env.GIT_CONFIG_COUNT;
	delete env.GIT_CONFIG_PARAMETERS;
	execFileSync('/usr/bin/open', [destination], { env, stdio: 'inherit' });
}

if (import.meta.main) {
	main().catch(error => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
