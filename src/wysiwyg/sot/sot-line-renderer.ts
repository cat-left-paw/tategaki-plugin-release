import { finishRenderMath, renderMath, setIcon } from "obsidian";
import type { MarkdownRenderChild } from "obsidian";
import type { LineRange } from "./line-ranges";
import type {
	BlockLineDecoration,
	InlineWidget,
	RenderSegment,
} from "./sot-render-types";
import {
	renderCalloutWidgetLine,
	renderDeflistWidgetLine,
	renderEmbedWidgetLine,
	renderImageWidgetLine,
	renderMathWidgetLine,
	renderTableWidgetLine,
	type SoTWidgetRenderContext,
} from "./sot-widget-renderer";

export class SoTLineRenderer {
	private readonly host: any;
	private finishRenderMathTimer: number | null = null;

	constructor(host: any) {
		this.host = host;
	}

	dispose(): void {
		if (this.finishRenderMathTimer !== null) {
			window.clearTimeout(this.finishRenderMathTimer);
			this.finishRenderMathTimer = null;
		}
	}

	private get sotEditor() {
		return this.host.sotEditor ?? null;
	}

	private get lineRanges(): LineRange[] {
		return this.host.lineRanges;
	}

	private get frontmatterDetected(): boolean {
		return this.host.frontmatterDetected;
	}

	private get ceImeMode(): boolean {
		return this.host.ceImeMode;
	}

	private get footnoteDefinitionOrder(): Map<string, number> {
		return this.host.footnoteDefinitionOrder;
	}

	private get footnoteDefinitionText(): Map<string, string> {
		return this.host.footnoteDefinitionText;
	}

	private get currentFile() {
		return this.host.currentFile ?? null;
	}

	private get app() {
		return this.host.app;
	}

	private get embedRenderChildren(): Map<number, MarkdownRenderChild> {
		return this.host.embedRenderChildren;
	}

	private get mathRenderChildren(): Map<number, MarkdownRenderChild> {
		return this.host.mathRenderChildren;
	}

	private get calloutRenderChildren(): Map<number, MarkdownRenderChild> {
		return this.host.calloutRenderChildren;
	}

	private get tableRenderChildren(): Map<number, MarkdownRenderChild> {
		return this.host.tableRenderChildren;
	}

	private get deflistRenderChildren(): Map<number, MarkdownRenderChild> {
		return this.host.deflistRenderChildren;
	}

	private get pendingSpacerEl(): HTMLElement | null {
		return this.host.pendingSpacerEl ?? null;
	}

	private set pendingSpacerEl(value: HTMLElement | null) {
		this.host.pendingSpacerEl = value;
	}

	private isLineInSourceMode(lineIndex: number): boolean {
		return this.host.isLineInSourceMode(lineIndex);
	}

	private applyCeEditableState(
		lineEl: HTMLElement,
		lineIndex: number | null
	): void {
		this.host.applyCeEditableState(lineEl, lineIndex);
	}

	private applyCeNonEditableMarkers(lineEl: HTMLElement): void {
		this.host.applyCeNonEditableMarkers(lineEl);
	}

	private applyPlainEditTargetClass(
		lineEl: HTMLElement,
		lineIndex: number | null
	): void {
		this.host.applyPlainEditTargetClass(lineEl, lineIndex);
	}

	private createLinePrefixElement(lineEl: HTMLElement): HTMLElement | null {
		return this.host.createLinePrefixElement(lineEl);
	}

	private getCollapsedContentPreview(lineIndex: number, lines: number): string {
		return this.host.getCollapsedContentPreview(lineIndex, lines);
	}

	private showCollapsePreviewTooltip(target: HTMLElement, text: string): void {
		this.host.showCollapsePreviewTooltip(target, text);
	}

	private hideCollapsePreviewTooltip(): void {
		this.host.hideCollapsePreviewTooltip();
	}

	private getLineText(lineRange: LineRange): string {
		return this.host.getLineText(lineRange);
	}

	private getTablePipeOffsets(lineText: string): number[] {
		return this.host.getTablePipeOffsets(lineText);
	}

	private getCachedBlockLineDecoration(
		lineIndex: number | null,
		lineFrom: number,
		lineTo: number,
		lineText: string
	): BlockLineDecoration {
		return this.host.getCachedBlockLineDecoration(
			lineIndex,
			lineFrom,
			lineTo,
			lineText
		);
	}

