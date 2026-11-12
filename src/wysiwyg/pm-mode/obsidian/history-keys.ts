/** K10: Obsidian's platform chords, intentionally narrower than input/classifyHistoryChord from Nyoze. */
export function classifyPmHistoryChord(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, mac: boolean): "undo" | "redo" | null {
	const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
	return !event.altKey && mod && /^z$/i.test(event.key) ? event.shiftKey ? "redo" : "undo"
		: !mac && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && /^y$/i.test(event.key) ? "redo" : null;
}
