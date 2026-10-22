/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { test } from 'node:test';
import minimatch from 'minimatch';
import { generatedSourceMapExclusionGlob, hasPackagedSourceMapReference, stripPackagedSourceMapReferences } from '../packageSourceMaps.ts';

test('release map exclusion covers generated source-map formats', () => {
	const pattern = generatedSourceMapExclusionGlob.slice(1);
	assert.deepStrictEqual(['out/app.js.map', 'extensions/theme.css.map', 'node_modules/cli.mjs.map', 'node_modules/types.d.ts.map', 'node_modules/config.mts.map', 'out/app.js', 'licenses/LICENSE'].map(path => minimatch(path, pattern)), [true, true, true, true, true, false, false]);
});

test('packaged source-map references cover module and declaration formats', () => {
	assert.deepStrictEqual(['app.js', 'theme.css', 'cli.mjs', 'worker.cjs', 'types.d.ts', 'types.d.mts', 'types.d.cts', 'asset.svg'].map(hasPackagedSourceMapReference), [true, true, true, true, true, true, true, false]);
});

test('packaged JavaScript and CSS omit local map references while retaining code and notices', () => {
	assert.strictEqual(stripPackagedSourceMapReferences('/*! License */\nconst value = 1;\n//# sourceMappingURL=app.js.map\n'), '/*! License */\nconst value = 1;\n');
	assert.strictEqual(stripPackagedSourceMapReferences('/*! License */\nbody{color:red}\n/*# sourceMappingURL=app.css.map */\n'), '/*! License */\nbody{color:red}\n');
	assert.strictEqual(stripPackagedSourceMapReferences('const text = "//# sourceMappingURL=literal";'), 'const text = "//# sourceMappingURL=literal";');
});
