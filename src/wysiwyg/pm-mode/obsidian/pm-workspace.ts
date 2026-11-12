// Copied from src/wysiwyg/sot/sot-workspace-controller.ts (391-436, 438-447, 449-471, 473-489, 491-543, 545-551, 553-577, 579-584, 586-614, 616-628, 630-638) @ 3603e14 (2026-10-17).
// Local changes: PM host/notice/badges; omit file switching, recent files, editor adapter and focus work.
// Local changes: Notify once for every pair-loss path; use ownerDocument and nodeType for popout-safe badge lookup.
// Local changes: The badge's own look is in styles.css (`.tategaki-pm-paired-badge`, `.tategaki-pm-tab-badge`; 1.4.0 moved it from an inline cssText).
// Local changes: Enter editing at pair construction while preserving the leaf editing preference.
import { requireMarkdownEditingMode } from "../../sot/markdown-editing-mode";
import { MarkdownView, Notice, setIcon, type App, type TFile, type WorkspaceLeaf } from "obsidian";
import type { EditorView as CmView } from "@codemirror/view";
import { t } from "../../../shared/i18n";

type LeafWithTabHeader = WorkspaceLeaf & { tabHeaderEl?: HTMLElement; tabHeader?: { el?: HTMLElement }; containerEl?: HTMLElement; id?: string };
type MarkdownViewWithCodeMirror = MarkdownView & { editor: MarkdownView["editor"] & { cm?: CmView } };
export interface PmWorkspaceHost {
	app: App;
	containerEl: HTMLElement;
	leaf: WorkspaceLeaf;
	currentFile: TFile | null;
	pairedMarkdownLeaf: WorkspaceLeaf | null;
	pairedMarkdownView: MarkdownView | null;
	pairedMarkdownBadgeLeaf: WorkspaceLeaf | null;
	pairedMarkdownBadgeEl: HTMLElement | null;
	pmTabBadgeEl: HTMLElement | null;
	pairedMismatchNotified: boolean;
	isClosed(): boolean;
	closeSelf(): void;
	registerEvent(ref: ReturnType<App["workspace"]["on"]>): void;
}
const PAIRED_MARKDOWN_BADGE_CLASS = "tategaki-pm-paired-badge";
const PAIRED_MARKDOWN_BADGE_ICON_CLASS = "tategaki-pm-badge-icon";
const PAIRED_MARKDOWN_BADGE_TEXT_CLASS = "tategaki-pm-badge-text";
const PM_TAB_BADGE_CLASS = "tategaki-pm-tab-badge";

export class PmWorkspaceController {
	constructor(private readonly host: PmWorkspaceHost) {}
	private closeForPairLoss(): void {
		if (!this.host.pairedMismatchNotified) {
			this.host.pairedMismatchNotified = true;
			new Notice(t("pm.notice.pairClosed"), 2500);
		}
		this.host.closeSelf();
	}
	registerWorkspacePairGuards(): void {
		const check = () => { if (!this.host.isClosed()) { this.ensurePairedMarkdownView(); if (!this.host.isClosed()) this.applyPmTabBadge(); } };
		check();
		this.host.registerEvent(this.host.app.workspace.on("file-open", check));
		this.host.registerEvent(this.host.app.workspace.on("active-leaf-change", check));
		this.host.registerEvent(this.host.app.workspace.on("layout-change", check));
	}
	async ensureMarkdownViewForFile(
		file: TFile,
	): Promise<MarkdownView | null> {
		if (
			this.host.pairedMarkdownView &&
			this.host.pairedMarkdownView.file?.path === file.path
		) {
			if (!this.host.pairedMarkdownLeaf) return null;
			await requireMarkdownEditingMode(this.host.pairedMarkdownLeaf, this.host.pairedMarkdownView);
			if (this.host.isClosed()) return null;
			if (this.host.pairedMarkdownLeaf) {
				this.applyPairedMarkdownBadge(
					this.host.pairedMarkdownLeaf,
					this.host.pairedMarkdownView
				);
			}
			return this.host.pairedMarkdownView;
		}
		const existingLeaf = this.findMarkdownLeafForFile(file.path);
		if (existingLeaf) {
			const view = existingLeaf.view;
			if (view instanceof MarkdownView) {
				await requireMarkdownEditingMode(existingLeaf, view);
				if (this.host.isClosed()) return null;
				const markdownView = view as MarkdownViewWithCodeMirror;
				if (!markdownView.editor?.cm) {
					return null;
				}
				this.host.pairedMarkdownLeaf = existingLeaf;
				this.host.pairedMarkdownView = view;
				this.applyPairedMarkdownBadge(existingLeaf, view);
				return view;
			}
		}
		const leaf = this.host.app.workspace.getLeaf("tab");
		await leaf.openFile(file, {
			active: false,
			state: { mode: "source" },
		});
		if (this.host.isClosed()) return null;
		if (leaf.view instanceof MarkdownView) {
			await requireMarkdownEditingMode(leaf, leaf.view);
			if (this.host.isClosed()) return null;
			const markdownView = leaf.view as MarkdownViewWithCodeMirror;
			if (!markdownView.editor?.cm) {
				return null;
			}
			this.host.pairedMarkdownLeaf = leaf;
			this.host.pairedMarkdownView = leaf.view;
			this.applyPairedMarkdownBadge(leaf, leaf.view);
			return leaf.view;
		}
		return null;
	}

