import type { App } from "obsidian";

type AppWithOpenExternal = App & {
	openExternal?: (url: string) => Promise<unknown> | unknown;
};

type ElectronShell = {
	openExternal?: (url: string) => Promise<unknown> | unknown;
};

type ElectronModule = {
	shell?: ElectronShell;
};

type WindowWithRequire = Window & {
	require?: (id: string) => unknown;
};

export async function openExternalUrl(app: App, url: string): Promise<boolean> {
	const target = String(url || "").trim();
	if (!target) return false;

	try {
		const appWithOpenExternal = app as AppWithOpenExternal;
		if (typeof appWithOpenExternal.openExternal === "function") {
			await appWithOpenExternal.openExternal(target);
			return true;
		}
	} catch (_) {
		// noop
	}

	try {
		const requireFn = (window as WindowWithRequire).require;
		const electronModule = requireFn?.("electron") as
			| ElectronModule
			| undefined;
		const shell = electronModule?.shell;
		if (shell?.openExternal) {
			await shell.openExternal(target);
			return true;
		}
	} catch (_) {
		// noop
	}

	try {
		window.open(target, "_blank", "noopener,noreferrer");
		return true;
	} catch (_) {
		return false;
	}
}
