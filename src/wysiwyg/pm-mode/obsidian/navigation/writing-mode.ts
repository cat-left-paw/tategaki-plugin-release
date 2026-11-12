// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/writingModeNavigationMapping.ts @ 020b5501 (2026-10-22)
// Local changes: tab indentation only (semicolon-free style kept). The arrow-to-operation mapping (B9) and every function are the same as the origin.
/** LOCAL-WINDOW-HORIZONTAL1: import-0 writing-mode navigation / logical-axis mapping。 */
export type SupportedEditorWritingMode = 'vertical-rl' | 'horizontal-tb'
export type WritingModeArrowOperation =
	| 'arrow-left'
	| 'arrow-right'
	| 'arrow-up'
	| 'arrow-down'
export type WritingModeArrowAxis = 'character' | 'line'
export type WritingModeArrowDirection = 'forward' | 'backward'
export type WritingModePhysicalAxis = 'x' | 'y'

export type WritingModeArrowMapping = {
	readonly axis: WritingModeArrowAxis
	readonly direction: WritingModeArrowDirection
	readonly granularity: WritingModeArrowAxis
}

const KEY_TO_OPERATION: Readonly<Record<string, WritingModeArrowOperation>> = {
	ArrowLeft: 'arrow-left',
	ArrowRight: 'arrow-right',
	ArrowUp: 'arrow-up',
	ArrowDown: 'arrow-down',
}

export function resolveSupportedEditorWritingMode(value: string): SupportedEditorWritingMode | null {
	return value === 'vertical-rl' || value === 'horizontal-tb' ? value : null
}

export function classifyWritingModeArrowKey(key: string): WritingModeArrowOperation | null {
	return KEY_TO_OPERATION[key] ?? null
}

export function writingModeArrowOperationToKey(
	operation: WritingModeArrowOperation,
): 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' {
	switch (operation) {
		case 'arrow-left': return 'ArrowLeft'
		case 'arrow-right': return 'ArrowRight'
		case 'arrow-up': return 'ArrowUp'
		case 'arrow-down': return 'ArrowDown'
	}
}

export function resolveWritingModeArrowMapping(
	writingMode: SupportedEditorWritingMode,
	operation: WritingModeArrowOperation,
): WritingModeArrowMapping {
	if (writingMode === 'horizontal-tb') {
		switch (operation) {
			case 'arrow-left': return { axis: 'character', direction: 'backward', granularity: 'character' }
			case 'arrow-right': return { axis: 'character', direction: 'forward', granularity: 'character' }
			case 'arrow-up': return { axis: 'line', direction: 'backward', granularity: 'line' }
			case 'arrow-down': return { axis: 'line', direction: 'forward', granularity: 'line' }
		}
	}
	switch (operation) {
		case 'arrow-up': return { axis: 'character', direction: 'backward', granularity: 'character' }
		case 'arrow-down': return { axis: 'character', direction: 'forward', granularity: 'character' }
		case 'arrow-left': return { axis: 'line', direction: 'forward', granularity: 'line' }
		case 'arrow-right': return { axis: 'line', direction: 'backward', granularity: 'line' }
	}
}

export function resolveWritingModeLogicalBlockAxis(
	writingMode: SupportedEditorWritingMode,
): WritingModePhysicalAxis {
	return writingMode === 'vertical-rl' ? 'x' : 'y'
}

export function isWritingModeCharacterAxisOperation(
	writingMode: SupportedEditorWritingMode,
	operation: WritingModeArrowOperation,
): boolean {
	return resolveWritingModeArrowMapping(writingMode, operation).axis === 'character'
}

export function isWritingModeLineAxisOperation(
	writingMode: SupportedEditorWritingMode,
	operation: WritingModeArrowOperation,
): boolean {
	return resolveWritingModeArrowMapping(writingMode, operation).axis === 'line'
}