	findMarkdownLeafForFile(filePath: string): WorkspaceLeaf | null {
		const leaves = this.host.app.workspace.getLeavesOfType("markdown");
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === filePath) {
				return leaf;
			}
		}
		return null;
	}

	ensurePairedMarkdownView(): void {
		if (this.host.isClosed()) return;
		if (!this.host.currentFile || !this.host.pairedMarkdownLeaf) return;
		const leaves = this.host.app.workspace.getLeavesOfType("markdown");
		if (!leaves.includes(this.host.pairedMarkdownLeaf)) {
			this.clearPairedMarkdownBadge();
			this.closeForPairLoss();
			return;
		}
		const view = this.host.pairedMarkdownLeaf.view;
		if (!(view instanceof MarkdownView)) {
			this.clearPairedMarkdownBadge();
			this.closeForPairLoss();
			return;
		}
		if (!this.verifyPairedMarkdownViewFile(view, this.host.currentFile)) {
			this.clearPairedMarkdownBadge();
			this.closeForPairLoss();
			return;
		}
		this.host.pairedMarkdownView = view;
		this.applyPairedMarkdownBadge(this.host.pairedMarkdownLeaf, view);
	}

	verifyPairedMarkdownViewFile(
		view: MarkdownView,
		file: TFile
	): boolean {
		if (view.file?.path === file.path) {
			this.host.pairedMismatchNotified = false;
			return true;
		}
		if (!this.host.pairedMismatchNotified) {
			this.host.pairedMismatchNotified = true;
			new Notice(t("pm.notice.pairClosed"), 2500);
		}
		return false;
	}

	applyPairedMarkdownBadge(
		leaf: WorkspaceLeaf,
		view: MarkdownView
	): void {
		const tabHeaderEl = this.getLeafTabHeaderEl(leaf);
		const badgeHost =
			(tabHeaderEl
				? this.getTabHeaderTitleHost(tabHeaderEl)
				: null) ?? this.getViewHeaderTitleHost(view.containerEl);
		if (!badgeHost) return;
		if (
			this.host.pairedMarkdownBadgeLeaf === leaf &&
			this.host.pairedMarkdownBadgeEl
		) {
			if (this.host.pairedMarkdownBadgeEl.isConnected) return;
		}
		this.clearPairedMarkdownBadge();
		const existing = badgeHost.querySelector<HTMLElement>(
			`.${PAIRED_MARKDOWN_BADGE_CLASS}`
		);
		const doc = badgeHost.ownerDocument ?? this.host.containerEl.ownerDocument;
		const badge = existing ?? doc.createElement("span");
		if (!existing) {
			badge.className = PAIRED_MARKDOWN_BADGE_CLASS;
			badgeHost.appendChild(badge);
		}
		const pairedBadgeTitle = t("pm.paired.title");
		badge.setAttribute("aria-label", pairedBadgeTitle);
		badge.setAttribute("title", pairedBadgeTitle);
		if (
			!badge.querySelector(`.${PAIRED_MARKDOWN_BADGE_ICON_CLASS}`)
		) {
			const iconEl = doc.createElement("span");
			iconEl.className = PAIRED_MARKDOWN_BADGE_ICON_CLASS;
			badge.appendChild(iconEl);
			setIcon(iconEl, "user-round-pen");
			iconEl.querySelector("svg")?.setAttribute("width", "14");
			iconEl.querySelector("svg")?.setAttribute("height", "14");
		}
		if (
			!badge.querySelector(`.${PAIRED_MARKDOWN_BADGE_TEXT_CLASS}`)
		) {
			const textEl = doc.createElement("span");
			textEl.className = PAIRED_MARKDOWN_BADGE_TEXT_CLASS;
			textEl.textContent = t("pm.badge.short");
			badge.appendChild(textEl);
		}
		if (badge.parentElement !== badgeHost) {
			badgeHost.insertBefore(badge, badgeHost.firstChild);
		} else if (badgeHost.firstChild !== badge) {
			badgeHost.insertBefore(badge, badgeHost.firstChild);
		}
		this.host.pairedMarkdownBadgeLeaf = leaf;
		this.host.pairedMarkdownBadgeEl = badge;
	}

	clearPairedMarkdownBadge(): void {
		if (this.host.pairedMarkdownBadgeEl?.isConnected) {
			this.host.pairedMarkdownBadgeEl.remove();
		}
		this.host.pairedMarkdownBadgeLeaf = null;
		this.host.pairedMarkdownBadgeEl = null;
	}

	applyPmTabBadge(): void {
		const tabHeaderEl = this.getLeafTabHeaderEl(this.host.leaf);
		const badgeHost =
			(tabHeaderEl
				? this.getTabHeaderTitleHost(tabHeaderEl)
				: null) ?? this.getViewHeaderTitleHost(this.host.containerEl);
		if (!badgeHost) return;
		if (this.host.pmTabBadgeEl?.isConnected) return;
		this.clearPmTabBadge();
		const doc = badgeHost.ownerDocument ?? this.host.containerEl.ownerDocument;
		const badge = doc.createElement("span");
		badge.className = PM_TAB_BADGE_CLASS;
		badge.setAttribute("aria-label", t("pm.badge.title"));
		badge.setAttribute("title", t("pm.badge.title"));
		const iconEl = doc.createElement("span");
		iconEl.className = PAIRED_MARKDOWN_BADGE_ICON_CLASS;
		badge.appendChild(iconEl);
		setIcon(iconEl, "user-round-pen");
			iconEl.querySelector("svg")?.setAttribute("width", "14");
			iconEl.querySelector("svg")?.setAttribute("height", "14");
		const textEl = doc.createElement("span");
		textEl.className = PAIRED_MARKDOWN_BADGE_TEXT_CLASS;
		textEl.textContent = t("pm.badge.short");
		badge.appendChild(textEl);
		badgeHost.insertBefore(badge, badgeHost.firstChild);
		this.host.pmTabBadgeEl = badge;
	}

	clearPmTabBadge(): void {
		if (this.host.pmTabBadgeEl?.isConnected) {
			this.host.pmTabBadgeEl.remove();
		}
		this.host.pmTabBadgeEl = null;
	}

	getLeafTabHeaderEl(leaf: WorkspaceLeaf): HTMLElement | null {
		const leafAny = leaf as LeafWithTabHeader;
		const tabHeaderEl = leafAny?.tabHeaderEl;
		if (tabHeaderEl?.nodeType === 1) {
			return tabHeaderEl;
		}
		const tabHeader = leafAny?.tabHeader?.el;
		if (tabHeader?.nodeType === 1) {
			return tabHeader;
		}
		const containerEl =
			(leafAny?.containerEl) ?? undefined;
		const leafId =
			leafAny?.id ??
			containerEl?.getAttribute("data-id") ??
			containerEl?.dataset?.id;
		const doc = containerEl?.ownerDocument ?? this.host.containerEl.ownerDocument;
		if (leafId) {
			const byId = doc.querySelector<HTMLElement>(
				`.workspace-tab-header[data-id="${leafId}"]`
			);
			if (byId) return byId;
			const byLeafId = doc.querySelector<HTMLElement>(
				`.workspace-tab-header[data-leaf-id="${leafId}"]`
			);
			if (byLeafId) return byLeafId;
		}
		return null;
	}

	getTabHeaderTitleHost(
		tabHeaderEl: HTMLElement
	): HTMLElement | null {
		return (
			tabHeaderEl.querySelector<HTMLElement>(
				".workspace-tab-header-inner-title"
			) ??
			tabHeaderEl.querySelector<HTMLElement>(
				".workspace-tab-header-inner"
			) ??
			tabHeaderEl
		);
	}

	getViewHeaderTitleHost(
		containerEl: HTMLElement
	): HTMLElement | null {
		const viewHeader = containerEl.querySelector<HTMLElement>(
			".view-header-title"
		);
		if (!viewHeader) return null;
		return (viewHeader.parentElement) ?? viewHeader;
	}
}
