// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 cat-left-paw
// Origin: nyoze src/editor-core/features/inputSurface/surfaceBackdrop.ts @ 020b5501 (2026-10-22)
// Local changes: comments in English; the repo's style.

/**
 * The opaque color under the composing text, when it is drawn over the text (Nyoze PIS-S10-CURRENT-LINE2 (b)).
 *
 * From the textblock outward, take the first opaque background and put the translucent backgrounds nearer the
 * text over it in the order a browser would paint (outermost first). A translucent backdrop lets the text
 * below show through the composing text. Pure: it reads no DOM.
 */
export type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

const clamp = (value: number, max: number): number => Math.min(max, Math.max(0, value));

/** A computed color (`rgb()`, `rgba()`, `color(srgb …)`) as 0–255 channels and 0–1 alpha; null for other forms. */
export function parseComputedColor(value: string): Rgba | null {
	const text = value.trim();
	if (text === "transparent") return [0, 0, 0, 0];
	const legacy = /^rgba?\(([^)]+)\)$/.exec(text);
	const srgb = legacy ? null : /^color\(srgb\s+([^)]+)\)$/.exec(text);
	const body = legacy?.[1] ?? srgb?.[1];
	if (body === undefined) return null;
	const parts = body.split(/[\s,/]+/).filter(Boolean).map(part => (part === "none" ? 0 : Number(part)));
	if ((parts.length !== 3 && parts.length !== 4) || parts.some(part => !Number.isFinite(part))) return null;
	const scale = srgb ? 255 : 1;
	return [clamp(parts[0] * scale, 255), clamp(parts[1] * scale, 255), clamp(parts[2] * scale, 255), clamp(parts[3] ?? 1, 1)];
}

/** Fully transparent (a form that cannot be read counts as not transparent). */
export function isTransparentColor(value: string): boolean {
	return parseComputedColor(value)?.[3] === 0;
}

/** Opaque (a form that cannot be read cannot be composed, so it counts as opaque). */
export function isOpaqueColor(value: string): boolean {
	const color = parseComputedColor(value);
	return !color || color[3] >= 1;
}

/**
 * `backgrounds` are the computed backgrounds from the textblock outward. The result is the first opaque
 * background with the nearer translucent ones composed over it, or `fallback` when none is opaque.
 */
export function resolveOpaqueBackdrop(backgrounds: readonly string[], fallback: string): string {
	const layers: Rgba[] = [];
	let base: string = fallback;
	for (const value of backgrounds) {
		const color = parseComputedColor(value);
		if (color && color[3] <= 0) continue;
		if (!color || color[3] >= 1) { base = value; break; }
		layers.push(color);
	}
	const opaque = parseComputedColor(base);
	// A base that cannot be read cannot be composed: use it as it is.
	if (!opaque || layers.length === 0) return base;
	let [red, green, blue] = opaque;
	for (let index = layers.length - 1; index >= 0; index -= 1) {
		const [r, g, b, alpha] = layers[index];
		red = r * alpha + red * (1 - alpha);
		green = g * alpha + green * (1 - alpha);
		blue = b * alpha + blue * (1 - alpha);
	}
	return `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
}
