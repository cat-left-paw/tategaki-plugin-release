import {
	handleListOutlinerKeydown,
	runListOutlinerAction,
	type SoTListOutlinerHost,
} from "./sot-list-outliner";

export type SoTListOutlinerAction = "move-up" | "move-down";

export type SoTListOutlinerCeBridgeHost = {
	sourceModeEnabled: boolean;
	ceImeMode: boolean;
	ceImeComposing: boolean;
	getListOutlinerHost: () => SoTListOutlinerHost | null;
	syncSelectionFromCe: () => { anchor: number; head: number } | null;
	syncSelectionToCe: () => void;
	runCeMutation: (action: () => void) => void;
};

function runWithCeSelectionSync(
	host: SoTListOutlinerCeBridgeHost,
	runner: (outlinerHost: SoTListOutlinerHost) => boolean,
): boolean {
	if (host.sourceModeEnabled) return false;
	const outlinerHost = host.getListOutlinerHost();
	if (!outlinerHost) return false;
	if (!host.ceImeMode) {
		return runner(outlinerHost);
	}
	if (host.ceImeComposing) return false;
	if (!host.syncSelectionFromCe()) return false;
	let applied = false;
	host.runCeMutation(() => {
		applied = runner(outlinerHost);
	});
	if (applied) {
		host.syncSelectionToCe();
	}
	return applied;
}

export function handleListOutlinerKeydownForCe(
	host: SoTListOutlinerCeBridgeHost,
	event: KeyboardEvent,
): boolean {
	return runWithCeSelectionSync(host, (outlinerHost) =>
		handleListOutlinerKeydown(outlinerHost, event),
	);
}

export function runListOutlinerActionForCe(
	host: SoTListOutlinerCeBridgeHost,
	action: SoTListOutlinerAction,
): boolean {
	return runWithCeSelectionSync(host, (outlinerHost) =>
		runListOutlinerAction(outlinerHost, action),
	);
}
