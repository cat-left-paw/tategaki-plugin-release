const { Window } = require("happy-dom");

const window = new Window();
const globalScope = globalThis;

globalScope.window = window;
globalScope.document = window.document;
globalScope.navigator = window.navigator;
globalScope.HTMLElement = window.HTMLElement;
globalScope.Node = window.Node;
globalScope.Text = window.Text;
globalScope.Range = window.Range;
globalScope.MutationObserver = window.MutationObserver;
globalScope.DOMParser = window.DOMParser;
globalScope.getComputedStyle = window.getComputedStyle.bind(window);
globalScope.performance = window.performance;
globalScope.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalScope.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

if (typeof window.matchMedia === "function") {
	globalScope.matchMedia = window.matchMedia.bind(window);
}

const fakeRect = () => ({
	x: 0,
	y: 0,
	width: 100,
	height: 100,
	top: 0,
	left: 0,
	right: 100,
	bottom: 100,
	toJSON() {
		return {};
	},
});

if (window.HTMLElement) {
	window.HTMLElement.prototype.getBoundingClientRect = fakeRect;
}

if (window.Range) {
	window.Range.prototype.getBoundingClientRect = fakeRect;
}

module.exports = {
	window,
	document: window.document,
};
