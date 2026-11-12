import {
	App,
	PluginSettingTab,
	Setting,
	SliderComponent,
	Notice,
} from "obsidian";
import TategakiV2Plugin from "../../core/plugin";
import { showConfirmModal } from "./confirm-modal";
import {
	DEFAULT_V2_SETTINGS,
	TategakiV2Settings,
	PRESET_THEME_IDS,
	isStatusBarOverlapMode,
} from "../../types/settings";
import { openExternalUrl } from "../open-external-url";
import { hasSyncBackups } from "../sync-backup";
import {
	localizeThemeDescription,
	localizePresetThemeName,
	t,
} from "../i18n";
import { debugError } from "../logger";
import {
	formatSoTTypewriterHighlightOpacityForUi,
	formatSoTTypewriterNonFocusOpacityForUi,
	formatSoTTypewriterFollowBandRatioForUi,
	formatSoTTypewriterOffsetRatioForUi,
	resolveSoTTypewriterHighlightOpacityFromUiPercent,
	resolveSoTTypewriterNonFocusOpacityFromUiPercent,
	resolveSoTTypewriterFollowBandRatioFromUiPercent,
	resolveSoTTypewriterOffsetRatioFromUiPercent,
} from "./settings-panel/settings-panel-state";
import {
	SoTWysiwygView,
	TATEGAKI_SOT_WYSIWYG_VIEW_TYPE,
} from "../../wysiwyg/sot-wysiwyg-view";

const RELEASE_URL =
	"https://github.com/cat-left-paw/tategaki-plugin-release/releases";

export class TategakiV2SettingTab extends PluginSettingTab {
	plugin: TategakiV2Plugin;

	constructor(app: App, plugin: TategakiV2Plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.addSectionHeading(containerEl, t("settings.section.main"));

		this.addModeSettings(this.plugin.settings);
		this.addSoTTypewriterSettings(this.plugin.settings);
		this.addSupportSection();
		this.addThemeSettings(this.plugin.settings);
	}

	private addSectionHeading(containerEl: HTMLElement, title: string): void {
		new Setting(containerEl).setName(title).setHeading();
	}

	private getThemeDisplayName(theme: {
		id: string;
		name: string;
	}): string {
		return localizePresetThemeName(theme.id, theme.name);
	}

	private getThemeDisplayDescription(theme: {
		id: string;
		description: string;
	}): string {
		return localizeThemeDescription(theme.id, theme.description);
	}

	private bindDeferredSlider(
		slider: SliderComponent,
		initialValue: number,
		options: {
			onCommit: (value: number) => Promise<void>;
			transform?: (value: number) => number;
			debounce?: number;
		},
	): void {
		let pendingValue = initialValue;
		let lastCommittedValue = initialValue;
		let debounceTimer: number | null = null;
		let flushing = false;
		const epsilon = 0.0001;
		const debounceMs = options.debounce ?? 200;

		const clearTimer = () => {
			if (debounceTimer !== null) {
				window.clearTimeout(debounceTimer);
				debounceTimer = null;
			}
		};

		const flush = async () => {
			if (flushing) return;
			clearTimer();
			if (Math.abs(pendingValue - lastCommittedValue) < epsilon) return;
			flushing = true;
			const target = pendingValue;
			try {
				await options.onCommit(target);
				lastCommittedValue = target;
			} finally {
				flushing = false;
			}
		};

		const schedule = () => {
			clearTimer();
			if (debounceMs <= 0) {
				void flush();
				return;
			}
			debounceTimer = window.setTimeout(() => {
				void flush();
			}, debounceMs);
		};

		slider.onChange((raw) => {
			const transformed = options.transform
				? options.transform(raw)
				: raw;
			if (Math.abs(transformed - pendingValue) < epsilon) return;
			pendingValue = transformed;
			schedule();
		});

		const commitHandler = () => {
			void flush();
		};

		slider.sliderEl.addEventListener("change", commitHandler);
		slider.sliderEl.addEventListener("blur", commitHandler);
		slider.sliderEl.addEventListener("pointerup", commitHandler);
	}

