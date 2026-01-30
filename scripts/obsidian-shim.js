const createElement = () => document.createElement("div");

class App {
	constructor() {
		this.vault = {
			async read(_file) {
				return "";
			},
			on() {},
			off() {},
		};
		this.workspace = {
			getActiveViewOfType() {
				return null;
			},
			on() {},
			off() {},
			getActiveFile() {
				return null;
			},
		};
		this.plugins = { enabledPlugins: new Set(), plugins: {} };
	}
}

class Notice {
	constructor(_message, _timeout) {
		// ダミー実装: テスト環境ではログのみ
		if (_message) {
			console.warn("[Notice]", _message);
		}
	}
}

class TFile {
	constructor(path = "", extension = "md") {
		this.path = path;
		this.name = path.split("/").pop() ?? "";
		this.extension = extension;
		this.basename = this.name.replace(/\.[^.]+$/, "");
		this.stat = { mtime: Date.now(), ctime: Date.now(), size: 0 };
	}
}

class WorkspaceLeaf {
	constructor() {
		this.view = null;
	}
}

class ItemView {
	constructor() {
		this.containerEl = createElement();
	}
	getViewType() {
		return "stub-view";
	}
	getDisplayText() {
		return "Stub View";
	}
	onload() {}
	onunload() {}
}

class MarkdownView extends ItemView {
	constructor() {
		super();
		this.editor = {
			getValue() {
				return "";
			},
			getCursor() {
				return { line: 0, ch: 0 };
			},
			on() {},
			off() {},
		};
		this.file = null;
	}
}

class Modal {
	constructor(app) {
		this.app = app;
		this.containerEl = createElement();
		this.contentEl = createElement();
		this.modalEl = createElement();
		this.backdropEl = createElement();
	}
	open() {}
	close() {}
}

class Setting {
	constructor(containerEl) {
		this.settingEl = createElement();
		containerEl?.append(this.settingEl);
	}
	setName() {
		return this;
	}
	setDesc() {
		return this;
	}
	addText(cb) {
		const textComponent = {
			inputEl: document.createElement("input"),
			setPlaceholder() {
				return this;
			},
			setValue() {
				return this;
			},
			onChange() {
				return this;
			},
		};
		cb(textComponent);
		return this;
	}
	addButton(cb) {
		const buttonComponent = {
			setButtonText() {
				return this;
			},
			setCta() {
				return this;
			},
			onClick() {
				return this;
			},
		};
		cb(buttonComponent);
		return this;
	}
}

function setIcon(_el, _icon) {
	// アイコンはテスト環境では不要
}

const MarkdownRenderer = {
	async renderMarkdown(source, el, _ctx, _path, _component) {
		if (el instanceof HTMLElement) {
			el.textContent = source;
		}
	},
};

const obsidianExports = {
	App,
	Notice,
	TFile,
	ItemView,
	WorkspaceLeaf,
	MarkdownView,
	Modal,
	Setting,
	setIcon,
	MarkdownRenderer,
};

module.exports = obsidianExports;

const Module = require("module");
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
	if (request === "obsidian") {
		return obsidianExports;
	}
	return originalLoad.apply(this, arguments);
};