	private buildSegmentsForLine(
		lineFrom: number,
		lineTo: number
	): RenderSegment[] {
		return this.host.buildSegmentsForLine(lineFrom, lineTo);
	}

	private getInlineWidgetsForLineRange(lineRange: LineRange): InlineWidget[] {
		return this.host.getInlineWidgetsForLineRange(lineRange);
	}

	ensureLineRendered(lineEl: HTMLElement): void {
		if (lineEl.dataset.virtual !== "1") return;
		const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
		if (!Number.isFinite(index)) return;
		const range = this.lineRanges[index];
		if (!range) return;
		this.renderLine(lineEl, range, index);
	}

	renderLine(
		lineEl: HTMLElement,
		lineRange: LineRange,
		lineIndex?: number
	): void {
		if (!this.sotEditor) return;
		const index =
			lineIndex ?? Number.parseInt(lineEl.dataset.line ?? "", 10);
		const isSource =
			Number.isFinite(index) && this.isLineInSourceMode(index as number);

		if (Number.isFinite(index)) {
			const prevChild = this.embedRenderChildren.get(index as number);
			if (prevChild) {
				try {
					prevChild.unload();
				} catch (_) {}
				this.embedRenderChildren.delete(index as number);
			}
			const prevMath = this.mathRenderChildren.get(index as number);
			if (prevMath) {
				try {
					prevMath.unload();
				} catch (_) {}
				this.mathRenderChildren.delete(index as number);
			}
			const prevCallout = this.calloutRenderChildren.get(index as number);
			if (prevCallout) {
				try {
					prevCallout.unload();
				} catch (_) {}
				this.calloutRenderChildren.delete(index as number);
			}
			const prevTable = this.tableRenderChildren.get(index as number);
			if (prevTable) {
				try {
					prevTable.unload();
				} catch (_) {}
				this.tableRenderChildren.delete(index as number);
			}
			const prevDeflist = this.deflistRenderChildren.get(index as number);
			if (prevDeflist) {
				try {
					prevDeflist.unload();
				} catch (_) {}
				this.deflistRenderChildren.delete(index as number);
			}
		}

		// datasetの残骸をクリア
		lineEl.removeAttribute("data-virtual");
		delete (lineEl.dataset as any).mdKind;
		delete (lineEl.dataset as any).mdLevel;
		delete (lineEl.dataset as any).mdDepth;
		delete (lineEl.dataset as any).headingCollapsed;
		delete (lineEl.dataset as any).headingFoldable;
		delete (lineEl.dataset as any).listMarker;
		delete (lineEl.dataset as any).taskChecked;
		delete (lineEl.dataset as any).listDepth;
		delete (lineEl.dataset as any).listBullet;
		delete (lineEl.dataset as any).codeInfo;
		delete (lineEl.dataset as any).calloutType;
		delete (lineEl.dataset as any).calloutRange;
		delete (lineEl.dataset as any).footnoteId;
		delete (lineEl.dataset as any).tableHeader;
		delete (lineEl.dataset as any).tableRange;
		delete (lineEl.dataset as any).deflistRange;
		delete (lineEl.dataset as any).imageSrc;
		delete (lineEl.dataset as any).imageAlt;
		delete (lineEl.dataset as any).imageWidth;
		delete (lineEl.dataset as any).embedTarget;
		delete (lineEl.dataset as any).mathRange;
		lineEl.style.removeProperty("--tategaki-sot-list-depth");
		lineEl.style.removeProperty("--tategaki-sot-blockquote-depth");

		this.applyCeEditableState(
			lineEl,
			Number.isFinite(index) ? (index as number) : null
		);

		if (isSource) {
			lineEl.className = "tategaki-sot-line";
			const doc = this.sotEditor.getDoc();
			const segments: RenderSegment[] =
				lineRange.to > lineRange.from
					? [
							{
								from: lineRange.from,
								to: lineRange.to,
								text: doc.slice(lineRange.from, lineRange.to),
								classNames: ["tategaki-sot-run"],
							},
					  ]
					: [];
			this.renderLineFromSegments(lineEl, lineRange, segments);
			this.applyCeNonEditableMarkers(lineEl);
			this.applyPlainEditTargetClass(
				lineEl,
				Number.isFinite(index) ? (index as number) : null
			);
			return;
		}

		{
			const doc = this.sotEditor.getDoc();
			const indexForDecoration = Number.isFinite(index)
				? (index as number)
				: null;
			const lineText = doc.slice(lineRange.from, lineRange.to);
			const decoration = this.getCachedBlockLineDecoration(
				indexForDecoration,
				lineRange.from,
				lineRange.to,
				lineText
			);
			lineEl.className = [
				"tategaki-sot-line",
				...decoration.classes,
			].join(" ");
			for (const [key, value] of Object.entries(decoration.dataset)) {
				(lineEl.dataset as any)[key] = value;
			}
			for (const [key, value] of Object.entries(decoration.styleVars)) {
				lineEl.style.setProperty(key, value);
			}
		}
		if (
			this.frontmatterDetected &&
			(lineEl.dataset.mdKind === "frontmatter" ||
				lineEl.dataset.mdKind === "frontmatter-fence")
		) {
			lineEl.classList.add("tategaki-md-frontmatter-hidden");
			this.renderLineFromSegments(lineEl, lineRange, []);
			this.applyCeNonEditableMarkers(lineEl);
			this.applyPlainEditTargetClass(
				lineEl,
				Number.isFinite(index) ? (index as number) : null
			);
			return;
		}
		if (lineEl.dataset.mdKind === "heading-hidden") {
			this.renderLineFromSegments(lineEl, lineRange, []);
			this.applyCeNonEditableMarkers(lineEl);
			this.applyPlainEditTargetClass(
				lineEl,
				Number.isFinite(index) ? (index as number) : null
			);
			return;
		}

		const segments = this.buildSegmentsForLine(
			lineRange.from,
			lineRange.to
		);
		const inlineWidgets = this.getInlineWidgetsForLineRange(lineRange);
		this.renderLineFromSegments(
			lineEl,
			lineRange,
			segments,
			undefined,
			inlineWidgets
		);
		this.applyCeNonEditableMarkers(lineEl);
		this.applyPlainEditTargetClass(
			lineEl,
			Number.isFinite(index) ? (index as number) : null
		);
	}