	private addColorPickerSetting(
		setting: Setting,
		initialColor: string,
		onCommit: (value: string) => Promise<void>,
		options?: { disabled?: boolean },
	): void {
		const colorInput = setting.controlEl.createEl("input", {
			type: "color",
		});
		colorInput.value = initialColor;
		if (options?.disabled) {
			colorInput.disabled = true;
		}
		colorInput.addEventListener("input", () => {
			void onCommit(colorInput.value);
		});
	}

	private addModeSettings(settings: TategakiV2Settings) {
		const { containerEl } = this;

		const capabilities = this.plugin.pmModeCapabilities;
		new Setting(containerEl)
			.setName(t("pm.settings.name"))
			.setDesc(capabilities.available ? t("pm.settings.desc") : t("pm.notice.unavailable") + capabilities.unavailableReason)
			.addToggle(toggle => {
				toggle.setValue(settings.enablePmMode).setDisabled(!capabilities.available).onChange(async value => {
					await this.plugin.updateSettings({ enablePmMode: value });
					this.display();
				});
			});
		// M4b (D-M4-8): how the text being composed is shown. Read when a composition starts.
		if (settings.enablePmMode) {
			new Setting(containerEl)
				.setName(t("pm.settings.preeditDisplay.name"))
				.setDesc(t("pm.settings.preeditDisplay.desc"))
				.addDropdown(dropdown => {
					dropdown
						.addOption("inline", t("pm.settings.preeditDisplay.inline"))
						.addOption("overlay", t("pm.settings.preeditDisplay.overlay"))
						.setValue(settings.pmPreeditDisplay === "overlay" ? "overlay" : "inline")
						.onChange(async value => {
							if (value !== "inline" && value !== "overlay") return;
							await this.plugin.updateSettings({ pmPreeditDisplay: value });
						});
				});
		}

		new Setting(containerEl)
			.setName(t("settings.showModeDialog.name"))
			.setDesc(t("settings.showModeDialog.desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(!!settings.showModeDialog)
					.onChange(async (value) => {
						await this.plugin.updateSettings({
							showModeDialog: value,
						});
					});
			});

		new Setting(containerEl)
			.setName(t("settings.statusBarOverlap.name"))
			.setDesc(t("settings.statusBarOverlap.desc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption(
						"translucent",
						t("settings.statusBarOverlap.translucent"),
					)
					.addOption("hide", t("settings.statusBarOverlap.hide"))
					.addOption("off", t("settings.statusBarOverlap.off"))
					.setValue(settings.statusBarOverlap)
					.onChange(async (value) => {
						if (!isStatusBarOverlapMode(value)) return;
						await this.plugin.updateSettings({
							statusBarOverlap: value,
						});
					});
			});

