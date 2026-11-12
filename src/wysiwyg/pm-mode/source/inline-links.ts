// Copied from src/wysiwyg/sot-wysiwyg-view.ts (V:2549-2555, 2574-3025) @ d65c4c7 (2026-10-17).
// Local changes: Pass linkReferenceMap through the line model instead of this.
// Local changes: Remove redundant non-null assertions on bounds-checked indexes (lint).
import type { SoTLineModelState } from "../../sot/sot-line-model";
import type { HiddenRange, InlineRange, InlineStyleClass, LinkRange } from "./types";
export function normalizeLinkLabel(label: string): string {
	return label
		.replace(/\\(.)/g, "$1")
		.trim()
		.replace(/\s+/g, " ")
		.toLowerCase();
}

export function collectLinkRangesForLine(
	absFrom: number,
	absTo: number,
	lineText: string,
	hidden: HiddenRange[],
	styles: InlineRange[],
	links: LinkRange[],
	model: SoTLineModelState,
): void {
	// Markdownのリンク記法は環境差で構文木が取りにくいため、行内の最小パーサで隠す/装飾する。
	// 対象:
	// - `[text](url)`（画像 `![alt](url)` は除外）
	// - 参照リンク `[text][id]` / `[text][]` / `[text]`
	// - 自動リンク `<https://...>` / `<mail@...>`
	// - `[[target]]` / `[[target|alias]]` / `![[...]]`（埋め込みもとりあえずリンク扱い）
	const clampRel = (rel: number): number =>
		Math.max(0, Math.min(rel, lineText.length));
	const pushHiddenRel = (relFrom: number, relTo: number): void => {
		const from = absFrom + clampRel(relFrom);
		const to = absFrom + clampRel(relTo);
		if (to <= from) return;
		hidden.push({ from, to });
	};
	const pushStyledRel = (
		relFrom: number,
		relTo: number,
		className: InlineStyleClass,
		href?: string,
	): void => {
		const from = absFrom + clampRel(relFrom);
		const to = absFrom + clampRel(relTo);
		if (to <= from) return;
		styles.push({ from, to, className });
		if (href) {
			links.push({ from, to, href });
		}
	};
	const isEscaped = (index: number): boolean => {
		// 直前のバックスラッシュが奇数個ならエスケープ
		let backslashes = 0;
		for (let i = index - 1; i >= 0; i -= 1) {
			if (lineText[i] !== "\\") break;
			backslashes += 1;
		}
		return backslashes % 2 === 1;
	};

	const parseLinkDestination = (raw: string): string => {
		const trimmed = raw.trim();
		if (trimmed.length === 0) return "";
		if (trimmed.startsWith("<")) {
			const end = trimmed.indexOf(">");
			if (end > 1) return trimmed.slice(1, end);
		}
		// タイトル `"..."` / `'...'` は一旦無視し、先頭トークンだけ使う
		const m = /^[^\s]+/.exec(trimmed);
		return m?.[0] ?? trimmed;
	};

	let inCodeFenceLen: number | null = null;
	const len = lineText.length;
	for (let i = 0; i < len; i += 1) {
		const ch = lineText[i];
		if (ch === "`" && !isEscaped(i)) {
			let fenceLen = 1;
			while (i + fenceLen < len && lineText[i + fenceLen] === "`") {
				fenceLen += 1;
			}
			if (inCodeFenceLen === null) {
				inCodeFenceLen = fenceLen;
			} else if (inCodeFenceLen === fenceLen) {
				inCodeFenceLen = null;
			}
			i += fenceLen - 1;
			continue;
		}
		if (inCodeFenceLen !== null) continue;

		// 自動リンク: <https://...> / <mail@...>
		if (ch === "<") {
			const close = lineText.indexOf(">", i + 1);
			if (close > i + 1) {
				const inside = lineText.slice(i + 1, close);
				if (!/\s/.test(inside)) {
					const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(inside);
					const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
						inside,
					);
					if (isUrl || isEmail) {
						const href = isEmail ? `mailto:${inside}` : inside;
						pushHiddenRel(i, i + 1);
						pushHiddenRel(close, close + 1);
						pushStyledRel(
							i + 1,
							close,
							"tategaki-md-link",
							href,
						);
						i = close;
						continue;
					}
				}
			}
		}

		// `![alt](url)`（画像）
		if (
			ch === "!" &&
			!isEscaped(i) &&
			i + 1 < len &&
			lineText[i + 1] === "["
		) {
			// alt の `]` を探す（ネスト考慮）
			let depth = 1;
			let closeBracket = -1;
			for (let j = i + 2; j < len; j += 1) {
				const c = lineText[j];
				if (c === "\\" && j + 1 < len) {
					j += 1;
					continue;
				}
				if (c === "[" && !isEscaped(j)) depth += 1;
				if (c === "]" && !isEscaped(j)) {
					depth -= 1;
					if (depth === 0) {
						closeBracket = j;
						break;
					}
				}
			}
			if (closeBracket === -1) continue;
			let k = closeBracket + 1;
			while (k < len && /\s/.test(lineText[k])) k += 1;
			if (k >= len || lineText[k] !== "(") continue;
			const openParen = k;
			let parenDepth = 1;
			let closeParen = -1;
			for (let j = openParen + 1; j < len; j += 1) {
				const c = lineText[j];
				if (c === "\\" && j + 1 < len) {
					j += 1;
					continue;
				}
				if (c === "(" && !isEscaped(j)) parenDepth += 1;
				if (c === ")" && !isEscaped(j)) {
					parenDepth -= 1;
					if (parenDepth === 0) {
						closeParen = j;
						break;
					}
				}
			}
			if (closeParen === -1) continue;

			const altRelFrom = i + 2;
			const altRelTo = closeBracket;
			const destRaw = lineText.slice(openParen + 1, closeParen);
			const href = parseLinkDestination(destRaw);

			// `![` と `](url)` を隠す（alt だけ残す）
			pushHiddenRel(i, i + 2);
			pushHiddenRel(closeBracket, closeParen + 1);

			if (altRelTo > altRelFrom) {
				pushStyledRel(
					altRelFrom,
					altRelTo,
					"tategaki-md-image",
					href || undefined,
				);
			} else if (href) {
				// alt が空の場合は URL を残す（入力とマッピングを壊さないため）
				const hrefRelFrom = openParen + 1;
				const hrefRelTo = closeParen;
				pushStyledRel(
					hrefRelFrom,
					hrefRelTo,
					"tategaki-md-image",
					href,
				);
				// `](` と `)` は隠すが、中身は残す
				pushHiddenRel(closeBracket, openParen + 1);
				pushHiddenRel(closeParen, closeParen + 1);
			}
			i = closeParen;
			continue;
		}

		// `![[...]]`
		if (
			ch === "!" &&
			!isEscaped(i) &&
			i + 2 < len &&
			lineText.slice(i + 1, i + 3) === "[["
		) {
			const open = i + 1;
			const close = lineText.indexOf("]]", open + 2);
			if (close === -1) continue;
			const content = lineText.slice(open + 2, close);
			const pipe = content.indexOf("|");
			const rawTarget = pipe >= 0 ? content.slice(0, pipe) : content;
			const rawAlias = pipe >= 0 ? content.slice(pipe + 1) : null;
			const target = rawTarget.trim();
			const display =
				rawAlias !== null && rawAlias.length > 0
					? rawAlias
					: rawTarget;
			const displayStartRel =
				rawAlias !== null ? open + 2 + pipe + 1 : open + 2;
			const displayEndRel = displayStartRel + display.length;

			pushHiddenRel(i, i + 1); // `!`
			pushHiddenRel(open, open + 2); // `[[`
			pushHiddenRel(close, close + 2); // `]]`
			if (pipe >= 0) {
				// target と `|` を隠す
				pushHiddenRel(open + 2, open + 2 + pipe + 1);
			}
			if (target.length > 0) {
				const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(
					target,
				);
				pushStyledRel(
					displayStartRel,
					displayEndRel,
					isImage ? "tategaki-md-image" : "tategaki-md-embed",
					target,
				);
			}
			i = close + 1;
			continue;
		}

		// `[[...]]`
		if (
			ch === "[" &&
			!isEscaped(i) &&
			i + 1 < len &&
			lineText[i + 1] === "["
		) {
			const open = i;
			const close = lineText.indexOf("]]", open + 2);
			if (close === -1) continue;
			const content = lineText.slice(open + 2, close);
			const pipe = content.indexOf("|");
			const rawTarget = pipe >= 0 ? content.slice(0, pipe) : content;
			const rawAlias = pipe >= 0 ? content.slice(pipe + 1) : null;
			const target = rawTarget.trim();
			const display =
				rawAlias !== null && rawAlias.length > 0
					? rawAlias
					: rawTarget;
			const displayStartRel =
				rawAlias !== null ? open + 2 + pipe + 1 : open + 2;
			const displayEndRel = displayStartRel + display.length;

			pushHiddenRel(open, open + 2); // `[[`
			pushHiddenRel(close, close + 2); // `]]`
			if (pipe >= 0) {
				// target と `|` を隠す
				pushHiddenRel(open + 2, open + 2 + pipe + 1);
			}
			if (target.length > 0) {
				pushStyledRel(
					displayStartRel,
					displayEndRel,
					"tategaki-md-link",
					target,
				);
			}
			i = close + 1;
			continue;
		}

		// `[^id]`（脚注参照）
		if (
			ch === "[" &&
			!isEscaped(i) &&
			i + 2 < len &&
			lineText[i + 1] === "^"
		) {
			const close = lineText.indexOf("]", i + 2);
			if (close === -1) continue;
			const id = lineText.slice(i + 2, close);
			if (id.length === 0) continue;
			// `[` `^` `]` を隠して id だけ残す
			pushHiddenRel(i, i + 2);
			pushHiddenRel(close, close + 1);
			pushStyledRel(i + 2, close, "tategaki-md-footnote-ref");
			i = close;
			continue;
		}

		// `[text](url)`（画像 `![alt](url)` は除外）
		if (ch === "[" && !isEscaped(i)) {
			if (i > 0 && lineText[i - 1] === "!" && !isEscaped(i - 1)) {
				continue;
			}
			// link text の `]` を探す（ネスト考慮）
			let depth = 1;
			let closeBracket = -1;
			for (let j = i + 1; j < len; j += 1) {
				const c = lineText[j];
				if (c === "\\" && j + 1 < len) {
					j += 1;
					continue;
				}
				if (c === "[" && !isEscaped(j)) depth += 1;
				if (c === "]" && !isEscaped(j)) {
					depth -= 1;
					if (depth === 0) {
						closeBracket = j;
						break;
					}
				}
			}
			if (closeBracket === -1) continue;
			let k = closeBracket + 1;
			while (k < len && /\s/.test(lineText[k])) k += 1;
			const linkTextRelFrom = i + 1;
			const linkTextRelTo = closeBracket;
			let handled = false;

			if (k < len && lineText[k] === "(") {
				const openParen = k;
				// url の `)` を探す（括弧ネストを少し考慮）
				let parenDepth = 1;
				let closeParen = -1;
				for (let j = openParen + 1; j < len; j += 1) {
					const c = lineText[j];
					if (c === "\\" && j + 1 < len) {
						j += 1;
						continue;
					}
					if (c === "(" && !isEscaped(j)) parenDepth += 1;
					if (c === ")" && !isEscaped(j)) {
						parenDepth -= 1;
						if (parenDepth === 0) {
							closeParen = j;
							break;
						}
					}
				}
				if (closeParen !== -1) {
					const destRaw = lineText.slice(
						openParen + 1,
						closeParen,
					);
					const href = parseLinkDestination(destRaw);
					// `[` と `](url)` を隠す（間のリンクテキストだけ残す）
					pushHiddenRel(i, i + 1);
					pushHiddenRel(closeBracket, closeParen + 1);
					if (href.length > 0) {
						pushStyledRel(
							linkTextRelFrom,
							linkTextRelTo,
							"tategaki-md-link",
							href,
						);
					}
					i = closeParen;
					handled = true;
				}
			} else if (k < len && lineText[k] === "[") {
				const refOpen = k;
				const refClose = lineText.indexOf("]", refOpen + 1);
				if (refClose !== -1) {
					const rawLabel = lineText.slice(refOpen + 1, refClose);
					const refLabel =
						rawLabel.length > 0
							? rawLabel
							: lineText.slice(
									linkTextRelFrom,
									linkTextRelTo,
								);
					const href = model.linkReferenceMap.get(
						normalizeLinkLabel(refLabel),
					);
					if (href) {
						pushHiddenRel(i, i + 1);
						pushHiddenRel(closeBracket, closeBracket + 1);
						pushHiddenRel(refOpen, refClose + 1);
						pushStyledRel(
							linkTextRelFrom,
							linkTextRelTo,
							"tategaki-md-link",
							href,
						);
						i = refClose;
						handled = true;
					}
				}
			} else {
				const refLabel = lineText.slice(
					linkTextRelFrom,
					linkTextRelTo,
				);
				const href = model.linkReferenceMap.get(
					normalizeLinkLabel(refLabel),
				);
				if (href) {
					pushHiddenRel(i, i + 1);
					pushHiddenRel(closeBracket, closeBracket + 1);
					pushStyledRel(
						linkTextRelFrom,
						linkTextRelTo,
						"tategaki-md-link",
						href,
					);
					i = closeBracket;
					handled = true;
				}
			}
			if (handled) continue;
		}

		// `^[text]`（インライン脚注）
		if (
			ch === "^" &&
			!isEscaped(i) &&
			i + 1 < len &&
			lineText[i + 1] === "["
		) {
			let close = -1;
			for (let j = i + 2; j < len; j += 1) {
				if (lineText[j] !== "]") continue;
				if (isEscaped(j)) continue;
				close = j;
				break;
			}
			if (close === -1) continue;
			if (close <= i + 2) {
				i = close;
				continue;
			}
			// `^[` と `]` を隠して本文だけ残す
			pushHiddenRel(i, i + 2);
			pushHiddenRel(close, close + 1);
			pushStyledRel(i + 2, close, "tategaki-md-footnote-inline");
			i = close;
			continue;
		}
	}

	// 行の範囲外に出ていたら安全側に落とす
	const clampedHidden: HiddenRange[] = [];
	for (const r of hidden) {
		const from = Math.max(absFrom, Math.min(r.from, absTo));
		const to = Math.max(absFrom, Math.min(r.to, absTo));
		if (to > from) clampedHidden.push({ from, to });
	}
	hidden.splice(0, hidden.length, ...clampedHidden);
}
