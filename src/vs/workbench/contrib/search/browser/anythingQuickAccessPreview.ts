/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable, IReference, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../platform/label/common/label.js';

/** A read-only preview that never opens an editor tab while browsing file results. */
export class AnythingQuickAccessPreview extends Disposable {

	readonly element = dom.$('.anything-quick-access-preview');
	private readonly name = dom.append(this.element, dom.$('.anything-preview-name'));
	private readonly path = dom.append(this.element, dom.$('.anything-preview-path'));
	private readonly content = dom.append(this.element, dom.$('.anything-preview-editor'));
	private readonly message = dom.append(this.element, dom.$('.anything-preview-message'));
	private readonly modelReference = this._register(new MutableDisposable<IReference<IResolvedTextEditorModel>>());
	private readonly editor: CodeEditorWidget;
	private request = 0;
	private resource: string | undefined;
	private range: IRange | undefined;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();
		this.element.setAttribute('role', 'region');
		this.element.setAttribute('aria-label', localize('filePreview', "File Preview"));
		this.message.setAttribute('role', 'status');
		this.editor = this._register(instantiationService.createInstance(CodeEditorWidget, this.content, {
			readOnly: true,
			domReadOnly: true,
			automaticLayout: true,
			minimap: { enabled: false },
			stickyScroll: { enabled: false },
			lineNumbersMinChars: 3,
			glyphMargin: false,
			folding: false,
			scrollBeyondLastLine: false,
			renderLineHighlight: 'none',
			contextmenu: false,
			overviewRulerLanes: 0,
			hideCursorInOverviewRuler: true,
			padding: { top: 12, bottom: 12 }
		}, { contributions: [] }));
		this.showMessage(localize('selectFile', "Select a file to preview"));
	}

	async setInput(resource: URI | undefined, range?: IRange): Promise<void> {
		this.range = range;
		if (resource && this.resource === resource.toString()) {
			this.revealRange();
			return;
		}
		this.resource = resource?.toString();
		const request = ++this.request;
		this.editor.setModel(null);
		this.modelReference.clear();
		this.name.textContent = resource ? basename(resource) : localize('filePreview', "File Preview");
		this.path.textContent = resource ? this.labelService.getUriLabel(resource, { relative: true }) : '';
		this.showMessage(resource ? localize('loadingPreview', "Loading preview…") : localize('selectFile', "Select a file to preview"));
		if (!resource) {
			return;
		}

		try {
			const reference = await this.textModelService.createModelReference(resource);
			if (request !== this.request) {
				reference.dispose();
				return;
			}
			this.modelReference.value = reference;
			this.message.hidden = true;
			this.content.style.visibility = '';
			this.editor.setModel(reference.object.textEditorModel);
			this.editor.layout();
			this.revealRange();
		} catch {
			if (request === this.request) {
				this.showMessage(localize('unavailablePreview', "Preview unavailable for this file. Press Enter to open it."));
			}
		}
	}

	private revealRange(): void {
		if (this.range && this.editor.hasModel()) {
			this.editor.setSelection(this.range);
			this.editor.revealRangeInCenter(this.range);
		}
	}

	private showMessage(message: string): void {
		this.message.textContent = message;
		this.message.hidden = false;
		this.content.style.visibility = 'hidden';
	}

	override dispose(): void {
		++this.request;
		this.editor.setModel(null);
		super.dispose();
	}
}
