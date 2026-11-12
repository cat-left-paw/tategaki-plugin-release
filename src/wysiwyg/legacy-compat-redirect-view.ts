import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type TategakiV2Plugin from "../core/plugin";
import { debugWarn } from "../shared/logger";

/**
 * 互換モード（TipTap）は 1.4.0 で廃止した。1.3.5 以前で互換モードの leaf を開いたまま終了すると、workspace に
 * この 2 つの view type の leaf が残る。登録がないと Obsidian は「plugin が無効」の空の view を出すので、
 * 軽い受け口の view を 2 つの type で登録し、執筆・参照モードで開き直して自分を置き換える。
 *
 * 1.6.0 で（執筆・参照モードの削除と一緒に）この受け口も消す。
 *
 * 1.3.5 の互換モードの view は状態を保存しなかった（getState() は {}）ので、workspace から戻った leaf は file を知らない。
 * 開く file は、state に file の path があればそれ（将来の版のため）、なければ最後にアクティブだった file。
 * どちらもなければ、空の view を残さず閉じる。
 */
export const TIPTAP_COMPAT_VIEW_TYPE = "tategaki-tiptap-compat-view";
export const TIPTAP_COMPAT_VIEW_TYPE_LEGACY = "tategaki-tiptap-dev-view";

const REDIRECT_RETRY_LIMIT = 20;
const REDIRECT_RETRY_DELAY_MS = 50;

export class LegacyCompatRedirectView extends ItemView {
	private requestedPath: string | null = null;
	private redirected = false;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: TategakiV2Plugin,
		private readonly viewType: string,
	) {
		super(leaf);
	}

	getViewType(): string {
		return this.viewType;
	}

	getDisplayText(): string {
		return "Tategaki";
	}

	getIcon(): string {
		return "tally-4";
	}

	getState(): Record<string, never> {
		return {};
	}

	async setState(state: unknown, result: { history: boolean }): Promise<void> {
		const record = state as { filePath?: unknown; file?: unknown } | null;
		const candidate = record?.filePath ?? record?.file;
		if (typeof candidate === "string" && candidate.length > 0) {
			this.requestedPath = candidate;
		}
		await super.setState(state, result);
	}

	async onOpen(): Promise<void> {
		// Only reserve the work here. Obsidian calls onOpen from inside the leaf's own setViewState, and a setViewState called from there is ignored
		// (the leaf is "working"), and onLayoutReady calls its callback at once once the layout is ready. So the replacement runs after a timer.
		this.app.workspace.onLayoutReady(() => {
			this.reserve(0, 0);
		});
	}

	private reserve(delay: number, attempt: number): void {
		window.setTimeout(() => {
			void this.redirect(attempt);
		}, delay);
	}

	private resolveFile(): TFile | null {
		const byPath = (path: string | null | undefined): TFile | null => {
			if (!path) return null;
			const abstract = this.app.vault.getAbstractFileByPath(path);
			return abstract instanceof TFile ? abstract : null;
		};
		return (
			byPath(this.requestedPath) ??
			this.app.workspace.getActiveFile() ??
			byPath(this.app.workspace.getLastOpenFiles()[0])
		);
	}

	private async redirect(attempt: number): Promise<void> {
		if (this.redirected) return;
		// Closed or replaced before the reservation ran: nothing to do.
		if (this.leaf.view !== this) return;
		// The leaf is still inside its own setViewState: a setViewState now would be ignored. Try again a little later, a limited number of times.
		if ((this.leaf as { working?: boolean }).working === true && attempt < REDIRECT_RETRY_LIMIT) {
			this.reserve(REDIRECT_RETRY_DELAY_MS, attempt + 1);
			return;
		}
		this.redirected = true;
		try {
			const file = this.resolveFile();
			this.plugin.noteCompatModeRetired();
			if (file) {
				await this.plugin.modeManager.openSoTWysiwygViewInLeaf(file, this.leaf);
			} else {
				this.leaf.detach();
			}
		} catch (error) {
			debugWarn("Tategaki: failed to replace a retired compat mode leaf", error);
			try {
				this.leaf.detach();
			} catch (_) {
				// noop
			}
		}
	}
}
