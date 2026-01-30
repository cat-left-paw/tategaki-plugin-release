import { Platform } from "obsidian";
import type { BlockLineDecoration, RenderSegment } from "./sot-render-types";

export type LineDecorationCacheEntry = {
	from: number;
	to: number;
	text: string;
	decoration: BlockLineDecoration;
};

export type LineSegmentCacheEntry = {
	from: number;
	to: number;
	text: string;
	kind: string;
	codeLang: string | null;
	isSource: boolean;
	rubyEnabled: boolean;
	segments: RenderSegment[];
};

export class SoTLineCache {
	private lineDecorationCache = new Map<number, LineDecorationCacheEntry>();
	private lineSegmentCache = new Map<number, LineSegmentCacheEntry>();

	shouldUseLineCache(): boolean {
		return !(Platform.isMobile || Platform.isMobileApp);
	}

	clear(): void {
		this.lineDecorationCache.clear();
		this.lineSegmentCache.clear();
	}

	getCachedBlockLineDecoration(
		lineIndex: number | null,
		lineFrom: number,
		lineTo: number,
		lineText: string,
		compute: () => BlockLineDecoration
	): BlockLineDecoration {
		if (!this.shouldUseLineCache() || lineIndex === null) {
			return compute();
		}
		const cached = this.lineDecorationCache.get(lineIndex);
		if (
			cached &&
			cached.from === lineFrom &&
			cached.to === lineTo &&
			cached.text === lineText
		) {
			return cached.decoration;
		}
		const decoration = compute();
		this.lineDecorationCache.set(lineIndex, {
			from: lineFrom,
			to: lineTo,
			text: lineText,
			decoration,
		});
		return decoration;
	}

	getCachedSegments(
		lineIndex: number | null,
		safeFrom: number,
		safeTo: number,
		lineText: string,
		lineKind: string,
		codeLang: string | null,
		isSource: boolean,
		rubyEnabled: boolean
	): RenderSegment[] | null {
		if (!this.shouldUseLineCache() || lineIndex === null) return null;
		const cached = this.lineSegmentCache.get(lineIndex);
		if (
			cached &&
			cached.from === safeFrom &&
			cached.to === safeTo &&
			cached.text === lineText &&
			cached.kind === lineKind &&
			cached.codeLang === codeLang &&
			cached.isSource === isSource &&
			cached.rubyEnabled === rubyEnabled
		) {
			return cached.segments;
		}
		return null;
	}

	storeSegments(
		lineIndex: number | null,
		safeFrom: number,
		safeTo: number,
		lineText: string,
		lineKind: string,
		codeLang: string | null,
		isSource: boolean,
		rubyEnabled: boolean,
		segments: RenderSegment[]
	): void {
		if (!this.shouldUseLineCache() || lineIndex === null) return;
		this.lineSegmentCache.set(lineIndex, {
			from: safeFrom,
			to: safeTo,
			text: lineText,
			kind: lineKind,
			codeLang,
			isSource,
			rubyEnabled,
			segments,
		});
	}

	purgeLineCaches(start: number, end: number, total: number): void {
		if (!this.shouldUseLineCache()) return;
		if (total <= 0) return;
		const buffer = 64;
		const safeStart = Math.max(0, start - buffer);
		const safeEnd = Math.min(total - 1, end + buffer);
		const shouldKeep = (index: number): boolean =>
			index >= safeStart && index <= safeEnd;

		const purgeCache = <T>(map: Map<number, T>): void => {
			for (const key of Array.from(map.keys())) {
				if (!shouldKeep(key)) {
					map.delete(key);
				}
			}
		};
		purgeCache(this.lineDecorationCache);
		purgeCache(this.lineSegmentCache);
	}
}
