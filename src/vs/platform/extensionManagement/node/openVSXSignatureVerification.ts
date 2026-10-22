/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createPublicKey, verify } from 'crypto';
import { promises as fs } from 'fs';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { buffer } from '../../../base/node/zip.js';
import { IGalleryExtension } from '../common/extensionManagement.js';
import { IRequestService, readBoundedResponse } from '../../request/common/request.js';
import { getManifest } from './extensionManagementUtil.js';
import { TargetPlatform } from '../../extensions/common/extensions.js';

export const OPEN_VSX_GALLERY_URL = 'https://open-vsx.org/vscode/gallery';
const OPEN_VSX_ORIGIN = 'https://open-vsx.org';
const MAX_VSIX_BYTES = 512 * 1024 * 1024;

interface IOpenVSXMetadata {
	readonly namespace?: string;
	readonly name?: string;
	readonly version?: string;
	readonly targetPlatform?: string;
	readonly files?: {
		readonly download?: string;
		readonly signature?: string;
		readonly publicKey?: string;
	};
}

function checkUrl(value: string, path: string, allowedParameters: readonly string[] = []): URL {
	const url = new URL(value);
	if (url.origin !== OPEN_VSX_ORIGIN || url.username || url.password || url.hash || url.pathname !== path) {
		throw new Error('Open VSX signature asset has an unexpected origin or path');
	}
	const parameters = [...url.searchParams.keys()];
	if (parameters.some(key => !allowedParameters.includes(key)) || new Set(parameters).size !== parameters.length) {
		throw new Error('Open VSX signature asset has unexpected query parameters');
	}
	return url;
}

function checkGalleryAsset(value: string, extension: IGalleryExtension, assetType: string, target: string): void {
	const path = `/vscode/asset/${encodeURIComponent(extension.publisher)}/${encodeURIComponent(extension.name)}/${encodeURIComponent(extension.version)}/${assetType}`;
	const url = checkUrl(value, path, assetType === 'Microsoft.VisualStudio.Services.VSIXPackage' ? ['redirect', 'targetPlatform'] : ['targetPlatform']);
	if (url.searchParams.has('redirect') && url.searchParams.get('redirect') !== 'true') {
		throw new Error('Open VSX signature asset has an unexpected redirect parameter');
	}
	const requestedTarget = url.searchParams.get('targetPlatform');
	if ((target === 'universal' && requestedTarget !== null && requestedTarget !== 'universal') || (target !== 'universal' && requestedTarget !== target)) {
		throw new Error('Open VSX signature asset target platform does not match the extension');
	}
}

function checkMetadataAsset(value: string | undefined, path: string): void {
	if (!value) {
		throw new Error('Open VSX signature metadata is missing an asset');
	}
	checkUrl(value, path);
}

export function getOpenVSXMetadataUrl(extension: IGalleryExtension): string {
	const target = extension.properties.targetPlatform;
	if (!target || target === TargetPlatform.UNKNOWN) {
		throw new Error('Open VSX extension has an unknown target platform');
	}
	if (extension.identifier.id.toLowerCase() !== `${extension.publisher}.${extension.name}`.toLowerCase()) {
		throw new Error('Open VSX extension identity does not match its gallery identifier');
	}
	const universal = target === TargetPlatform.UNIVERSAL || target === TargetPlatform.UNDEFINED;
	const platform = universal ? 'universal' : target;
	for (const asset of [extension.assets.download.uri, extension.assets.download.fallbackUri]) {
		checkGalleryAsset(asset, extension, 'Microsoft.VisualStudio.Services.VSIXPackage', platform);
	}
	if (!extension.assets.signature) {
		throw new Error('Open VSX extension has no signature asset');
	}
	for (const asset of [extension.assets.signature.uri, extension.assets.signature.fallbackUri]) {
		checkGalleryAsset(asset, extension, 'Microsoft.VisualStudio.Services.VsixSignature', platform);
	}
	const base = `/api/${encodeURIComponent(extension.publisher)}/${encodeURIComponent(extension.name)}`;
	return `${OPEN_VSX_ORIGIN}${base}/${encodeURIComponent(platform)}/${encodeURIComponent(extension.version)}`;
}

