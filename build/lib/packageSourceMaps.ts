/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Generated maps are retained in out-* and .build, but excluded from app payloads. */
export const generatedSourceMapExclusionGlob = '!**/*.{js,css,mjs,cjs,ts,mts,cts}.map';

/** Packaged source files whose local source-map references should be removed with the maps. */
export function hasPackagedSourceMapReference(filePath: string): boolean {
	return /\.(?:js|css|mjs|cjs|ts|mts|cts)$/.test(filePath);
}

/** Remove only trailing JavaScript/CSS source map comments from packaged files. */
export function stripPackagedSourceMapReferences(contents: string): string {
	return contents
		.replace(/(?:^|\n)[ \t]*\/\/# sourceMappingURL=[^\r\n]*(?=\r?$)/gm, '')
		.replace(/(?:^|\n)[ \t]*\/\*# sourceMappingURL=[^*\r\n]*\*\/[ \t]*(?=\r?$)/gm, '');
}