	renderLineLight(
		lineEl: HTMLElement,
		lineRange: LineRange,
		_lineIndex: number
	): void {
		// 軽量プレースホルダー: 最小限の属性のみ設定
		// テキスト取得や装飾計算を行わず、メモリと処理負荷を大幅に削減
		lineEl.replaceChildren();
		lineEl.className = "tategaki-sot-line tategaki-sot-line-virtual";
		lineEl.dataset.virtual = "1";
		this.applyCeEditableState(lineEl, _lineIndex);
		this.applyPlainEditTargetClass(lineEl, _lineIndex);

		// 行の長さに応じたプレースホルダーバーを表示
		const lineLength = lineRange.to - lineRange.from;
		if (lineLength > 0) {
			const placeholder = document.createElement("span");
			placeholder.className = "tategaki-sot-virtual-placeholder";
			// 行の長さを文字数として設定（CSSで高さに変換）
			placeholder.style.setProperty(
				"--placeholder-chars",
				String(Math.min(lineLength, 100))
			);
			lineEl.appendChild(placeholder);
		}
	}

	removeRangeFromSegments(
		segments: RenderSegment[],
		removeFrom: number,
		removeTo: number
	): RenderSegment[] {
		const safeFrom = Math.min(removeFrom, removeTo);
		const safeTo = Math.max(removeFrom, removeTo);
		if (safeFrom === safeTo) return segments;

		const result: RenderSegment[] = [];
		for (const seg of segments) {
			if (seg.to <= safeFrom || seg.from >= safeTo) {
				result.push(seg);
				continue;
			}
			if (seg.from < safeFrom) {
				const leftTo = Math.min(seg.to, safeFrom);
				const leftLen = leftTo - seg.from;
				if (leftLen > 0) {
					result.push({
						from: seg.from,
						to: leftTo,
						text: seg.text.slice(0, leftLen),
						classNames: seg.classNames,
						href: seg.href,
						ruby: seg.ruby,
					});
				}
			}
			if (seg.to > safeTo) {
				const rightFrom = Math.max(seg.from, safeTo);
				const rightStart = rightFrom - seg.from;
				if (rightStart < seg.text.length) {
					result.push({
						from: rightFrom,
						to: seg.to,
						text: seg.text.slice(rightStart),
						classNames: seg.classNames,
						href: seg.href,
						ruby: seg.ruby,
					});
				}
			}
		}
		return result;
	}

