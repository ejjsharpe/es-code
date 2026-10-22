/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { generateKeyPairSync, sign } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VSBuffer, bufferToStream } from '../../../../base/common/buffer.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { zip } from '../../../../base/node/zip.js';
import { TargetPlatform } from '../../../extensions/common/extensions.js';
import { IRequestService } from '../../../request/common/request.js';
import { IGalleryExtension } from '../../common/extensionManagement.js';
import { getOpenVSXMetadataUrl, validateOpenVSXMetadata, verifyOpenVSXSignature } from '../../node/openVSXSignatureVerification.js';

const origin = 'https://open-vsx.org';
const version = '2.1.308';
const publicKeyUrl = `${origin}/api/-/public-key/14ccb407-4e79-41ed-be5a-6d608325c45a`;

function extension(target: TargetPlatform = TargetPlatform.DARWIN_ARM64): IGalleryExtension {
	const query = target === TargetPlatform.UNDEFINED ? '' : `?targetPlatform=${target}`;
	const asset = `${origin}/vscode/asset/Anthropic/claude-code/${version}`;
	return {
		identifier: { id: 'anthropic.claude-code', uuid: 'test' },
		publisher: 'Anthropic', name: 'claude-code', version,
		properties: { targetPlatform: target },
		assets: {
			download: { uri: `${asset}/Microsoft.VisualStudio.Services.VSIXPackage${query}`, fallbackUri: `${asset}/Microsoft.VisualStudio.Services.VSIXPackage${query}` },
			signature: { uri: `${asset}/Microsoft.VisualStudio.Services.VsixSignature${query}`, fallbackUri: `${asset}/Microsoft.VisualStudio.Services.VsixSignature${query}` }
		}
	} as IGalleryExtension;
}

function metadata(target = 'darwin-arm64') {
	const targetSegment = target === 'universal' ? '' : `${target}/`;
	const suffix = target === 'universal' ? '' : `@${target}`;
	const base = `${origin}/api/Anthropic/claude-code/${targetSegment}${version}/file/Anthropic.claude-code-${version}${suffix}`;
	return {
		namespace: 'Anthropic', name: 'claude-code', version, targetPlatform: target,
		files: { download: `${base}.vsix`, signature: `${base}.sigzip`, publicKey: publicKeyUrl }
	};
}

function requestService(doc: object, publicKey: string, requested: IRequestOptions[]): IRequestService {
	return {
		async request(options: IRequestOptions) {
			requested.push(options);
			const body = options.url === publicKeyUrl ? publicKey : JSON.stringify(doc);
			return { res: { statusCode: 200 }, stream: bufferToStream(VSBuffer.fromString(body)) } as IRequestContext;
		}
	} as unknown as IRequestService;
}

suite('Open VSX signature verification', () => {
	let directory: string;
	let vsixPath: string;
	let signaturePath: string;
	let publicKey: string;
	let requests: IRequestOptions[];

	setup(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), 'es-code-openvsx-signature-'));
		vsixPath = path.join(directory, 'extension.vsix');
		signaturePath = path.join(directory, 'extension.sigzip');
		await zip(vsixPath, [{ path: 'extension/package.json', contents: JSON.stringify({ publisher: 'Anthropic', name: 'claude-code', version }) }]);
		const keys = generateKeyPairSync('ed25519');
		publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
		const signature = sign(null, await fs.readFile(vsixPath), keys.privateKey);
		await zip(signaturePath, [{ path: '.signature.sig', contents: signature }, { path: '.signature.p7s', contents: Buffer.alloc(0) }]);
		requests = [];
	});

	teardown(async () => {
		await fs.rm(directory, { recursive: true, force: true });
	});

	test('verifies the exact VSIX bytes with the registry key', async () => {
		assert.strictEqual(await verifyOpenVSXSignature(extension(), vsixPath, signaturePath, requestService(metadata(), publicKey, requests)), true);
		assert.deepStrictEqual(requests.map(request => request.url), [getOpenVSXMetadataUrl(extension()), publicKeyUrl]);
		assert.ok(requests.every(request => request.followRedirects === 0));
	});

	test('rejects a changed VSIX after it was signed', async () => {
		await fs.appendFile(vsixPath, 'changed');
		assert.strictEqual(await verifyOpenVSXSignature(extension(), vsixPath, signaturePath, requestService(metadata(), publicKey, requests)), false);
	});

	test('rejects metadata for a different target or extension', () => {
		assert.throws(() => validateOpenVSXMetadata(metadata('linux-x64'), extension()));
		assert.throws(() => validateOpenVSXMetadata({ ...metadata(), name: 'other' }, extension()));
		assert.throws(() => validateOpenVSXMetadata({ ...metadata(), files: { ...metadata().files, publicKey: 'https://example.org/key' } }, extension()));
	});

	test('rejects a gallery asset outside the expected registry path', () => {
		const otherOrigin = extension();
		otherOrigin.assets.signature!.uri = otherOrigin.assets.signature!.uri.replace(origin, 'https://example.org');
		assert.throws(() => getOpenVSXMetadataUrl(otherOrigin), /origin or path/);
		const duplicateTarget = extension();
		duplicateTarget.assets.signature!.uri += '&targetPlatform=linux-x64';
		assert.throws(() => getOpenVSXMetadataUrl(duplicateTarget), /query parameters/);
	});

	test('uses the universal metadata path only for a universal package', () => {
		const universal = extension(TargetPlatform.UNDEFINED);
		assert.strictEqual(getOpenVSXMetadataUrl(universal), `${origin}/api/Anthropic/claude-code/universal/${version}`);
		assert.strictEqual(validateOpenVSXMetadata(metadata('universal'), universal), publicKeyUrl);
	});

	test('rejects a package whose manifest identifies another extension', async () => {
		await zip(vsixPath, [{ path: 'extension/package.json', contents: JSON.stringify({ publisher: 'Other', name: 'claude-code', version }) }]);
		await assert.rejects(verifyOpenVSXSignature(extension(), vsixPath, signaturePath, requestService(metadata(), publicKey, requests)), /package identity/);
	});

	test('rejects a public-key redirect', async () => {
		const service = {
			async request(options: IRequestOptions) {
				requests.push(options);
				if (options.url === publicKeyUrl) {
					return { res: { statusCode: 302, headers: { location: 'https://example.org/key' } }, stream: bufferToStream(VSBuffer.fromString('')) } as IRequestContext;
				}
				return { res: { statusCode: 200 }, stream: bufferToStream(VSBuffer.fromString(JSON.stringify(metadata()))) } as IRequestContext;
			}
		} as unknown as IRequestService;
		await assert.rejects(verifyOpenVSXSignature(extension(), vsixPath, signaturePath, service), /returned 302/);
	});
});
