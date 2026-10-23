/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { replaceApp } from '../../darwin/install-app.ts';

for (const scenario of ['replace', 'first install', 'invalid copy', 'invalid installation', 'same path'] as const) {
	test(`app installer: ${scenario}`, { skip: process.platform !== 'darwin' }, () => {
		const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'es-code-install-test-')));
		try {
			const source = path.join(root, 'new.app');
			const destination = path.join(root, 'installed.app');
			fs.mkdirSync(source);
			fs.writeFileSync(path.join(source, 'current.txt'), 'new app');
			if (scenario !== 'first install') {
				fs.mkdirSync(destination);
				fs.writeFileSync(path.join(destination, 'obsolete.txt'), 'old app');
			}
			const verify = (appPath: string) => {
				assert.strictEqual(fs.readFileSync(path.join(appPath, 'current.txt'), 'utf8'), 'new app');
				if ((scenario === 'invalid copy' && appPath.includes('.es-code-install-')) || (scenario === 'invalid installation' && appPath === destination)) {
					throw new Error('Invalid replacement');
				}
			};
			if (scenario === 'same path') {
				assert.throws(() => replaceApp(source, source, verify), /must be separate/);
			} else if (scenario === 'invalid copy' || scenario === 'invalid installation') {
				assert.throws(() => replaceApp(source, destination, verify), /Invalid replacement/);
				assert.deepStrictEqual(fs.readdirSync(destination), ['obsolete.txt']);
			} else {
				replaceApp(source, destination, verify);
				assert.deepStrictEqual(fs.readdirSync(destination), ['current.txt']);
			}
			assert.deepStrictEqual({ source: fs.readFileSync(path.join(source, 'current.txt'), 'utf8'), temporaryCopies: fs.readdirSync(root).filter(name => name.startsWith('.es-code-install-')) }, {
				source: 'new app', temporaryCopies: []
			});
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
}