	removeRangeFromInlineWidgets(
		widgets: InlineWidget[],
		removeFrom: number,
		removeTo: number
	): InlineWidget[] {
		const safeFrom = Math.min(removeFrom, removeTo);
		const safeTo = Math.max(removeFrom, removeTo);
		if (safeFrom === safeTo) return widgets;
		return widgets.filter((w) => w.to <= safeFrom || w.from >= safeTo);
	}

	splitSegmentsAtOffset(
		segments: RenderSegment[],
		globalOffset: number
	): { before: RenderSegment[]; after: RenderSegment[] } {
		const before: RenderSegment[] = [];
		const after: RenderSegment[] = [];
		for (const seg of segments) {
			if (seg.to <= globalOffset) {
				before.push(seg);
				continue;
			}
			if (seg.from >= globalOffset) {
				after.push(seg);
				continue;
			}
			// seg.from < globalOffset < seg.to
			const splitIndex = Math.max(
				0,
				Math.min(globalOffset - seg.from, seg.text.length)
			);
			const leftText = seg.text.slice(0, splitIndex);
			const rightText = seg.text.slice(splitIndex);
			if (leftText.length > 0) {
				before.push({
					from: seg.from,
					to: seg.from + leftText.length,
					text: leftText,
					classNames: seg.classNames,
					href: seg.href,
					ruby: seg.ruby,
				});
			}
			if (rightText.length > 0) {
				after.push({
					from: seg.from + leftText.length,
					to: seg.to,
					text: rightText,
					classNames: seg.classNames,
					href: seg.href,
					ruby: seg.ruby,
				});
			}
		}
		return { before, after };
	}

	renderInlineSegmentsWithWidgets(
		parent: HTMLElement,
		lineRange: LineRange,
		segments: RenderSegment[],
		inlineWidgets: InlineWidget[],
		pending?:
			| {
					insertOffset: number;
					pendingText: string;
			  }
			| undefined
	): void {
		const widgets = (inlineWidgets ?? [])
			.filter(
				(w) =>
					w.from >= lineRange.from &&
					w.from <= lineRange.to &&
					w.to >= lineRange.from &&
					w.to <= lineRange.to
			)
			.slice()
			.sort((a, b) => a.from - b.from || a.to - b.to);

		const appendSegment = (segment: RenderSegment) => {
			const span = document.createElement("span");
			span.className = segment.classNames.join(" ");
			span.dataset.from = String(segment.from - lineRange.from);
			span.dataset.to = String(segment.to - lineRange.from);
			if (segment.classNames.includes("tategaki-md-footnote-ref")) {
				const footnoteId = segment.text;
				const number = this.footnoteDefinitionOrder.get(footnoteId);
				span.dataset.footnoteId = footnoteId;
				if (number !== undefined) {
					span.dataset.footnoteNumber = String(number);
				} else {
					delete (span.dataset as any).footnoteNumber;
				}
				const tooltip = this.footnoteDefinitionText.get(footnoteId);
				if (tooltip) {
					span.setAttribute("aria-label", tooltip);
					span.setAttribute("data-tooltip-position", "top");
				} else {
					span.removeAttribute("aria-label");
					span.removeAttribute("data-tooltip-position");
				}
			}
			if (segment.href) {
				span.dataset.href = segment.href;
			} else {
				delete (span.dataset as any).href;
			}
			if (segment.ruby) {
				span.dataset.ruby = segment.ruby;
				span.dataset.aozoraRuby = "1";
			} else {
				delete (span.dataset as any).ruby;
				delete (span.dataset as any).aozoraRuby;
			}
			span.textContent = segment.text;
			parent.appendChild(span);
		};

		const appendWidget = (widget: InlineWidget) => {
			if (widget.kind !== "math-inline") return;
			const wrap = document.createElement("span");
			wrap.className =
				"tategaki-md-inline-widget tategaki-md-math-inline-widget";
			wrap.dataset.from = String(widget.from - lineRange.from);
			wrap.dataset.to = String(widget.to - lineRange.from);
			wrap.dataset.widgetKind = widget.kind;
			try {
				const el = renderMath(widget.source, false);
				wrap.appendChild(el);
				this.scheduleFinishRenderMath();
			} catch (_) {
				wrap.textContent = `$${widget.source}$`;
				wrap.classList.add("is-fallback");
			}
			parent.appendChild(wrap);
		};

		const insertOffset = pending
			? Math.max(
					lineRange.from,
					Math.min(pending.insertOffset, lineRange.to)
			  )
			: null;
		const splitOffsets = widgets.map((w) => w.from);
		if (insertOffset !== null) splitOffsets.push(insertOffset);
		const sliced = this.splitSegmentsAtOffsets(
			segments,
			Array.from(new Set(splitOffsets))
		);

		let segIndex = 0;
		let widgetIndex = 0;
		let pendingInserted = insertOffset === null;

		const nextFrom = (): number | null => {
			const seg = sliced[segIndex];
			const widget = widgets[widgetIndex];
			const segFrom = seg ? seg.from : null;
			const widgetFrom = widget ? widget.from : null;
			const pendingFrom = pendingInserted ? null : insertOffset;
			let best: number | null = null;
			for (const v of [segFrom, widgetFrom, pendingFrom]) {
				if (v === null) continue;
				if (best === null || v < best) best = v;
			}
			return best;
		};

		while (true) {
			const at = nextFrom();
			if (at === null) break;
			if (
				!pendingInserted &&
				insertOffset !== null &&
				at === insertOffset
			) {
				const spacer = document.createElement("span");
				spacer.className = "tategaki-sot-pending-spacer";
				spacer.textContent = pending?.pendingText ?? "";
				parent.appendChild(spacer);
				this.pendingSpacerEl = spacer;
				pendingInserted = true;
				continue;
			}
			const widget = widgets[widgetIndex];
			if (widget && widget.from === at) {
				appendWidget(widget);
				widgetIndex += 1;
				continue;
			}
			const seg = sliced[segIndex];
			if (seg && seg.from === at) {
				appendSegment(seg);
				segIndex += 1;
				continue;
			}
			break;
		}

		for (; widgetIndex < widgets.length; widgetIndex += 1) {
			appendWidget(widgets[widgetIndex]!);
		}
		for (; segIndex < sliced.length; segIndex += 1) {
			appendSegment(sliced[segIndex]!);
		}
		if (!pendingInserted && insertOffset !== null) {
			const spacer = document.createElement("span");
			spacer.className = "tategaki-sot-pending-spacer";
			spacer.textContent = pending?.pendingText ?? "";
			parent.appendChild(spacer);
			this.pendingSpacerEl = spacer;
		}
	}

