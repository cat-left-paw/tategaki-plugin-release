// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/navigation/keyOperation.ts @ 020b5501 (2026-10-22)
// Local changes: Local module paths and tab indentation; rules and H3 key table unchanged.
import type { SurfaceKey } from '../../input/surface-state'
import type { SupportedEditorWritingMode } from './writing-mode'
import { navigationOp, type NavigationOp } from './rules'

/** Explicit, bounded modifier support. Word/platform commands remain an I8 handoff. */
export function resolveNavigationKey(event: SurfaceKey, mode: SupportedEditorWritingMode, mac: boolean): NavigationOp | null {
	if (!event.metaKey && !event.ctrlKey && !event.altKey) {
		// CGEvent/native uses the writing mode for Shift and ranges too. Playwright's
		// macOS editing commands are not an oracle for those Chromium-owned keys.
		const op = navigationOp(event.key, event.shiftKey, mode)
		// macOS Shift+Home/End are document boundaries, unlike Nyoze's bare two-stage command.
		if (op && mac && event.shiftKey && op.axis === 'line-edge') return { ...op, axis: 'document' }
		return op
	}
	const extend = event.shiftKey
	if ((mac && (mode === 'vertical-rl' || extend) && event.metaKey && !event.ctrlKey && !event.altKey && /^Arrow(Up|Down)$/.test(event.key)) ||
		(!mac && event.ctrlKey && !event.metaKey && !event.altKey && /^(Home|End)$/.test(event.key))) {
		return { axis: 'document', direction: /Down|End/.test(event.key) ? 'forward' : 'backward', extend }
	}
	if (mac && event.metaKey && !event.ctrlKey && !event.altKey && /^Arrow(Left|Right)$/.test(event.key) && mode === 'horizontal-tb') {
		return { axis: 'line-edge', direction: event.key === 'ArrowRight' ? 'forward' : 'backward', extend, visualOnly: true }
	}
	return null
}
