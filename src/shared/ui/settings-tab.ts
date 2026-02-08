import {
	App,
	PluginSettingTab,
	Setting,
	SliderComponent,
	requestUrl,
	Notice,
} from "obsidian";
import TategakiV2Plugin from "../../core/plugin";
	import {
		TategakiV2Settings,
		PRESET_THEME_IDS,
	} from "../../types/settings";
	import { compareSemver } from "../version";

const UPDATE_CHECK_URL =
	"https://raw.githubusercontent.com/cat-left-paw/tategaki-plugin-release/main/latest.json";
const RELEASE_URL =
	"https://github.com/cat-left-paw/tategaki-plugin-release/releases";
const DONATION_URL = "https://www.buymeacoffee.com/hidarite";

export class TategakiV2SettingTab extends PluginSettingTab {
	plugin: TategakiV2Plugin;

	constructor(app: App, plugin: TategakiV2Plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h1", { text: "Tategaki Plugin設定" });

		this.addTiptapSettings(this.plugin.settings);
		const legacyEnabled = this.plugin.settings.enableLegacyTiptap ?? true;
		this.addUpdateAndSupportSection(legacyEnabled);
		this.addThemeSettings(this.plugin.settings);
		this.addDonationSection();
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

	private addTiptapSettings(settings: TategakiV2Settings) {
		const { containerEl } = this;
		const legacyEnabled = settings.enableLegacyTiptap ?? true;

		new Setting(containerEl)
			.setName("互換モード（TipTapベースのエディタ）")
			.setDesc(
				"TipTapベースの互換ビューと同期機能を有効化します。オフにすると互換用の同期/バックアップ設定を非表示にします",
			)
			.addToggle((toggle) => {
				toggle.setValue(legacyEnabled).onChange(async (value) => {
					await this.plugin.updateSettings({
						enableLegacyTiptap: value,
					});
					this.display();
				});
			});

		// 互換モードのアクティブファイル追従は廃止

		new Setting(containerEl)
			.setName("ビュー起動時にモード選択を表示")
			.setDesc(
				"縦書きビューを開くときに、執筆モード/参照モードを選択するダイアログを表示します",
			)
			.addToggle((toggle) => {
				toggle
					.setValue(!!settings.showModeDialog)
					.onChange(async (value) => {
						await this.plugin.updateSettings({
							showModeDialog: value,
						});
					});
			});

		if (legacyEnabled) {
			containerEl.createEl("h3", { text: "同期と更新(互換モード専用)" });

			new Setting(containerEl)
				.setName("外部同期の更新間隔(ms)")
				.setDesc(
					"カーソル同期や追従時のポーリング間隔です。0=リアルタイム（高負荷の可能性）。値を大きくするほど負荷は軽くなります",
				)
				.addSlider((slider) => {
					slider
						.setLimits(0, 1000, 50)
						.setDynamicTooltip()
						.setValue(settings.preview.updateInterval);
					this.bindDeferredSlider(
						slider,
						settings.preview.updateInterval,
						{
							debounce: 200,
							onCommit: async (value) => {
								if (
									value ===
									this.plugin.settings.preview.updateInterval
								)
									return;
								await this.plugin.updateSettings({
									preview: {
										...this.plugin.settings.preview,
										updateInterval: value,
									},
								});
							},
						},
					);
				});

			new Setting(containerEl)
				.setName("同期モード")
				.setDesc(
					"自動: 編集時に自動保存、手動: 手動で同期ボタンを押す必要があります（Tategakiエディタ）",
				)
				.addDropdown((dropdown) => {
					dropdown
						.addOption("auto", "自動同期")
						.addOption("manual", "手動同期")
						.setValue(settings.wysiwyg.syncMode)
						.onChange(async (value) => {
							await this.plugin.updateSettings({
								wysiwyg: {
									...this.plugin.settings.wysiwyg,
									syncMode: value as "auto" | "manual",
								},
							});
						});
				});

			new Setting(containerEl)
				.setName("同期バックアップを作成")
				.setDesc(
					"互換モードの同期時にバックアップを作成します。OFFにするとバックアップは作成されません（事故時はObsidianの「Open version history」を利用してください）。",
				)
				.addToggle((toggle) => {
					toggle
						.setValue(
							!!this.plugin.settings.wysiwyg.enableSyncBackup,
						)
						.onChange(async (value) => {
							await this.plugin.updateSettings({
								wysiwyg: {
									...this.plugin.settings.wysiwyg,
									enableSyncBackup: value,
								},
							});
						});
				});

			new Setting(containerEl)
				.setName("同期バックアップフォルダを開く")
				.setDesc(
					"バックアップ保存先（.obsidian/tategaki-sync-backups）を開きます。",
				)
				.addButton((button) => {
					button.setButtonText("開く").onClick(async () => {
						await this.plugin.openSyncBackupFolder();
					});
				});

			new Setting(containerEl)
				.setName("同期バックアップをゴミ箱へ移動")
				.setDesc(
					"同期の安全策として作成されたバックアップをゴミ箱へ移動します（復元できなくなるので注意）",
				)
				.addButton((button) => {
					button
						.setButtonText("移動")
						.setWarning()
						.onClick(async () => {
							await this.plugin.moveSyncBackupsToTrash();
						});
				});

			new Setting(containerEl)
				.setName("アプリ終了時の未保存変更")
				.setDesc(
					"未保存の変更がある場合に、終了時に保存するか破棄するかを選びます",
				)
				.addDropdown((dropdown) => {
					dropdown
						.addOption("save", "保存して終了")
						.addOption("discard", "破棄して終了")
						.setValue(settings.wysiwyg.appCloseAction ?? "save")
						.onChange(async (value) => {
							await this.plugin.updateSettings({
								wysiwyg: {
									...this.plugin.settings.wysiwyg,
									appCloseAction: value as "save" | "discard",
								},
							});
						});
				});

			new Setting(containerEl)
				.setName("カーソル同期")
				.setDesc(
					"Obsidian標準エディタでアクティブなカーソル位置をTategakiエディタにも反映します",
				)
				.addToggle((toggle) => {
					toggle
						.setValue(!!settings.wysiwyg.syncCursor)
						.onChange(async (value) => {
							await this.plugin.updateSettings({
								wysiwyg: {
									...this.plugin.settings.wysiwyg,
									syncCursor: value,
								},
							});
						});
				});
		}

	}

	private addUpdateAndSupportSection(legacyEnabled: boolean): void {
		const { containerEl } = this;

		containerEl.createEl("h2", { text: "アップデート" });

		const updateSetting = new Setting(containerEl)
			.setName("手動でアップデートを確認")
			.setDesc(
				"ボタンを押したときだけ通信して、公開URL上の最新版情報を確認します",
			)
			.addButton((button) => {
				button.setButtonText("更新の確認").onClick(async () => {
					const current = this.plugin.manifest.version;
					try {
						const resp = await requestUrl({
							url: UPDATE_CHECK_URL,
						});
						const data = resp.json ?? {};
						const latest = String(data.version ?? "").trim();
						const downloadUrl = String(data.url ?? "").trim();

						if (!latest) {
							new Notice(
								"更新情報を取得できませんでした（latest.jsonの形式を確認してください）。",
								3000,
							);
							return;
						}

						if (latest === current) {
							new Notice(
								`Tategakiエディタは最新です（現在: ${current}）。`,
								2500,
							);
							return;
						}

						const cmp = compareSemver(latest, current);
						if (cmp === null) {
							const msg = downloadUrl
								? `更新情報を取得しました（公開: ${latest} / 現在: ${current}）。バージョン比較ができないため、Releases を確認してください: ${downloadUrl}`
								: `更新情報を取得しました（公開: ${latest} / 現在: ${current}）。バージョン比較ができないため、Releases を確認してください。`;
							new Notice(msg, 6000);
							return;
						}

						if (cmp < 0) {
							new Notice(
								`現在のほうが新しいバージョンです（現在: ${current} / 公開: ${latest}）。`,
								4000,
							);
							return;
						}

						const msg = downloadUrl
							? `新しいバージョン ${latest} が利用可能です（現在: ${current}）。ダウンロード: ${downloadUrl}`
							: `新しいバージョン ${latest} が利用可能です（現在: ${current}）。`;
						new Notice(msg, 5000);
					} catch (error) {
						console.error("Update check failed", error);
						new Notice(
							"更新確認に失敗しました。通信状況と更新URLを確認してください。",
							3500,
						);
					}
				});
			});

		// リリースページへのリンクを追加
		const releaseLinkEl = updateSetting.controlEl.createEl("a", {
			text: "リリースページ",
			attr: {
				href: RELEASE_URL,
				target: "_blank",
				rel: "noopener noreferrer",
				style: "margin-left: 8px; font-size: 12px;",
			},
		});
		releaseLinkEl.addEventListener("click", (event) => {
			event.preventDefault();
			window.open(RELEASE_URL, "_blank", "noopener,noreferrer");
		});

		if (legacyEnabled) {
			// 同期バックアップ操作は互換モード設定へ移動
		}
	}

	private addDonationSection(): void {
		const { containerEl } = this;

		containerEl.createEl("h2", { text: "サポート" });

		const donationSetting = new Setting(containerEl)
			.setName("サポート（寄付）")
			.setDesc(
				"このプラグインを気に入っていただけたらサポートをしていただくと幸いです（任意）",
			);

		const donationLinkEl = donationSetting.controlEl.createEl("a", {
			attr: {
				href: DONATION_URL,
				target: "_blank",
				rel: "noopener noreferrer",
				"aria-label": "Buy Me a Coffee",
				style: "display: inline-flex;",
			},
		});

		donationLinkEl.createEl("img", {
			attr: {
				src: "https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png",
				alt: "Buy Me A Coffee",
				style: "height: 60px !important;width: 217px !important;",
			},
		});

		donationLinkEl.addEventListener("click", (event) => {
			event.preventDefault();
			try {
				window.open(DONATION_URL, "_blank", "noopener,noreferrer");
			} catch (error) {
				console.error("Failed to open donation link", error);
				new Notice("リンクを開けませんでした。", 2500);
			}
		});
	}

	private addThemeSettings(settings: TategakiV2Settings) {
		const { containerEl } = this;
		containerEl.createEl("h2", { text: "テーマ管理" });

		// 現在のテーマ表示と説明
		const currentTheme =
			settings.activeTheme === "obsidian-base"
				? null
				: settings.themes.find((t) => t.id === settings.activeTheme);
		const currentThemeName =
			settings.activeTheme === "obsidian-base"
				? "Obsidian ベーステーマ"
				: currentTheme
					? currentTheme.name
					: "未知のテーマ";

		containerEl.createEl("p", {
			text: `現在のテーマ: ${currentThemeName}`,
			cls: "setting-item-description",
		});

		// テーマ一覧
		const themeListContainer = containerEl.createDiv(
			"theme-list-container",
		);
		themeListContainer.style.cssText = `
			border: 1px solid var(--background-modifier-border);
			border-radius: 6px;
			padding: 16px;
			margin: 16px 0;
			background: var(--background-secondary);
		`;

		const themeListTitle = themeListContainer.createEl("h3", {
			text: "保存されているテーマ",
		});
		themeListTitle.style.cssText = "margin: 0 0 12px 0;";

		// テーマリストを動的に更新する関数
		const updateThemeList = () => {
			// 既存のテーマリストをクリア
			const existingList =
				themeListContainer.querySelector(".theme-items");
			if (existingList) {
				existingList.remove();
			}

			const themeItems = themeListContainer.createDiv("theme-items");
			themeItems.style.cssText = `
				max-height: min(360px, 50vh);
				overflow-y: auto;
				padding-right: 6px;
			`;

			// Obsidianベーステーマを追加
			const obsidianBaseTheme = {
				id: "obsidian-base",
				name: "Obsidian ベーステーマ",
				description:
					"Obsidianで適用されているテーマをベースとしたテーマです",
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

			allThemes.forEach((theme, index) => {
				const themeItem = themeItems.createDiv("theme-item");
				themeItem.style.cssText = `
					display: flex;
					align-items: center;
					justify-content: space-between;
					padding: 12px;
					margin: 8px 0;
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					background: var(--background-primary);
				`;

				// 現在のテーマの場合はハイライト
				if (theme.id === settings.activeTheme) {
					themeItem.style.borderColor = "var(--interactive-accent)";
					themeItem.style.backgroundColor =
						"var(--background-secondary-alt)";
				}

				const themeInfo = themeItem.createDiv("theme-info");
				themeInfo.style.cssText = `flex: 1;`;

				const themeName = themeInfo.createEl("div", {
					text: theme.name,
				});
				themeName.style.cssText =
					"font-weight: 500; margin-bottom: 4px;";

				const themeDesc = themeInfo.createEl("div", {
					text: theme.description,
				});
				themeDesc.style.cssText =
					"font-size: 12px; color: var(--text-muted);";

				// 参照情報（Obsidianベーステーマ以外）
				if (theme.id !== "obsidian-base") {
					const previewInfo = themeInfo.createEl("div");
					previewInfo.style.cssText =
						"font-size: 11px; color: var(--text-muted); margin-top: 4px;";

					// 見出し設定の表示テキストを作成
					const headingFontDisplay = theme.settings.headingFontFamily
						? theme.settings.headingFontFamily.split(",")[0].trim()
						: "本文と同じ";
					const headingColorDisplay = theme.settings.colors
						?.headingText
						? theme.settings.colors.headingText
						: "本文と同じ";

					previewInfo.innerHTML = `
						<div>${theme.settings.fontFamily} | ${theme.settings.fontSize}px | 行間${theme.settings.lineHeight}</div>
						<div style="margin-top: 2px;">見出し: ${headingFontDisplay} | ${headingColorDisplay}</div>
					`;
				}

				const buttonContainer = themeItem.createDiv("theme-buttons");
				buttonContainer.style.cssText = `
					display: flex;
					gap: 8px;
					align-items: center;
				`;

				// 適用ボタン
				if (theme.id !== settings.activeTheme) {
					const applyButton = buttonContainer.createEl("button", {
						text: "適用",
					});
					applyButton.style.cssText =
						"padding: 4px 8px; font-size: 11px;";

					applyButton.addEventListener("click", async () => {
						await this.plugin.loadTheme(theme.id);
						this.display(); // 設定画面を再表示して現在のテーマ表示を更新
					});
				} else {
					// 現在のテーマの場合は「現在使用中」を表示
					const currentSpan = buttonContainer.createEl("span", {
						text: "使用中",
					});
					currentSpan.style.cssText =
						"font-size: 11px; color: var(--interactive-accent); font-weight: 500;";
				}

				// 削除ボタン（Obsidianベーステーマとプリセットテーマは削除不可）
				const isPreset =
					theme.id === "obsidian-base" ||
					(PRESET_THEME_IDS as readonly string[]).includes(theme.id);
				if (!isPreset) {
					const deleteButton = buttonContainer.createEl("button", {
						text: "削除",
					});
					deleteButton.style.cssText =
						"padding: 4px 8px; font-size: 11px; color: var(--text-error);";

					deleteButton.addEventListener("click", async () => {
						// 削除確認
						const confirmDelete = confirm(
							`テーマ「${theme.name}」を削除しますか？この操作は元に戻せません。`,
						);
						if (!confirmDelete) return;

						await this.plugin.deleteTheme(theme.id);
						this.display(); // 設定画面を再表示
					});
				}
			});
		};

		// 初回テーマリスト表示
		updateThemeList();

		// 使用方法の説明
		new Setting(containerEl)
			.setName("テーマの使用方法")
			.setDesc(
				"設定パネルで見た目を調整した後、「現在の設定をテーマとして保存」ボタンから新しいテーマとして保存できます。保存されたテーマはここで管理できます。",
			);
	}
}
