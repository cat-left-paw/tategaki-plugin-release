import type { Node as PMNode } from "@tiptap/pm/model";
import {
	computeSoTCollapsePreviewTooltipPosition,
	resolveSoTCollapsePreviewTooltipHost,
} from "../sot/sot-collapse-preview-tooltip";

export function buildCompatHeadingFoldPreviewText(
	doc: PMNode,
	range: { from: number; to: number } | null,
	options: {
		maxLines?: number;
		maxChars?: number;
	} = {},
): string | null {
	if (!range || range.to <= range.from) return null;
	const maxLines = Math.max(1, options.maxLines ?? 3);
	const maxChars = Math.max(1, options.maxChars ?? 180);
	const rawText = doc
		.textBetween(range.from, range.to, "\n", " ")
		.replace(/\u200b/g, "")
		.trim();
	if (!rawText) return null;
	const lines = rawText
		.split(/\r?\n+/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.slice(0, maxLines);
	if (lines.length === 0) return null;

	let remaining = maxChars;
	const previewLines: string[] = [];
	for (const line of lines) {
		if (remaining <= 0) break;
		const sliceLength = Math.min(line.length, remaining);
		const chunk = line.slice(0, sliceLength);
		if (chunk.length === 0) continue;
		previewLines.push(chunk);
		remaining -= chunk.length;
	}
	if (previewLines.length === 0) return null;

	const preview = previewLines.join("\n");
	return preview.length < rawText.length ? `${preview}...` : preview;
}

export class CompatHeadingFoldPreviewController {
	private tooltipEl: HTMLElement | null = null;
	private tooltipDoc: Document | null = null;
	private tooltipView: Window | null = null;
	private readonly hideOnScroll = (): void => this.hide();
	private readonly hideOnResize = (): void => this.hide();

	show(target: HTMLElement, text: string): void {
		const trimmed = text.trim();
		if (!trimmed) {
			this.hide();
			return;
		}
		this.hide();

		const tooltipHost = resolveSoTCollapsePreviewTooltipHost(target);
		const tooltip = tooltipHost.doc.createElement("div");
		tooltip.className = "tategaki-collapse-preview-tooltip";
		tooltip.textContent = trimmed;
		tooltipHost.containerEl.appendChild(tooltip);

		const position = computeSoTCollapsePreviewTooltipPosition({
			targetRect: target.getBoundingClientRect(),
			tooltipRect: tooltip.getBoundingClientRect(),
			viewportWidth: tooltipHost.viewportWidth,
			viewportHeight: tooltipHost.viewportHeight,
		});
		tooltip.style.left = `${position.left}px`;
		tooltip.style.top = `${position.top}px`;

		this.tooltipEl = tooltip;
		this.tooltipDoc = tooltipHost.doc;
		this.tooltipView = tooltipHost.doc.defaultView ?? window;
		this.tooltipDoc.addEventListener("scroll", this.hideOnScroll, true);
		this.tooltipView.addEventListener("resize", this.hideOnResize);
	}

	hide(): void {
		if (this.tooltipDoc) {
			this.tooltipDoc.removeEventListener("scroll", this.hideOnScroll, true);
		}
		if (this.tooltipView) {
			this.tooltipView.removeEventListener("resize", this.hideOnResize);
		}
		if (this.tooltipEl) {
			this.tooltipEl.remove();
		}
		this.tooltipEl = null;
		this.tooltipDoc = null;
		this.tooltipView = null;
	}

	destroy(): void {
		this.hide();
	}
}