		// 互換モード（1.4.0 で廃止）が作っていた古い同期バックアップがあるときだけ、ゴミ箱へ移す項目を出す（自動では消さない）。
		const legacyBackupSlot = containerEl.createDiv();
		void hasSyncBackups(this.app).then((found) => {
			if (!found || !legacyBackupSlot.isConnected) return;
			new Setting(legacyBackupSlot)
				.setName(t("settings.syncBackupMove.name"))
				.setDesc(t("settings.syncBackupMove.desc"))
				.addButton((button) => {
					button
						.setButtonText(t("common.move"))
						.setWarning()
						.onClick(async () => {
							await this.plugin.moveSyncBackupsToTrash();
							this.display();
						});
				});
		});
	}

	private resolveSoTTypewriterUnavailableForActiveView(): {
		unavailable: boolean;
		reason: string | null;
	} {
		const leaves = this.plugin.app.workspace.getLeavesOfType(
			TATEGAKI_SOT_WYSIWYG_VIEW_TYPE,
		);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof SoTWysiwygView) {
				const a = view.getTypewriterAvailability();
				if (!a.available) {
					let reason: string | null = null;
					if (a.reason === "source-mode") {
						reason = t(
							"settings.sotTypewriter.unavailable.sourceMode",
						);
					} else if (a.reason === "plain-text-view") {
						reason = t(
							"settings.sotTypewriter.unavailable.plainTextView",
						);
					} else if (a.reason === "plain-edit") {
						reason = t(
							"settings.sotTypewriter.unavailable.plainEdit",
						);
					}
					return { unavailable: true, reason };
				}
			}
		}
		return { unavailable: false, reason: null };
	}

	private addSoTTypewriterSettings(settings: TategakiV2Settings): void {
		const { containerEl } = this;
		this.addSectionHeading(containerEl, t("settings.section.sotWysiwyg"));

		const tw = this.resolveSoTTypewriterUnavailableForActiveView();
		const twDisabled = tw.unavailable;
		if (twDisabled && tw.reason) {
			containerEl.createDiv({
				cls: "tategaki-settings-section-disabled-banner tategaki-settings-item-disabled-reason",
				text: tw.reason,
			});
		}

		new Setting(containerEl)
			.setName(t("settings.sotTypewriterMode.name"))
			.setDesc(t("settings.sotTypewriterMode.desc"))
			.setDisabled(twDisabled)
			.addToggle((toggle) => {
				toggle
					.setDisabled(twDisabled)
					.setValue(!!settings.wysiwyg.sotTypewriterMode)
					.onChange(async (value) => {
						await this.plugin.updateSettings({
							wysiwyg: {
								...this.plugin.settings.wysiwyg,
								sotTypewriterMode: value,
							},
						});
					});
			});

		const offsetRatio =
			settings.wysiwyg.sotTypewriterOffsetRatio ??
			DEFAULT_V2_SETTINGS.wysiwyg.sotTypewriterOffsetRatio ??
			0;
		const offsetSetting = new Setting(containerEl)
			.setName(t("settings.sotTypewriterOffsetRatio.name"))
			.setDesc(t("settings.sotTypewriterOffsetRatio.desc"))
			.setDisabled(twDisabled)
			.addSlider((slider) => {
				slider
					.setDisabled(twDisabled)
					.setLimits(-40, 40, 1)
					.setDynamicTooltip()
					.setValue(Math.round(offsetRatio * 100));
				slider.onChange((value) => {
					offsetValueEl.setText(
						t("settings.currentValue", {
							value: formatSoTTypewriterOffsetRatioForUi(
								resolveSoTTypewriterOffsetRatioFromUiPercent(
									value,
								),
							),
						}),
					);
				});
				this.bindDeferredSlider(slider, offsetRatio, {
					debounce: 200,
					transform: (value) =>
						resolveSoTTypewriterOffsetRatioFromUiPercent(value),
					onCommit: async (value) => {
						if (
							value ===
							this.plugin.settings.wysiwyg
								.sotTypewriterOffsetRatio
						)
							return;
						await this.plugin.updateSettings({
							wysiwyg: {
								...this.plugin.settings.wysiwyg,
								sotTypewriterOffsetRatio: value,
							},
						});
					},
				});
			});
		const offsetValueEl = offsetSetting.descEl.createDiv({
			text: t("settings.currentValue", {
				value: formatSoTTypewriterOffsetRatioForUi(offsetRatio),
			}),
			cls: "setting-item-description",
		});

		const followBandRatio =
			settings.wysiwyg.sotTypewriterFollowBandRatio ??
			DEFAULT_V2_SETTINGS.wysiwyg.sotTypewriterFollowBandRatio ??
			0.16;
		const followBandSetting = new Setting(containerEl)
			.setName(t("settings.sotTypewriterFollowBandRatio.name"))
			.setDesc(t("settings.sotTypewriterFollowBandRatio.desc"))
			.setDisabled(twDisabled)
			.addSlider((slider) => {
				slider
					.setDisabled(twDisabled)
					.setLimits(5, 25, 1)
					.setDynamicTooltip()
					.setValue(Math.round(followBandRatio * 100));
				slider.onChange((value) => {
					followBandValueEl.setText(
						t("settings.currentValue", {
							value: formatSoTTypewriterFollowBandRatioForUi(
								resolveSoTTypewriterFollowBandRatioFromUiPercent(
									value,
								),
							),
						}),
					);
				});
				this.bindDeferredSlider(slider, followBandRatio, {
					debounce: 200,
					transform: (value) =>
						resolveSoTTypewriterFollowBandRatioFromUiPercent(value),
					onCommit: async (value) => {
						if (
							value ===
							this.plugin.settings.wysiwyg
								.sotTypewriterFollowBandRatio
						)
							return;
						await this.plugin.updateSettings({
							wysiwyg: {
								...this.plugin.settings.wysiwyg,
								sotTypewriterFollowBandRatio: value,
							},
						});
					},
				});
			});
		const followBandValueEl = followBandSetting.descEl.createDiv({
			text: t("settings.currentValue", {
				value: formatSoTTypewriterFollowBandRatioForUi(
					followBandRatio,
				),
			}),
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName(t("settings.sotTypewriterVisualFocus.section"))
			.setHeading();

		new Setting(containerEl)
			.setName(t("settings.sotTypewriterBlockHighlightEnabled.name"))
			.setDesc(t("settings.sotTypewriterBlockHighlightEnabled.desc"))
			.setDisabled(twDisabled)
			.addToggle((toggle) => {
				toggle
					.setDisabled(twDisabled)
					.setValue(
						settings.wysiwyg.sotTypewriterBlockHighlightEnabled !==
							false,
					)
					.onChange(async (value) => {
						await this.plugin.updateSettings({
							wysiwyg: {
								...this.plugin.settings.wysiwyg,
								sotTypewriterBlockHighlightEnabled: value,
							},
						});
					});
			});

		new Setting(containerEl)
			.setName(t("settings.sotTypewriterCurrentLineHighlightEnabled.name"))
			.setDesc(t("settings.sotTypewriterCurrentLineHighlightEnabled.desc"))
			.setDisabled(twDisabled)
			.addToggle((toggle) => {
				toggle
					.setDisabled(twDisabled)
					.setValue(
						settings.wysiwyg
							.sotTypewriterCurrentLineHighlightEnabled !== false,
					)
					.onChange(async (value) => {
						await this.plugin.updateSettings({
							wysiwyg: {
								...this.plugin.settings.wysiwyg,
								sotTypewriterCurrentLineHighlightEnabled: value,
							},
						});
					});
			});

		new Setting(containerEl)
			.setName(t("settings.sotTypewriterNonFocusDimEnabled.name"))
			.setDesc(t("settings.sotTypewriterNonFocusDimEnabled.desc"))
			.setDisabled(twDisabled)
			.addToggle((toggle) => {
				toggle
					.setDisabled(twDisabled)
					.setValue(
						settings.wysiwyg.sotTypewriterNonFocusDimEnabled !==
							false,
					)
					.onChange(async (value) => {
						await this.plugin.updateSettings({
							wysiwyg: {
								...this.plugin.settings.wysiwyg,
								sotTypewriterNonFocusDimEnabled: value,
							},
						});
					});
			});

		const blockHighlightColor =
			settings.wysiwyg.sotTypewriterBlockHighlightColor ??
			DEFAULT_V2_SETTINGS.wysiwyg.sotTypewriterBlockHighlightColor ??
			"#1e90ff";
		const blockColorSetting = new Setting(containerEl)
			.setName(t("settings.sotTypewriterBlockHighlightColor.name"))
			.setDesc(t("settings.sotTypewriterBlockHighlightColor.desc"))
			.setDisabled(twDisabled);
		this.addColorPickerSetting(
			blockColorSetting,
			blockHighlightColor,
			async (value) => {
				await this.plugin.updateSettings({
					wysiwyg: {
						...this.plugin.settings.wysiwyg,
						sotTypewriterBlockHighlightColor: value,
					},
				});
			},
			{ disabled: twDisabled },
		);

		const blockHighlightOpacity =
			settings.wysiwyg.sotTypewriterBlockHighlightOpacity ??
			DEFAULT_V2_SETTINGS.wysiwyg.sotTypewriterBlockHighlightOpacity ??
			0.16;
		const blockHighlightOpacitySetting = new Setting(containerEl)
			.setName(t("settings.sotTypewriterBlockHighlightOpacity.name"))
			.setDesc(t("settings.sotTypewriterBlockHighlightOpacity.desc"))
			.setDisabled(twDisabled)
			.addSlider((slider) => {
				slider
					.setDisabled(twDisabled)
					.setLimits(0, 100, 1)
					.setDynamicTooltip()
					.setValue(Math.round(blockHighlightOpacity * 100));
				slider.onChange((value) => {
					blockHighlightOpacityValueEl.setText(
						t("settings.currentValue", {
							value: formatSoTTypewriterHighlightOpacityForUi(
								resolveSoTTypewriterHighlightOpacityFromUiPercent(
									value,
								),
							),
						}),
					);
				});
				this.bindDeferredSlider(slider, blockHighlightOpacity, {
					debounce: 200,
					transform: (value) =>
						resolveSoTTypewriterHighlightOpacityFromUiPercent(value),
					onCommit: async (value) => {
						if (
							value ===
							this.plugin.settings.wysiwyg
								.sotTypewriterBlockHighlightOpacity
						)
							return;
						await this.plugin.updateSettings({
							wysiwyg: {
								...this.plugin.settings.wysiwyg,
								sotTypewriterBlockHighlightOpacity: value,
							},
						});
					},
				});
			});
		const blockHighlightOpacityValueEl =
			blockHighlightOpacitySetting.descEl.createDiv({
				text: t("settings.currentValue", {
					value: formatSoTTypewriterHighlightOpacityForUi(
						blockHighlightOpacity,
					),
				}),
				cls: "setting-item-description",
			});

		const currentLineColor =
			settings.wysiwyg.sotTypewriterCurrentLineHighlightColor ??
			DEFAULT_V2_SETTINGS.wysiwyg
				.sotTypewriterCurrentLineHighlightColor ??
			"#1e90ff";
		const currentLineColorSetting = new Setting(containerEl)
			.setName(t("settings.sotTypewriterCurrentLineHighlightColor.name"))
			.setDesc(t("settings.sotTypewriterCurrentLineHighlightColor.desc"))
			.setDisabled(twDisabled);
		this.addColorPickerSetting(
			currentLineColorSetting,
			currentLineColor,
			async (value) => {
				await this.plugin.updateSettings({
					wysiwyg: {
						...this.plugin.settings.wysiwyg,
						sotTypewriterCurrentLineHighlightColor: value,
					},
				});
			},
			{ disabled: twDisabled },
		);

		const currentLineOpacity =
			settings.wysiwyg.sotTypewriterCurrentLineHighlightOpacity ??
			DEFAULT_V2_SETTINGS.wysiwyg
				.sotTypewriterCurrentLineHighlightOpacity ??
			0.28;
		const currentLineOpacitySetting = new Setting(containerEl)
			.setName(t("settings.sotTypewriterCurrentLineHighlightOpacity.name"))
			.setDesc(t("settings.sotTypewriterCurrentLineHighlightOpacity.desc"))
			.setDisabled(twDisabled)
			.addSlider((slider) => {
				slider
					.setDisabled(twDisabled)
					.setLimits(0, 100, 1)
					.setDynamicTooltip()
					.setValue(Math.round(currentLineOpacity * 100));
				slider.onChange((value) => {
					currentLineOpacityValueEl.setText(
						t("settings.currentValue", {
							value: formatSoTTypewriterHighlightOpacityForUi(
								resolveSoTTypewriterHighlightOpacityFromUiPercent(
									value,
								),
							),
						}),
					);
				});
				this.bindDeferredSlider(slider, currentLineOpacity, {
					debounce: 200,
					transform: (value) =>
						resolveSoTTypewriterHighlightOpacityFromUiPercent(value),
					onCommit: async (value) => {
						if (
							value ===
							this.plugin.settings.wysiwyg
								.sotTypewriterCurrentLineHighlightOpacity
						)
							return;
						await this.plugin.updateSettings({
							wysiwyg: {
								...this.plugin.settings.wysiwyg,
								sotTypewriterCurrentLineHighlightOpacity: value,
							},
						});
					},
				});
			});
		const currentLineOpacityValueEl =
			currentLineOpacitySetting.descEl.createDiv({
				text: t("settings.currentValue", {
					value: formatSoTTypewriterHighlightOpacityForUi(
						currentLineOpacity,
					),
				}),
				cls: "setting-item-description",
			});

		const nonFocusOpacity =
			settings.wysiwyg.sotTypewriterNonFocusOpacity ??
			DEFAULT_V2_SETTINGS.wysiwyg.sotTypewriterNonFocusOpacity ??
			0.42;
		const nonFocusOpacitySetting = new Setting(containerEl)
			.setName(t("settings.sotTypewriterNonFocusOpacity.name"))
			.setDesc(t("settings.sotTypewriterNonFocusOpacity.desc"))
			.setDisabled(twDisabled)
			.addSlider((slider) => {
				slider
					.setDisabled(twDisabled)
					.setLimits(10, 100, 1)
					.setDynamicTooltip()
					.setValue(Math.round(nonFocusOpacity * 100));
				slider.onChange((value) => {
					nonFocusOpacityValueEl.setText(
						t("settings.currentValue", {
							value: formatSoTTypewriterNonFocusOpacityForUi(
								resolveSoTTypewriterNonFocusOpacityFromUiPercent(
									value,
								),
							),
						}),
					);
				});
				this.bindDeferredSlider(slider, nonFocusOpacity, {
					debounce: 200,
					transform: (value) =>
						resolveSoTTypewriterNonFocusOpacityFromUiPercent(value),
					onCommit: async (value) => {
						if (
							value ===
							this.plugin.settings.wysiwyg
								.sotTypewriterNonFocusOpacity
						)
							return;
						await this.plugin.updateSettings({
							wysiwyg: {
								...this.plugin.settings.wysiwyg,
								sotTypewriterNonFocusOpacity: value,
							},
						});
					},
				});
			});
		const nonFocusOpacityValueEl = nonFocusOpacitySetting.descEl.createDiv({
			text: t("settings.currentValue", {
				value: formatSoTTypewriterNonFocusOpacityForUi(nonFocusOpacity),
			}),
			cls: "setting-item-description",
		});
	}

	// 更新の確認は Obsidian のコミュニティプラグインの仕組みに任せる（1.4.0 で独自の更新確認を廃止）。
	// ここに残るのは、利用者が押したときだけ外部のページを開くリンクだけ（通信しない）。
	private addSupportSection(): void {
		const { containerEl } = this;

		this.addSectionHeading(containerEl, t("settings.section.support"));

		const releaseSetting = new Setting(containerEl).setName(
			t("settings.releasePage.name"),
		);

		const releaseLinkEl = releaseSetting.controlEl.createEl("a", {
			text: t("settings.releasePage"),
			attr: {
				href: RELEASE_URL,
				target: "_blank",
				rel: "noopener noreferrer",
			},
			cls: "tategaki-release-link",
		});
		releaseLinkEl.addEventListener("click", (event) => {
			event.preventDefault();
			void (async () => {
				const opened = await openExternalUrl(this.app, RELEASE_URL);
				if (!opened) {
					new Notice(t("settings.notice.linkOpenFailed"), 2500);
				}
			})();
		});
	}

	private addThemeSettings(settings: TategakiV2Settings) {
		const { containerEl } = this;
		this.addSectionHeading(containerEl, t("settings.section.theme"));

		// 現在のテーマ表示と説明
		const currentTheme =
			settings.activeTheme === "obsidian-base"
				? null
				: settings.themes.find((t) => t.id === settings.activeTheme);
		const currentThemeName =
			settings.activeTheme === "obsidian-base"
				? t("settings.theme.obsidianBase.name")
				: currentTheme
					? this.getThemeDisplayName(currentTheme)
					: t("settings.theme.unknown");

		containerEl.createEl("p", {
			text: t("settings.theme.current", { themeName: currentThemeName }),
			cls: "setting-item-description",
		});

		// テーマ一覧
		const themeListContainer = containerEl.createDiv(
			"theme-list-container tategaki-theme-list-container",
		);

		const themeListTitle = themeListContainer.createDiv(
			"theme-list-title tategaki-theme-list-title",
		);
		themeListTitle.setText(t("settings.theme.saved"));

		// テーマリストを動的に更新する関数
		const updateThemeList = () => {
			// 既存のテーマリストをクリア
			const existingList =
				themeListContainer.querySelector(".theme-items");
			if (existingList) {
				existingList.remove();
			}

			const themeItems = themeListContainer.createDiv(
				"theme-items tategaki-theme-items",
			);

			// Obsidianベーステーマを追加
			const obsidianBaseTheme = {
				id: "obsidian-base",
				name: t("settings.theme.obsidianBase.name"),
				description: t("settings.theme.obsidianBase.desc"),
				mode: "obsidian-base" as const,
				settings: {
					fontFamily: "",
					fontSize: 16,
					lineHeight: 1.5,
					headingFontFamily: "", // Obsidianテーマから継承
					colors: {
						text: "",
						background: "",
						pageBackground: "",
						accent: "",
						headingText: "", // Obsidianテーマから継承
					},
					spacing: {
						paragraphSpacing: 1.5,
						headingSpacing: 2,
					},
				},
			};

			const allThemes = [obsidianBaseTheme, ...settings.themes];

			allThemes.forEach((theme) => {
				const themeItem = themeItems.createDiv(
					"theme-item tategaki-theme-item",
				);

				// 現在のテーマの場合はハイライト
				if (theme.id === settings.activeTheme) {
					themeItem.addClass("is-active");
				}

				const themeName = this.getThemeDisplayName(theme);
				const themeDescription = this.getThemeDisplayDescription(theme);

				const themeInfo = themeItem.createDiv(
					"theme-info tategaki-theme-info",
				);

				themeInfo.createDiv({
					text: themeName,
					cls: "tategaki-theme-name",
				});

				themeInfo.createDiv({
					text: themeDescription,
					cls: "tategaki-theme-desc",
				});

				// 参照情報（Obsidianベーステーマ以外）
				if (theme.id !== "obsidian-base") {
					const previewInfo = themeInfo.createDiv(
						"tategaki-theme-preview",
					);

					// 見出し設定の表示テキストを作成
					const headingFontDisplay = theme.settings.headingFontFamily
						? theme.settings.headingFontFamily.split(",")[0].trim()
						: t("settings.theme.sameAsBody");
					const headingColorDisplay = theme.settings.colors
						?.headingText
						? theme.settings.colors.headingText
						: t("settings.theme.sameAsBody");

					previewInfo.createDiv({
						text: t("settings.theme.preview", {
							fontFamily: theme.settings.fontFamily,
							fontSize: theme.settings.fontSize,
							lineHeight: theme.settings.lineHeight,
						}),
					});
					previewInfo.createDiv({
						text: t("settings.theme.previewHeading", {
							headingFont: headingFontDisplay,
							headingColor: headingColorDisplay,
						}),
						cls: "tategaki-theme-preview-heading",
					});
				}

				const buttonContainer = themeItem.createDiv(
					"theme-buttons tategaki-theme-buttons",
				);

				// 適用ボタン
				if (theme.id !== settings.activeTheme) {
					const applyButton = buttonContainer.createEl("button", {
						text: t("settings.theme.apply"),
						cls: "tategaki-theme-action-button",
					});

					applyButton.addEventListener("click", () => {
						void this.plugin
							.loadTheme(theme.id)
							.then(() => {
								this.display(); // 設定画面を再表示して現在のテーマ表示を更新
							})
							.catch((error) => {
								debugError(
									"Tategaki: failed to load theme",
									error,
								);
								new Notice(
									t("settings.notice.themeApplyFailed"),
									2500,
								);
							});
					});
				} else {
					// 現在のテーマの場合は「現在使用中」を表示
					buttonContainer.createSpan({
						text: t("settings.theme.inUse"),
						cls: "tategaki-theme-current",
					});
				}

				// 削除ボタン（Obsidianベーステーマとプリセットテーマは削除不可）
				const isPreset =
					theme.id === "obsidian-base" ||
					(PRESET_THEME_IDS as readonly string[]).includes(theme.id);
				if (!isPreset) {
					const deleteButton = buttonContainer.createEl("button", {
						text: t("common.delete"),
						cls: "tategaki-theme-action-button tategaki-theme-action-delete",
					});

					deleteButton.addEventListener("click", () => {
						void (async () => {
							// 削除確認
							const confirmDelete = await showConfirmModal(
								this.app,
								{
									title: t("settings.theme.deleteTitle"),
									message: t("settings.theme.deleteMessage", {
										themeName: theme.name,
									}),
									confirmText: t("common.delete"),
									cancelText: t("common.cancel"),
									confirmIsWarning: true,
								},
							);
							if (!confirmDelete) return;

							await this.plugin.deleteTheme(theme.id);
							this.display(); // 設定画面を再表示
						})().catch((error) => {
							debugError(
								"Tategaki: failed to delete theme",
								error,
							);
							new Notice(
								t("settings.notice.themeDeleteFailed"),
								2500,
							);
						});
					});
				}
			});
		};

		// 初回テーマリスト表示
		updateThemeList();

		// 使用方法の説明
		new Setting(containerEl)
			.setName(t("settings.theme.usage.name"))
			.setDesc(t("settings.theme.usage.desc"));
	}
}