	getWidgetRenderContext(): SoTWidgetRenderContext {
		return {
			app: this.app,
			getDoc: () => this.sotEditor?.getDoc() ?? null,
			getSourcePath: () => this.currentFile?.path ?? "",
			lineRanges: this.host.lineRanges,
			lineMathBlockStart: this.host.lineMathBlockStart,
			lineMathBlockEnd: this.host.lineMathBlockEnd,
			lineCalloutBlockStart: this.host.lineCalloutBlockStart,
			lineCalloutBlockEnd: this.host.lineCalloutBlockEnd,
			lineTableBlockStart: this.host.lineTableBlockStart,
			lineTableBlockEnd: this.host.lineTableBlockEnd,
			lineDeflistBlockStart: this.host.lineDeflistBlockStart,
			lineDeflistBlockEnd: this.host.lineDeflistBlockEnd,
			addChild: (child) => this.host.addChild(child),
			mathRenderChildren: this.mathRenderChildren,
			calloutRenderChildren: this.calloutRenderChildren,
			tableRenderChildren: this.tableRenderChildren,
			deflistRenderChildren: this.deflistRenderChildren,
			embedRenderChildren: this.embedRenderChildren,
		};
	}

	renderLineFromSegments(
		lineEl: HTMLElement,
		lineRange: LineRange,
		segments: RenderSegment[],
		pending?:
			| {
					insertOffset: number;
					pendingText: string;
			  }
			| undefined,
		inlineWidgets?: InlineWidget[]
	): void {
		lineEl.replaceChildren();

		const mdKind = lineEl.dataset.mdKind ?? "";
		const widgetContext = this.getWidgetRenderContext();
		if (mdKind === "image-widget") {
			renderImageWidgetLine(widgetContext, lineEl, lineRange);
			return;
		}
		if (mdKind === "math-widget") {
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			renderMathWidgetLine(
				widgetContext,
				lineEl,
				lineRange,
				Number.isFinite(index) ? index : null
			);
			return;
		}
		if (mdKind === "math-hidden") {
			const eol = document.createElement("span");
			eol.className = "tategaki-sot-eol";
			eol.dataset.offset = String(lineRange.to);
			eol.textContent = "\u200b";
			lineEl.appendChild(eol);
			return;
		}
		if (mdKind === "callout-widget") {
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			renderCalloutWidgetLine(
				widgetContext,
				lineEl,
				lineRange,
				Number.isFinite(index) ? index : null
			);
			return;
		}
		if (mdKind === "callout-hidden") {
			const eol = document.createElement("span");
			eol.className = "tategaki-sot-eol";
			eol.dataset.offset = String(lineRange.to);
			eol.textContent = "\u200b";
			lineEl.appendChild(eol);
			return;
		}
		if (mdKind === "table-widget") {
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			renderTableWidgetLine(
				widgetContext,
				lineEl,
				lineRange,
				Number.isFinite(index) ? index : null
			);
			return;
		}
		if (mdKind === "table-hidden") {
			const eol = document.createElement("span");
			eol.className = "tategaki-sot-eol";
			eol.dataset.offset = String(lineRange.to);
			eol.textContent = "\u200b";
			lineEl.appendChild(eol);
			return;
		}
		if (mdKind === "deflist-widget") {
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			renderDeflistWidgetLine(
				widgetContext,
				lineEl,
				lineRange,
				Number.isFinite(index) ? index : null
			);
			return;
		}
		if (mdKind === "deflist-hidden") {
			const eol = document.createElement("span");
			eol.className = "tategaki-sot-eol";
			eol.dataset.offset = String(lineRange.to);
			eol.textContent = "\u200b";
			lineEl.appendChild(eol);
			return;
		}
		if (mdKind === "heading-hidden") {
			const eol = document.createElement("span");
			eol.className = "tategaki-sot-eol";
			eol.dataset.offset = String(lineRange.to);
			eol.textContent = "\u200b";
			lineEl.appendChild(eol);
			return;
		}
		if (mdKind === "embed-widget") {
			const index = Number.parseInt(lineEl.dataset.line ?? "", 10);
			renderEmbedWidgetLine(
				widgetContext,
				lineEl,
				lineRange,
				Number.isFinite(index) ? index : null
			);
			return;
		}
		if (mdKind === "table-row") {
			this.renderTableRowLine(
				lineEl,
				lineRange,
				segments,
				inlineWidgets ?? [],
				pending
			);
			return;
		}
		if (mdKind === "table-sep") {
			const sep = document.createElement("span");
			sep.className = "tategaki-md-table-sep-line";
			sep.textContent = "\u200b";
			lineEl.appendChild(sep);

			const eol = document.createElement("span");
			eol.className = "tategaki-sot-eol";
			eol.dataset.offset = String(lineRange.to);
			eol.textContent = "\u200b";
			lineEl.appendChild(eol);
			return;
		}

		const prefix = this.createLinePrefixElement(lineEl);
		if (prefix) {
			lineEl.appendChild(prefix);
		}

		this.renderInlineSegmentsWithWidgets(
			lineEl,
			lineRange,
			segments,
			inlineWidgets ?? [],
			pending
		);

		// CEモードで空行の場合、IME入力用のプレースホルダーを追加
		// IMEはテキストノード内にキャレットがある場合に正しく動作するため、
		// eol（display: inline-block）ではなく専用の入力用spanを使用する
		const isEmptyLine = lineRange.from === lineRange.to;
		if (this.ceImeMode && isEmptyLine) {
			const inputPlaceholder = document.createElement("span");
			inputPlaceholder.className = "tategaki-sot-ce-input-placeholder";
			inputPlaceholder.textContent = "\u200b";
			lineEl.appendChild(inputPlaceholder);
		}

		// 折りたたまれている見出しにellipsisインジケーターを追加
		if (mdKind === "heading" && lineEl.dataset.headingCollapsed === "1") {
			const ellipsis = document.createElement("span");
			ellipsis.className = "tategaki-md-heading-ellipsis";
			setIcon(ellipsis, "message-circle-more");

			// 折りたたまれたコンテンツのプレビューを取得
			const lineIndex = Number.parseInt(lineEl.dataset.line ?? "", 10);
			if (Number.isFinite(lineIndex)) {
				const previewText = this.getCollapsedContentPreview(
					lineIndex,
					3
				);
				if (previewText) {
					ellipsis.setAttribute("data-preview", previewText);

					// ツールチップ表示用のイベントハンドラ
					ellipsis.addEventListener("mouseenter", (e) => {
						this.showCollapsePreviewTooltip(
							e.target as HTMLElement,
							previewText
						);
					});
					ellipsis.addEventListener("mouseleave", () => {
						this.hideCollapsePreviewTooltip();
					});
				}
			}

			lineEl.appendChild(ellipsis);
		}

		const eol = document.createElement("span");
		eol.className = "tategaki-sot-eol";
		eol.dataset.offset = String(lineRange.to);
		eol.textContent = "\u200b";
		lineEl.appendChild(eol);
	}

