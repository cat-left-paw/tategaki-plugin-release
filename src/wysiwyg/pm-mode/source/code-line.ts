// Copied from src/wysiwyg/sot-wysiwyg-view.ts (V:4654-4744) @ d65c4c7 (2026-10-17).
// Local changes: Replace the method with an exported pure function.
import { lowlight } from "lowlight";
import type { RenderSegment, HighlightNode } from "./types";
export function buildCodeLineSegments(
	absFrom: number,
	absTo: number,
	lineText: string,
	lang: string | null,
): RenderSegment[] {
	// コードブロックは「表示＝ハイライト」「編集＝ソース」の方針に寄せるため、
	// ここでは行単位で lowlight(hljs) を適用する。
	// 注意: 行単位のため、複数行コメント等の状態は完全一致しない場合がある。
	if (lineText.length === 0) return [];
	const fallback: RenderSegment[] = [
		{
			from: absFrom,
			to: absTo,
			text: lineText,
			classNames: ["tategaki-sot-run"],
		},
	];
	const language = lang?.trim() ? lang.trim() : null;

	let root: HighlightNode;
	try {
		if (language && lowlight.registered(language)) {
			root = lowlight.highlight(language, lineText);
		} else if (language) {
			// 例えば `ts` / `js` / `c++` などの別名があるので auto も試す
			root = lowlight.highlightAuto(lineText);
		} else {
			root = lowlight.highlightAuto(lineText);
		}
	} catch (_) {
		return fallback;
	}

	const segments: RenderSegment[] = [];
	let cursor = absFrom;

	const pushText = (text: string, classes: string[]) => {
		if (text.length === 0) return;
		const from = cursor;
		const to = Math.min(absTo, from + text.length);
		if (to <= from) return;
		const slice = text.slice(0, to - from);
		const classNames = ["tategaki-sot-run", ...classes];
		segments.push({
			from,
			to,
			text: slice,
			classNames,
		});
		cursor = to;
	};

	const walk = (
		node: HighlightNode | null | undefined,
		classStack: string[],
	) => {
		if (!node) return;
		const type = node.type;
		if (type === "text") {
			pushText(String(node.value ?? ""), classStack);
			return;
		}
		if (type === "element") {
			const cls = node.properties?.className;
			const classes = Array.isArray(cls)
				? cls.map((c) => String(c))
				: typeof cls === "string"
					? cls.split(/\s+/).filter((c: string) => c.length > 0)
					: [];
			const nextStack = classStack.concat(classes);
			for (const child of node.children ?? []) {
				walk(child, nextStack);
			}
			return;
		}
		for (const child of node.children ?? []) {
			walk(child, classStack);
		}
	};

	for (const child of root?.children ?? []) {
		walk(child, []);
	}

	// lowlight の出力が元テキストと一致しない場合は安全側に倒す
	if (cursor !== absFrom + lineText.length) {
		return fallback;
	}
	return segments.length > 0 ? segments : fallback;
}
