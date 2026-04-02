type PointAwareDocument = Document & {
	elementsFromPoint?: (x: number, y: number) => Element[];
	elementFromPoint?: (x: number, y: number) => Element | null;
};

type ViewWindow = Window & typeof globalThis;
type ViewWindowWithObserver = ViewWindow & {
	IntersectionObserver?: typeof IntersectionObserver;
};

export function getViewDocument(target: Node | null): Document {
	return target?.ownerDocument ?? document;
}

export function getViewWindow(target: Node | null): ViewWindow {
	return (target?.ownerDocument?.defaultView ?? window) as ViewWindow;
}

export function getViewComputedStyle(target: Element): CSSStyleDeclaration {
	return getViewWindow(target).getComputedStyle(target);
}

export function createViewDocumentFragment(
	target: Node | null,
): DocumentFragment {
	return getViewDocument(target).createDocumentFragment();
}

export function createViewElement<K extends keyof HTMLElementTagNameMap>(
	target: Node | null,
	tagName: K,
): HTMLElementTagNameMap[K] {
	return getViewDocument(target).createElement(tagName);
}

export function elementsFromViewPoint(
	target: Node | null,
	x: number,
	y: number,
): Element[] {
	const doc = getViewDocument(target) as PointAwareDocument;
	if (typeof doc.elementsFromPoint === "function") {
		return doc.elementsFromPoint(x, y);
	}
	return [];
}

export function elementFromViewPoint(
	target: Node | null,
	x: number,
	y: number,
): Element | null {
	const doc = getViewDocument(target) as PointAwareDocument;
	if (typeof doc.elementFromPoint === "function") {
		return doc.elementFromPoint(x, y);
	}
	return null;
}

export function setViewTimeout(
	target: Node | null,
	callback: () => void,
	timeoutMs: number,
): number {
	return getViewWindow(target).setTimeout(callback, timeoutMs);
}

export function clearViewTimeout(
	target: Node | null,
	timeoutId: number,
): void {
	getViewWindow(target).clearTimeout(timeoutId);
}

export function requestViewAnimationFrame(
	target: Node | null,
	callback: FrameRequestCallback,
): number {
	return getViewWindow(target).requestAnimationFrame(callback);
}

export function cancelViewAnimationFrame(
	target: Node | null,
	animationFrameId: number,
): void {
	getViewWindow(target).cancelAnimationFrame(animationFrameId);
}

export function createViewIntersectionObserver(
	target: Node | null,
	callback: IntersectionObserverCallback,
	options?: IntersectionObserverInit,
): IntersectionObserver | null {
	const view = getViewWindow(target) as ViewWindowWithObserver;
	const ObserverCtor =
		view.IntersectionObserver ??
		(typeof IntersectionObserver !== "undefined"
			? IntersectionObserver
			: undefined);
	return ObserverCtor ? new ObserverCtor(callback, options) : null;
}