	scheduleFinishRenderMath(): void {
		if (this.finishRenderMathTimer !== null) return;
		this.finishRenderMathTimer = window.setTimeout(() => {
			this.finishRenderMathTimer = null;
			finishRenderMath().catch(() => {});
		}, 0);
	}

	renderTableRowLine(
		lineEl: HTMLElement,
		lineRange: LineRange,
		segments: RenderSegment[],
		inlineWidgets: InlineWidget[],
		pending?:
			| {
					insertOffset: number;
					pendingText: string;
			  }
			| undefined
	): void {
		const lineText = this.getLineText(lineRange);
		const pipeOffsets = this.getTablePipeOffsets(lineText);
		const internalPipeCuts = pipeOffsets
			.filter((rel) => rel > 0 && rel < Math.max(0, lineText.length - 1))
			.map((rel) => lineRange.from + rel + 1);
		const cutOffsets = [lineRange.from, ...internalPipeCuts, lineRange.to]
			.filter((v, idx, arr) => arr.indexOf(v) === idx)
			.sort((a, b) => a - b);

		const splitAt = cutOffsets
			.slice(1, -1)
			.filter((o) => o > lineRange.from && o < lineRange.to);
		const sliced = this.splitSegmentsAtOffsets(segments, splitAt);

		const prefix = this.createLinePrefixElement(lineEl);
		if (prefix) {
			lineEl.appendChild(prefix);
		}

		const container = document.createElement("span");
		container.className = "tategaki-md-table-row-container";
		lineEl.appendChild(container);

		let segIndex = 0;
		for (let i = 0; i < cutOffsets.length - 1; i += 1) {
			const from = cutOffsets[i]!;
			const to = cutOffsets[i + 1]!;
			if (to <= from) continue;

			const cell = document.createElement("span");
			cell.className = "tategaki-md-table-cell";
			container.appendChild(cell);

			const cellSegs: RenderSegment[] = [];
			while (segIndex < sliced.length) {
				const seg = sliced[segIndex]!;
				if (seg.from < from) {
					segIndex += 1;
					continue;
				}
				if (seg.from >= to) break;
				cellSegs.push(seg);
				segIndex += 1;
			}
			const cellWidgets = (inlineWidgets ?? []).filter(
				(w) => w.from >= from && w.from < to
			);
			let cellPending:
				| {
						insertOffset: number;
						pendingText: string;
				  }
				| undefined;
			if (pending) {
				const insertOffset = Math.max(
					lineRange.from,
					Math.min(pending.insertOffset, lineRange.to)
				);
				if (insertOffset >= from && insertOffset <= to) {
					cellPending = {
						insertOffset,
						pendingText: pending.pendingText,
					};
				}
			}

			this.renderInlineSegmentsWithWidgets(
				cell,
				{ from, to },
				cellSegs,
				cellWidgets,
				cellPending
			);
		}
		const eol = document.createElement("span");
		eol.className = "tategaki-sot-eol";
		eol.dataset.offset = String(lineRange.to);
		eol.textContent = "\u200b";
		lineEl.appendChild(eol);
	}

	splitSegmentsAtOffsets(
		segments: RenderSegment[],
		offsets: number[]
	): RenderSegment[] {
		if (offsets.length === 0) return segments;
		const sorted = offsets
			.filter((v) => Number.isFinite(v))
			.map((v) => Math.floor(v))
			.filter((v, idx, arr) => arr.indexOf(v) === idx)
			.sort((a, b) => a - b);
		let remaining = segments;
		const result: RenderSegment[] = [];
		for (const cut of sorted) {
			const next: RenderSegment[] = [];
			for (const seg of remaining) {
				if (seg.to <= cut || seg.from >= cut) {
					next.push(seg);
					continue;
				}
				const split = this.splitSegmentsAtOffset([seg], cut);
				if (split.before.length > 0) result.push(...split.before);
				if (split.after.length > 0) next.push(...split.after);
			}
			remaining = next;
		}
		result.push(...remaining);
		return result;
	}
}