export function validateOpenVSXMetadata(metadata: IOpenVSXMetadata, extension: IGalleryExtension): string {
	const target = extension.properties.targetPlatform;
	const universal = target === TargetPlatform.UNIVERSAL || target === TargetPlatform.UNDEFINED;
	const platform = universal ? 'universal' : target;
	if (metadata.namespace?.toLowerCase() !== extension.publisher.toLowerCase()
		|| metadata.name?.toLowerCase() !== extension.name.toLowerCase()
		|| metadata.version !== extension.version
		|| metadata.targetPlatform !== platform) {
		throw new Error('Open VSX signature metadata does not match the gallery extension');
	}
	const pathBase = `/api/${encodeURIComponent(extension.publisher)}/${encodeURIComponent(extension.name)}/${universal ? '' : `${encodeURIComponent(platform)}/`}${encodeURIComponent(extension.version)}/file/`;
	const suffix = universal ? '' : `@${platform}`;
	const filename = `${extension.publisher}.${extension.name}-${extension.version}${suffix}`;
	checkMetadataAsset(metadata.files?.download, `${pathBase}${filename}.vsix`);
	checkMetadataAsset(metadata.files?.signature, `${pathBase}${filename}.sigzip`);
	const keyUrl = metadata.files?.publicKey;
	if (!keyUrl) {
		throw new Error('Open VSX signature metadata has no public key');
	}
	const url = new URL(keyUrl);
	if (url.origin !== OPEN_VSX_ORIGIN || url.username || url.password || url.search || url.hash || !/^\/api\/-\/public-key\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(url.pathname)) {
		throw new Error('Open VSX public key URL is outside the registry');
	}
	return keyUrl;
}

async function getRegistryText(requestService: IRequestService, url: string, maxBytes: number): Promise<string> {
	const context = await requestService.request({ type: 'GET', url, followRedirects: 0, timeout: 30_000, callSite: 'openVSXSignatureVerification' }, CancellationToken.None);
	if (context.res.statusCode !== 200) {
		throw new Error(`Open VSX signature metadata request returned ${context.res.statusCode}`);
	}
	return readBoundedResponse(context, maxBytes, () => new Error('Open VSX signature metadata is too large'));
}

/** Verify the exact VSIX bytes against Open VSX's Ed25519 signature and registry public key. */
export async function verifyOpenVSXSignature(extension: IGalleryExtension, vsixFilePath: string, signatureArchiveFilePath: string, requestService: IRequestService): Promise<boolean> {
	const metadataUrl = getOpenVSXMetadataUrl(extension);
	const metadata = JSON.parse(await getRegistryText(requestService, metadataUrl, 256 * 1024)) as IOpenVSXMetadata;
	const keyUrl = validateOpenVSXMetadata(metadata, extension);
	const publicKeyText = await getRegistryText(requestService, keyUrl, 16 * 1024);
	const publicKey = createPublicKey(publicKeyText);
	if (publicKey.asymmetricKeyType !== 'ed25519') {
		throw new Error('Open VSX registry public key is not Ed25519');
	}
	const signature = await buffer(signatureArchiveFilePath, '.signature.sig');
	if (signature.length !== 64) {
		throw new Error('Open VSX signature has an invalid length');
	}
	const stat = await fs.stat(vsixFilePath);
	if (stat.size > MAX_VSIX_BYTES) {
		throw new Error('Open VSX extension exceeds the signature verifier size limit');
	}
	const manifest = await getManifest(vsixFilePath);
	if (manifest.publisher?.toLowerCase() !== extension.publisher.toLowerCase()
		|| manifest.name?.toLowerCase() !== extension.name.toLowerCase()
		|| manifest.version !== extension.version) {
		throw new Error('Open VSX package identity does not match the gallery extension');
	}
	return verify(null, await fs.readFile(vsixFilePath), publicKey, signature);
}
