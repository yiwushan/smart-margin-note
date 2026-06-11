var SmartMarginNote = {
	id: null,
	version: null,
	rootURI: null,
	readerHandlers: null,
	mainMenuID: null,
	prefPaneID: null,
	readerScanIntervalID: null,
	attachedViews: new WeakMap(),
	attachedWindows: new WeakSet(),
	tag: "smart-margin-note",
	extractionTag: "smart-margin-note-extraction",
	positionMarker: "smartMarginNote",
	prefsPrefix: "extensions.smartMarginNote.",
	defaultTextColor: "#2ea8e5",
	defaultFontSize: 8,

	init({ id, version, rootURI }) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
	},

	start() {
		this.readerHandlers = {
			renderToolbar: event => this.handleReaderToolbar(event),
			createViewContextMenu: event => this.handleReaderContextMenu(event)
		};

		if (Zotero.Reader?.registerEventListener) {
			Zotero.Reader.registerEventListener("renderToolbar", this.readerHandlers.renderToolbar, this.id);
			Zotero.Reader.registerEventListener("createViewContextMenu", this.readerHandlers.createViewContextMenu, this.id);
			this.log("Reader hooks registered");
		}
		else {
			this.log("Zotero.Reader.registerEventListener unavailable");
		}

		if (Zotero.MenuManager?.registerMenu) {
			this.mainMenuID = Zotero.MenuManager.registerMenu({
				menuID: "smart-margin-note-extract",
				pluginID: this.id,
				target: "main/library/item",
				menus: [
					{
						menuType: "menuitem",
						l10nID: "smart-margin-note-extract-menu",
						onShowing: (_event, context) => {
							context.setVisible?.(this.contextHasCandidateItems(context));
						},
						onCommand: (_event, context) => this.extractFromContext(context)
					}
				]
			});
			this.log("Library extraction menu registered");
		}
		this.registerPreferencePane();
		this.startReaderScan();
	},

	shutdown() {
		this.stopReaderScan();
		if (this.readerHandlers && Zotero.Reader?.unregisterEventListener) {
			Zotero.Reader.unregisterEventListener("renderToolbar", this.readerHandlers.renderToolbar);
			Zotero.Reader.unregisterEventListener("createViewContextMenu", this.readerHandlers.createViewContextMenu);
		}
		if (this.mainMenuID && Zotero.MenuManager?.unregisterMenu) {
			Zotero.MenuManager.unregisterMenu(this.mainMenuID);
		}
		this.unregisterPreferencePane();
		this.removeFromAllWindows();
		this.readerHandlers = null;
		this.mainMenuID = null;
		this.prefPaneID = null;
		this.readerScanIntervalID = null;
		this.attachedViews = new WeakMap();
		this.attachedWindows = new WeakSet();
	},

	startReaderScan() {
		if (this.readerScanIntervalID) {
			return;
		}
		this.attachToOpenReaders();
		this.readerScanIntervalID = setInterval(() => this.attachToOpenReaders(), 1500);
		this.log("Reader scanner started");
	},

	stopReaderScan() {
		if (!this.readerScanIntervalID) {
			return;
		}
		clearInterval(this.readerScanIntervalID);
		this.readerScanIntervalID = null;
	},

	attachToOpenReaders() {
		try {
			for (let reader of Zotero.Reader?._readers || []) {
				if (reader?._type === "pdf") {
					this.attachToReader(reader);
				}
			}
		}
		catch (e) {
			this.logError(e);
		}
	},

	registerPreferencePane() {
		if (!Zotero.PreferencePanes?.register) {
			this.log("Zotero.PreferencePanes.register unavailable");
			return;
		}
		try {
			this.prefPaneID = Zotero.PreferencePanes.register({
				pluginID: this.id,
				src: "prefs.xhtml",
				scripts: ["prefs-pane.js"],
				stylesheets: ["prefs.css"]
			});
			this.log("Preference pane registered");
		}
		catch (e) {
			this.logError(e);
		}
	},

	unregisterPreferencePane() {
		if (!this.prefPaneID || !Zotero.PreferencePanes?.unregister) {
			return;
		}
		try {
			Zotero.PreferencePanes.unregister(this.prefPaneID);
		}
		catch (e) {
			this.logError(e);
		}
	},

	addToWindow(window) {
		if (!window?.MozXULElement || this.attachedWindows.has(window)) {
			return;
		}
		window.MozXULElement.insertFTLIfNeeded("smart-margin-note.ftl");
		this.attachedWindows.add(window);
	},

	addToAllWindows() {
		for (let win of Zotero.getMainWindows()) {
			if (win.ZoteroPane) {
				this.addToWindow(win);
			}
		}
	},

	removeFromWindow(window) {
		window?.document?.querySelector('[href="smart-margin-note.ftl"]')?.remove();
	},

	removeFromAllWindows() {
		for (let win of Zotero.getMainWindows()) {
			if (win.ZoteroPane) {
				this.removeFromWindow(win);
			}
		}
	},

	log(message) {
		Zotero.debug("Smart Margin Note: " + message);
	},

	handleReaderToolbar(event) {
		let reader = event.reader;
		if (!reader || reader._type !== "pdf") {
			return;
		}
		this.attachToReader(reader);
	},

	handleReaderContextMenu(event) {
		let { reader, params, append } = event;
		if (!reader || reader._type !== "pdf") {
			return;
		}
		append({
			label: "创建智能旁批",
			disabled: !!reader._state?.readOnly || !params?.position,
			onCommand: () => {
				let view = this.getReaderViews(reader)[0];
				this.createAtPosition(reader, view, params.position, "context-menu").catch(e => this.logError(e));
			}
		});
		this.attachToReader(reader);
	},

	attachToReader(reader) {
		for (let view of this.getReaderViews(reader)) {
			this.attachToView(reader, view);
		}
	},

	getReaderViews(reader) {
		let views = [reader._lastView, reader._primaryView, reader._secondaryView].filter(Boolean);
		return [...new Set(views)].filter(view => view._iframeWindow?.document);
	},

	attachToView(reader, view) {
		let win = view._iframeWindow;
		let doc = win?.document;
		if (!win || !doc) {
			return;
		}
		let existing = this.attachedViews.get(view);
		if (existing?.doc === doc) {
			return;
		}
		if (existing) {
			existing.remove();
		}

		let mouseDown = event => {
			let isMiddle = event.button === 1;
			let isCtrlClick = event.button === 0 && event.ctrlKey && !event.altKey;
			if (!isMiddle && !isCtrlClick) {
				return;
			}
			if (this.isEditableTarget(event.target) || !event.target.closest?.("#viewerContainer")) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation?.();
			this.log(`Triggered by ${isMiddle ? "middle-click" : "ctrl-click"}`);
			this.createAtPointerEvent(reader, view, event, isMiddle ? "middle-click" : "ctrl-click")
				.catch(e => this.logError(e));
		};

		doc.addEventListener("mousedown", mouseDown, true);

		this.attachedViews.set(view, {
			doc,
			remove() {
				doc.removeEventListener("mousedown", mouseDown, true);
			}
		});
		this.log("Attached PDF reader listeners (Ctrl+left click or middle click)");
	},

	isEditableTarget(target) {
		return !!target?.closest?.("textarea, input, select, [contenteditable='true'], [contenteditable='']");
	},

	getPref(name, fallback) {
		try {
			let value = Zotero.Prefs.get(this.prefsPrefix + name, true);
			return value === undefined || value === null ? fallback : value;
		}
		catch (e) {
			this.logError(e);
			return fallback;
		}
	},

	getTextColor() {
		let color = String(this.getPref("textColor", this.defaultTextColor) || "").trim();
		return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : this.defaultTextColor;
	},

	getFontSize() {
		let value = Number.parseFloat(this.getPref("fontSize", this.defaultFontSize));
		if (!Number.isFinite(value)) {
			return this.defaultFontSize;
		}
		return Math.min(48, Math.max(4, value));
	},

	shouldReplaceExtractionNote() {
		let value = this.getPref("replaceExtractionNote", true);
		return value === true || value === "true" || value === 1 || value === "1";
	},

	async createAtPointerEvent(reader, view, event, trigger) {
		let position = view.pointerEventToPosition?.(event);
		if (!position) {
			this.log("No PDF position for pointer event");
			return;
		}
		await this.createAtPosition(reader, view, position, trigger);
	},

	async createAtPosition(reader, view, position, trigger) {
		if (!view || reader?._state?.readOnly || view._readOnly) {
			this.log("Reader is read-only; not creating annotation");
			return;
		}
		let paragraph = await this.findNearestParagraph(view, position);
		if (!paragraph) {
			this.log("No nearby paragraph found");
			return;
		}

		let fontSize = this.getFontSize();
		let textColor = this.getTextColor();
		let point = position.rects[0];
		let x = (point[0] + point[2]) / 2;
		let y = (point[1] + point[3]) / 2;
		let notePosition = {
			pageIndex: position.pageIndex,
			fontSize,
			rotation: 0,
			rects: [[
				x - fontSize / 2,
				y - fontSize / 2,
				x + fontSize / 2,
				y + fontSize / 2
			]]
		};
		notePosition[this.positionMarker] = {
			version: 1,
			createdAt: new Date().toISOString(),
			trigger,
			paragraphText: this.truncateText(paragraph.text, 6000),
			paragraphPosition: paragraph.position,
			paragraphOffsetStart: paragraph.start,
			paragraphOffsetEnd: paragraph.end
		};

		let annotationData = {
			type: "text",
			color: textColor,
			pageLabel: view._getPageLabel?.(position.pageIndex, true) || String(position.pageIndex + 1),
			sortIndex: this.makeSortIndex(view, notePosition, paragraph),
			position: notePosition,
			tags: [{ name: this.tag }]
		};
		let annotation = view._onAddAnnotation?.(this.cloneIntoReader(view, annotationData), true);
		annotation = this.unwrapReaderObject(annotation);

		if (!annotation) {
			this.log("Reader did not return a new annotation");
			return;
		}

		reader?.setSelectedAnnotations?.([annotation.id], true);
		view.setSelectedAnnotationIDs?.([annotation.id]);
		view._render?.();
		this.focusTextAnnotation(view, annotation.id);
		this.log(`Created smart margin note on page ${position.pageIndex + 1}: ${paragraph.text.slice(0, 80)}`);
	},

	cloneIntoReader(view, value) {
		let win = view?._iframeWindow;
		if (win && typeof Components !== "undefined" && Components.utils?.cloneInto) {
			return Components.utils.cloneInto(value, win, { wrapReflectors: true });
		}
		return value;
	},

	unwrapReaderObject(value) {
		return value?.wrappedJSObject || value;
	},

	focusTextAnnotation(view, id) {
		let doc = view._iframeWindow?.document;
		if (!doc || !id) {
			return;
		}
		let selector = `[data-id="${this.cssEscape(String(id))}"]`;
		for (let delay of [50, 150, 350]) {
			view._iframeWindow.setTimeout(() => {
				let node = doc.querySelector(selector);
				if (node) {
					node.classList.add("focusable");
					node.focus();
				}
			}, delay);
		}
	},

	async findNearestParagraph(view, position) {
		let pageIndex = position.pageIndex;
		let page = await this.getPageData(view, pageIndex);
		let chars = page?.chars || [];
		if (!chars.length) {
			return null;
		}
		let paragraphs = this.buildParagraphs(chars, pageIndex).filter(p => p.text);
		if (!paragraphs.length) {
			return null;
		}

		let point = position.rects[0];
		let px = (point[0] + point[2]) / 2;
		let py = (point[1] + point[3]) / 2;
		let lineHeight = this.estimateLineHeight(paragraphs);
		let maxVerticalDistance = Math.max(24, lineHeight * 3);
		let best = null;

		for (let paragraph of paragraphs) {
			let rect = this.boundingRect(paragraph.position.rects);
			let verticalDistance = this.axisDistance(py, rect[1], rect[3]);
			if (verticalDistance > maxVerticalDistance) {
				continue;
			}
			let horizontalDistance = this.axisDistance(px, rect[0], rect[2]);
			let centerPenalty = Math.abs(py - (rect[1] + rect[3]) / 2) * 0.05;
			let score = verticalDistance * 10 + horizontalDistance + centerPenalty;
			if (!best || score < best.score) {
				best = { paragraph, score };
			}
		}
		return best?.paragraph || null;
	},

	async getPageData(view, pageIndex) {
		if (view._pdfPages?.[pageIndex]?.chars?.length) {
			return view._pdfPages[pageIndex];
		}
		if (view._ensureBasicPageData) {
			await view._ensureBasicPageData(pageIndex);
			if (view._pdfPages?.[pageIndex]?.chars?.length) {
				return view._pdfPages[pageIndex];
			}
		}
		let pdfDocument = view._iframeWindow?.PDFViewerApplication?.pdfDocument;
		if (pdfDocument?.getPageData) {
			let pageData = await pdfDocument.getPageData({ pageIndex });
			if (view._pdfPages) {
				view._pdfPages[pageIndex] = Object.assign(view._pdfPages[pageIndex] || {}, pageData);
			}
			return pageData;
		}
		return null;
	},

	buildParagraphs(chars, pageIndex) {
		let lines = [];
		let explicitBreaks = new Set();
		let lineStart = 0;
		let pushLine = endIdx => {
			let rects = this.getRangeRects(chars, lineStart, endIdx);
			if (rects.length) {
				lines.push({
					start: lineStart,
					end: endIdx,
					rect: this.boundingRect(rects)
				});
			}
			lineStart = endIdx + 1;
		};

		for (let i = 0; i < chars.length; i++) {
			let ch = chars[i];
			if (!ch) {
				continue;
			}
			if (ch.paragraphBreakAfter) {
				explicitBreaks.add(i);
			}
			if (ch.lineBreakAfter || ch.paragraphBreakAfter || i === chars.length - 1) {
				pushLine(i);
			}
		}

		if (!lines.length) {
			return [];
		}

		let groups = [];
		let groupStart = 0;
		const indentEps = 10;
		for (let i = 1; i < lines.length; i++) {
			let prev = lines[i - 1];
			let cur = lines[i];
			let hasBreak = explicitBreaks.has(prev.end) || cur.rect[0] > prev.rect[0] + indentEps;
			if (hasBreak) {
				groups.push([groupStart, i - 1]);
				groupStart = i;
			}
		}
		groups.push([groupStart, lines.length - 1]);

		let merged = [];
		for (let group of groups) {
			let last = merged[merged.length - 1];
			let isSingleLine = group[0] === group[1];
			let curFont = chars[lines[group[0]].start]?.fontName;
			let lastFont = last && chars[lines[last[0]].start]?.fontName;
			if (last && isSingleLine && curFont && curFont === lastFont) {
				last[1] = group[1];
			}
			else {
				merged.push(group.slice());
			}
		}

		return merged.map(([lineStartIndex, lineEndIndex]) => {
			let start = lines[lineStartIndex].start;
			let end = lines[lineEndIndex].end;
			let rects = this.getRangeRects(chars, start, end);
			return {
				start,
				end,
				text: this.getTextFromChars(chars.slice(start, end + 1)),
				position: { pageIndex, rects }
			};
		});
	},

	getRangeRects(chars, offsetStart, offsetEnd) {
		let rects = [];
		let start = offsetStart;
		let norm = r => {
			let [x1, y1, x2, y2] = r;
			return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
		};
		for (let i = start; i <= offsetEnd; i++) {
			let char = chars[i];
			if (!char) {
				continue;
			}
			let isBreak = char.lineBreakAfter || i === offsetEnd;
			if (!isBreak) {
				continue;
			}
			let firstChar = chars[start];
			let lastChar = char;
			if (!firstChar?.rect || !lastChar?.rect || !firstChar?.inlineRect) {
				start = i + 1;
				continue;
			}
			let firstRect = norm(firstChar.rect);
			let lastRect = norm(lastChar.rect);
			let firstInline = norm(firstChar.inlineRect);
			let rot = firstChar.rotation || 0;
			let isVertical = rot === 90 || rot === 270;
			rects.push(isVertical
				? [firstInline[0], firstRect[1], firstInline[2], lastRect[3]]
				: [firstRect[0], firstInline[1], lastRect[2], firstInline[3]]);
			start = i + 1;
		}
		return rects;
	},

	getTextFromChars(chars) {
		let text = [];
		for (let char of chars) {
			if (!char?.ignorable) {
				text.push(char.c || "");
				if (char.spaceAfter || char.lineBreakAfter || char.paragraphBreakAfter) {
					text.push(" ");
				}
			}
		}
		return text.join("").replace(/\s+/g, " ").trim();
	},

	estimateLineHeight(paragraphs) {
		let heights = [];
		for (let p of paragraphs) {
			for (let rect of p.position.rects) {
				heights.push(Math.abs(rect[3] - rect[1]));
			}
		}
		heights.sort((a, b) => a - b);
		return heights[Math.floor(heights.length / 2)] || 12;
	},

	axisDistance(value, min, max) {
		if (value < min) {
			return min - value;
		}
		if (value > max) {
			return value - max;
		}
		return 0;
	},

	boundingRect(rects) {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (let rect of rects || []) {
			if (!rect) {
				continue;
			}
			minX = Math.min(minX, rect[0]);
			minY = Math.min(minY, rect[1]);
			maxX = Math.max(maxX, rect[2]);
			maxY = Math.max(maxY, rect[3]);
		}
		return [minX, minY, maxX, maxY];
	},

	makeSortIndex(view, position, paragraph) {
		let pageIndex = position.pageIndex;
		let page = view._pdfPages?.[pageIndex];
		let rect = position.rects[0];
		let pageHeight = page?.viewBox ? page.viewBox[3] - page.viewBox[1] : 0;
		let top = pageHeight ? Math.max(0, Math.floor(pageHeight - rect[3])) : Math.floor(rect[1]);
		let offset = Number.isInteger(paragraph?.start) ? paragraph.start : 0;
		return [
			String(pageIndex).slice(0, 5).padStart(5, "0"),
			String(offset).slice(0, 6).padStart(6, "0"),
			String(top).slice(0, 5).padStart(5, "0")
		].join("|");
	},

	contextHasCandidateItems(context) {
		return !!context.items?.some(item =>
			item?.isRegularItem?.()
			|| item?.isPDFAttachment?.()
			|| item?.isAnnotation?.()
		);
	},

	async extractFromContext(context) {
		let attachments = await this.getCandidateAttachments(context.items || []);
		let smartAnnotations = [];
		for (let attachment of attachments) {
			for (let annotation of attachment.getAnnotations()) {
				let smart = this.getSmartData(annotation);
				if (smart) {
					smartAnnotations.push({ attachment, annotation, smart });
				}
			}
		}

		let selectedAnnotationItems = (context.items || []).filter(item => item?.isAnnotation?.());
		for (let annotation of selectedAnnotationItems) {
			let smart = this.getSmartData(annotation);
			if (smart) {
				let attachment = Zotero.Items.get(annotation.parentID);
				smartAnnotations.push({ attachment, annotation, smart });
			}
		}

		smartAnnotations = this.uniqueByAnnotationID(smartAnnotations);
		if (!smartAnnotations.length) {
			this.alert("没有找到智能旁批。");
			return;
		}

		let note = await this.createExtractionNote(smartAnnotations);
		await this.selectItem(note.id);
		this.log(`Extracted ${smartAnnotations.length} smart margin notes`);
	},

	async getCandidateAttachments(items) {
		let attachments = [];
		for (let item of items) {
			if (!item) {
				continue;
			}
			if (item.isAnnotation?.()) {
				let parent = Zotero.Items.get(item.parentID);
				if (parent?.isPDFAttachment?.()) {
					attachments.push(parent);
				}
			}
			else if (item.isPDFAttachment?.()) {
				attachments.push(item);
			}
			else if (item.isRegularItem?.()) {
				for (let attachmentID of item.getAttachments()) {
					let attachment = Zotero.Items.get(attachmentID);
					if (attachment?.isPDFAttachment?.()) {
						attachments.push(attachment);
					}
				}
			}
		}
		return [...new Map(attachments.map(item => [item.id, item])).values()];
	},

	getSmartData(annotation) {
		if (!annotation?.annotationPosition) {
			return null;
		}
		try {
			let position = JSON.parse(annotation.annotationPosition);
			let smart = position?.[this.positionMarker];
			if (smart?.paragraphText) {
				return smart;
			}
		}
		catch (e) {
			this.logError(e);
		}
		return null;
	},

	uniqueByAnnotationID(rows) {
		return [...new Map(rows.map(row => [row.annotation.id, row])).values()]
			.sort((a, b) => String(a.annotation.annotationSortIndex).localeCompare(String(b.annotation.annotationSortIndex)));
	},

	async createExtractionNote(rows) {
		let first = rows[0];
		let parentID = this.getExtractionParentID(rows);
		let note = this.shouldReplaceExtractionNote() ? this.findExistingExtractionNote(rows) : null;
		if (!note) {
			note = new Zotero.Item("note");
			note.libraryID = first.annotation.libraryID;
			if (parentID) {
				note.parentID = parentID;
			}
		}
		note.setNote(this.buildExtractionHTML(rows));
		this.ensureItemTag(note, this.extractionTag);
		await note.saveTx();
		return note;
	},

	getExtractionParentID(rows) {
		let parentID = rows[0]?.attachment?.parentID;
		if (parentID && rows.every(row => row.attachment?.parentID === parentID)) {
			return parentID;
		}
		return null;
	},

	findExistingExtractionNote(rows) {
		let parentID = this.getExtractionParentID(rows);
		if (!parentID) {
			return null;
		}
		let parent = Zotero.Items.get(parentID);
		for (let noteID of parent?.getNotes?.() || []) {
			let note = Zotero.Items.get(noteID);
			if (this.isExtractionNote(note)) {
				return note;
			}
		}
		return null;
	},

	isExtractionNote(note) {
		if (!note?.isNote?.()) {
			return false;
		}
		if ((note.getTags?.() || []).some(tag => tag.tag === this.extractionTag)) {
			return true;
		}
		let html = note.getNote?.() || "";
		return html.includes('data-smart-margin-note="extraction"') || html.includes("<h1>智能旁批</h1>");
	},

	ensureItemTag(item, tag) {
		let tags = item.getTags?.() || [];
		if (tags.some(existing => existing.tag === tag)) {
			return;
		}
		item.setTags?.([...tags.map(existing => ({ tag: existing.tag })), { tag }]);
	},

	buildExtractionHTML(rows) {
		let html = [
			'<h1 data-smart-margin-note="extraction">智能旁批</h1>',
			`<p>生成时间：${this.escapeHTML(new Date().toLocaleString())}</p>`
		];
		for (let row of rows) {
			let { attachment, annotation, smart } = row;
			let page = annotation.annotationPageLabel || "";
			let comment = annotation.annotationComment || "";
			let link = this.makeOpenPDFLink(attachment, annotation);
			html.push("<blockquote>");
			html.push(this.escapeHTML(smart.paragraphText || ""));
			html.push("</blockquote>");
			html.push(`<p><strong>旁批：</strong>${this.formatMultilineHTML(comment || "（空白旁批）")}</p>`);
			html.push(`<p><a href="${this.escapeAttribute(link)}">回到 PDF${page ? " · p. " + this.escapeHTML(page) : ""}</a></p>`);
		}
		return html.join("\n");
	},

	makeOpenPDFLink(attachment, annotation) {
		let libraryPath = attachment.library.libraryType === "group"
			? `groups/${attachment.library.libraryTypeID}`
			: "library";
		return `zotero://open-pdf/${libraryPath}/items/${attachment.key}?annotation=${annotation.key}`;
	},

	async selectItem(itemID) {
		let win = Zotero.getMainWindow();
		if (win?.ZoteroPane?.selectItem) {
			await win.ZoteroPane.selectItem(itemID);
		}
	},

	alert(message) {
		let win = Zotero.getMainWindow();
		win?.alert?.(message);
	},

	escapeHTML(value) {
		return String(value ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	},

	escapeAttribute(value) {
		return this.escapeHTML(value).replace(/'/g, "&#39;");
	},

	formatMultilineHTML(value) {
		return this.escapeHTML(value).replace(/\r\n|\r|\n/g, "<br/>");
	},

	truncateText(value, maxLength) {
		value = String(value || "");
		if (value.length <= maxLength) {
			return value;
		}
		return value.slice(0, maxLength - 3) + "...";
	},

	cssEscape(value) {
		if (typeof CSS !== "undefined" && CSS.escape) {
			return CSS.escape(value);
		}
		return value.replace(/["\\]/g, "\\$&");
	},

	logError(error) {
		Zotero.logError?.(error);
		this.log(error?.stack || error);
	}
};
