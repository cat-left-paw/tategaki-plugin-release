// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/navigation/readBatch.ts @ 020b5501 (2026-10-22)
// Local changes: tab indentation; `values.get(key)!` (non-null assertion) is `as V`. No import, no other code change.
/** Cache only pure geometry reads before a navigation's first DOM write. */
export function createReadBatch<K, V>(read: (key: K) => V) {
	let values: Map<K, V> | null = null
	return {
		begin() { values = new Map() },
		end() { values = null },
		read(key: K): V {
			if (!values) return read(key)
			if (!values.has(key)) values.set(key, read(key))
			return values.get(key) as V
		},
	}
}
