// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/navigation/lineGeometry.ts @ 020b5501 (2026-10-22)
// Local changes: Only shown line nodes; detached caret reads use display-geometry (F6); shadow-aware hit testing; no layout cache across a write.
//   R4-2: `position()` also counts the end of a row with the `end` affinity as a candidate (Nyoze counts only `head`: a goal at the row's end stopped one glyph short).
import { createReadBatch } from './read-batch'
import type { PMNode, EditorView } from '../../pm/prosemirror'
import type { SupportedEditorWritingMode } from './writing-mode'
import { blockCenter, copyRect, inlineStart, readCaretRect, validRect, type CaretRect } from './geometry'
import type { NavigationAffinity } from './rules'
import { HIDDEN_LINE_KINDS } from '../../input/model-position'
import { positionAtPoint } from './point'

export type Textblock = { start: number; end: number }
type TextFragment = { text: Text; rect: CaretRect }
export type DisplayLine = { block: Textblock; index: number; rect: CaretRect; fragments: TextFragment[] }
export type LinePosition = { pos: number; affinity: NavigationAffinity }
const excludedText = 'rt,rp,.tategaki-aozora-ruby-rt,[data-nyoze-special-inline-boundary],.ProseMirror-widget,[contenteditable="false"]'

/** View-local inventory. Only PM block positions are cached; layout is read afresh. */
export function createLineGeometry(view: EditorView, mode: SupportedEditorWritingMode) {
	const reads = createReadBatch((key: string) => {
		const [pos, affinity] = key.split(':')
		return readCaretRect(view, Number(pos), mode, affinity as NavigationAffinity)
	})
	const read = (pos: number, affinity: NavigationAffinity) => reads.read(`${pos}:${affinity}`)
	let document: PMNode | null = null
	let blocks: Textblock[] = []
	const all = () => {
		if (document !== view.state.doc) {
			document = view.state.doc
			blocks = []
			document.descendants((node, pos) => {
				if (!node.isTextblock) return true
				if (node.type.name !== 'line' || HIDDEN_LINE_KINDS.has(String(node.attrs.kind))) return false
				blocks.push({ start: pos + 1, end: pos + node.nodeSize - 1 })
				return false
			})
		}
		return blocks
	}
	const blockAt = (pos: number) => {
		const list = all()
		let lo = 0, hi = list.length
		while (lo < hi) { const mid = (lo + hi) >>> 1; if (list[mid].end < pos) lo = mid + 1; else hi = mid }
		return list[lo]?.start <= pos ? list[lo] : null
	}
	const visible = (block: Textblock) => {
		const element = view.nodeDOM(block.start - 1) as HTMLElement | null
		if (!element?.getClientRects().length) return false
		const rect = element.getBoundingClientRect()
		return rect.width > 0 && rect.height > 0
	}
	const belongs = (rect: CaretRect, line: DisplayLine) => {
		const span = (r: CaretRect) => mode === 'vertical-rl' ? r.right - r.left : r.bottom - r.top
		return Math.abs(blockCenter(rect, mode) - blockCenter(line.rect, mode)) <= Math.max(1, Math.max(span(rect), span(line.rect)) / 2 + 0.5)
	}
	const enumerate = (block: Textblock): DisplayLine[] => {
		if (!visible(block)) return []
		const root = view.nodeDOM(block.start - 1), doc = view.dom.ownerDocument
		if (!root) return []
		const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT), pieces: TextFragment[] = []
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const text = node as Text
			// Unlike Nyoze's editable Host, the entire display root is contenteditable=false.
			const excluded = text.parentElement?.closest(excludedText)
			if (!text.length || (excluded && excluded !== view.dom)) continue
			const range = doc.createRange()
			range.selectNodeContents(text)
			for (const rect of Array.from(range.getClientRects()).filter(validRect)) pieces.push({ text, rect: copyRect(rect) })
		}
		// Establish the base glyph row first. Small mark / TCY fragments then join it.
		const span = (r: CaretRect) => mode === 'vertical-rl' ? r.right - r.left : r.bottom - r.top
		pieces.sort((a, b) => span(b.rect) - span(a.rect))
		const lines: DisplayLine[] = []
		for (const piece of pieces) {
			let line = lines.find(item => belongs(piece.rect, item))
			if (!line) { line = { block, index: 0, rect: copyRect(piece.rect), fragments: [] }; lines.push(line) }
			line.fragments.push(piece)
			if (mode === 'vertical-rl') { line.rect.top = Math.min(line.rect.top, piece.rect.top); line.rect.bottom = Math.max(line.rect.bottom, piece.rect.bottom) }
			else { line.rect.left = Math.min(line.rect.left, piece.rect.left); line.rect.right = Math.max(line.rect.right, piece.rect.right) }
		}
		if (!lines.length) {
			const rect = read(block.start, 'head')
			if (rect) lines.push({ block, index: 0, rect, fragments: [] })
		}
		lines.sort((a, b) => (blockCenter(a.rect, mode) - blockCenter(b.rect, mode)) * (mode === 'vertical-rl' ? -1 : 1))
		lines.forEach((line, index) => { line.index = index })
		return lines
	}
	const locate = (pos: number, affinity: NavigationAffinity) => {
		const block = blockAt(pos), rect = read(pos, affinity)
		if (!block || !rect) return null
		const lines = enumerate(block), line = lines.find(item => belongs(rect, item))
		return line ? { block, lines, line, rect } : null
	}
	const neighborBlock = (block: Textblock, direction: number) => {
		const list = all()
		for (let i = list.indexOf(block) + direction; i >= 0 && i < list.length; i += direction) if (visible(list[i])) return list[i]
		return null
	}
	/**
	 * R3-1: the visible text blocks beyond a position that is not visible text (a part taller than a page, a rule), nearest first, in document order
	 * in the paging direction (direction > 0: after it; < 0: before it). A block that holds the position itself is not one of them.
	 */
	function* blocksBeyond(pos: number, direction: number): Generator<Textblock> {
		const list = all()
		let lo = 0, hi = list.length
		while (lo < hi) { const mid = (lo + hi) >>> 1; if (list[mid].end < pos) lo = mid + 1; else hi = mid }
		const holds = list[lo]?.start <= pos
		for (let i = direction > 0 ? (holds ? lo + 1 : lo) : lo - 1; i >= 0 && i < list.length; i += direction) if (visible(list[i])) yield list[i]
	}
	const neighbor = (current: NonNullable<ReturnType<typeof locate>>, direction: number) => {
		const line = current.lines[current.line.index + direction]
		if (line) return line
		const block = neighborBlock(current.block, direction)
		if (!block) return null
		const lines = enumerate(block)
		return direction > 0 ? lines[0] ?? null : lines[lines.length - 1] ?? null
	}
	const accept = (pos: number, line: DisplayLine, affinity: NavigationAffinity) => {
		if (pos < line.block.start || pos > line.block.end) return false
		const rect = read(pos, affinity)
		return !!rect && belongs(rect, line)
	}
	const bounds = (fragment: TextFragment, line: DisplayLine) => {
		const text = fragment.text, range = view.dom.ownerDocument.createRange()
		if (text.parentElement?.closest('[data-tategaki-tcy]')) return { from: 0, to: text.length }
		const sign = mode === 'vertical-rl' ? -1 : 1, target = blockCenter(line.rect, mode) * sign
		const lower = (strict: boolean) => {
			let lo = 0, hi = text.length
			while (lo < hi) {
				const mid = (lo + hi) >>> 1
				range.setStart(text, mid); range.setEnd(text, mid + 1)
				const rect = range.getBoundingClientRect(), onLine = belongs(rect, line)
				if ((!onLine && blockCenter(rect, mode) * sign < target) || (strict && onLine)) lo = mid + 1
				else hi = mid
			}
			return lo
		}
		return { from: lower(false), to: lower(true) }
	}
	const position = (line: DisplayLine, goal: number, edge?: 'home' | 'end'): LinePosition | null => {
		if (!line.fragments.length) {
			const stops = [line.block.start, line.block.end].filter(pos => accept(pos, line, 'head'))
			const distance = (pos: number) => { const rect = read(pos, 'head'); return rect ? Math.abs(inlineStart(rect, mode) - goal) : Infinity }
			stops.sort((a, b) => edge === 'home' ? a - b : edge === 'end' ? b - a
				: distance(a) - distance(b))
			return stops.length ? { pos: stops[0], affinity: edge === 'end' ? 'end' : 'head' } : null
		}
		// Hit testing exactly on a row's inline start can return the second caret
		// (notably after an empty paragraph). Resolve that endpoint by DOM bounds.
		if (!edge && goal <= inlineStart(line.rect, mode) + 0.5) edge = 'home'
		const affinity: NavigationAffinity = edge === 'end' ? 'end' : 'head'
		// R4-2: a candidate carries its own affinity. The end of a row that wraps is also the start of the next row: with the `head` affinity it belongs to
		// the next row, with the `end` affinity to this one, so a goal at the row's end needs the second to reach it.
		const candidates = new Map<string, { pos: number; affinity: NavigationAffinity; rect: CaretRect }>()
		const add = (pos: number, at: NavigationAffinity = affinity) => {
			if (!accept(pos, line, at)) return
			const rect = read(pos, at)
			if (rect) candidates.set(pos + ':' + at, { pos, affinity: at, rect })
		}
		// The hit is only a candidate: never accept a result in another column or block.
		if (!edge) {
			const cross = blockCenter(line.rect, mode)
			const hitPos = positionAtPoint(view, mode === 'vertical-rl' ? cross : goal, mode === 'vertical-rl' ? goal : cross)
			const hit = hitPos === null ? null : { pos: hitPos }
			if (hit && accept(hit.pos, line, affinity)) return { pos: hit.pos, affinity }
		}
		for (const fragment of line.fragments) {
			const { from, to } = bounds(fragment, line)
			if (from >= to) continue
			const start = view.posAtDOM(fragment.text, from, -1), end = view.posAtDOM(fragment.text, to, 1)
			add(start); add(end)
			if (!edge) add(end, 'end')
			if (edge) continue
			let lo = start, hi = end
			while (lo < hi) {
				const mid = (lo + hi) >>> 1, rect = read(mid, affinity)
				if (rect && belongs(rect, line) && inlineStart(rect, mode) < goal) lo = mid + 1
				else hi = mid
			}
			for (const pos of [lo - 1, lo, lo + 1]) if (pos >= start && pos <= end) add(pos)
		}
		const sorted = [...candidates.values()].sort((a, b) => edge === 'home' ? a.pos - b.pos : edge === 'end' ? b.pos - a.pos
			: Math.abs(inlineStart(a.rect, mode) - goal) - Math.abs(inlineStart(b.rect, mode) - goal) || b.pos - a.pos || (a.affinity === 'head' ? -1 : 1) - (b.affinity === 'head' ? -1 : 1))
		return sorted.length ? { pos: sorted[0].pos, affinity: sorted[0].affinity } : null
	}
	return { beginReadBatch: reads.begin, endReadBatch: reads.end, read, all, blockAt, visible, enumerate, locate, neighbor, neighborBlock, blocksBeyond, accept, position }
}
