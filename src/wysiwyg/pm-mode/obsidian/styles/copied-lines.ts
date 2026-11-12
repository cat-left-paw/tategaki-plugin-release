// Copied from styles.css (ranges recorded in tests/pm-mode/m1-2-css-provenance.json) @ 3603e14 (2026-10-17).
// Local changes: Scope to Shadow DOM, rename root/line selectors, adapt run selectors to nested mark spans; omit non-display paths.
// Local changes: Put theme aliases on :host; retain only this mode from combined selectors. Native Ruby/frame rules are separate.
// Local changes (M1-4, styles.css unchanged @ 42ef031): Add the fold toggle / ellipsis and the math / image / embed widget line rules.
// Local changes (2026-10-18, styles.css unchanged @ fc39317): Add the horizontal root rule (styles.css:3597), which the M1-2 ranges missed.
// Local changes (M1-7): Drop V's footnote-definition box and its ::before number (styles.css:4496, 4507 @ 3603e14): a definition line is shown as it is (its dimmed [label]: is in styles/stylesheet.ts).
export const copiedLineCss = String.raw`
/* styles.css:109 */
:host {
	--tategaki-app-text-normal: var(--text-normal);
	--tategaki-app-text-muted: var(--text-muted);
	--tategaki-app-background-primary: var(--background-primary);
	--tategaki-app-background-secondary: var(--background-secondary);
	--tategaki-app-background-secondary-alt: var(--background-secondary-alt);
	--tategaki-app-background-modifier-border: var(
		--background-modifier-border
	);
	--tategaki-surface-bg: color-mix(
		in srgb,
		var(
				--tategaki-background-color,
				var(--tategaki-app-background-primary)
			)
			88%,
		var(--tategaki-text-color, var(--tategaki-app-text-normal)) 12%
	);
	--tategaki-surface-bg-alt: color-mix(
		in srgb,
		var(
				--tategaki-background-color,
				var(--tategaki-app-background-primary)
			)
			82%,
		var(--tategaki-text-color, var(--tategaki-app-text-normal)) 18%
	);
	--tategaki-surface-emphasis-bg: color-mix(
		in srgb,
		var(
				--tategaki-background-color,
				var(--tategaki-app-background-primary)
			)
			74%,
		var(--tategaki-text-color, var(--tategaki-app-text-normal)) 26%
	);
	--tategaki-surface-border: color-mix(
		in srgb,
		var(
				--tategaki-background-color,
				var(--tategaki-app-background-primary)
			)
			72%,
		var(--tategaki-text-color, var(--tategaki-app-text-normal)) 28%
	);
	--tategaki-muted-text: color-mix(
		in srgb,
		var(--tategaki-text-color, var(--tategaki-app-text-normal)) 68%,
		var(
				--tategaki-background-color,
				var(--tategaki-app-background-primary)
			)
			32%
	);
	--tategaki-code-bg: color-mix(
		in srgb,
		var(
				--tategaki-background-color,
				var(--tategaki-app-background-primary)
			)
			84%,
		var(--tategaki-text-color, var(--tategaki-app-text-normal)) 16%
	);
	--tategaki-code-text: var(
		--tategaki-text-color,
		var(--tategaki-app-text-normal)
	);
	--background-primary: var(
		--tategaki-background-color,
		var(--tategaki-app-background-primary)
	);
	--background-primary-alt: var(--tategaki-surface-bg-alt);
	--background-secondary: var(--tategaki-surface-bg);
	--background-secondary-alt: var(--tategaki-surface-bg-alt);
	--background-modifier-border: var(--tategaki-surface-border);
	--background-modifier-hover: color-mix(
		in srgb,
		var(--background-secondary) 82%,
		var(--text-normal) 18%
	);
	--text-normal: var(--tategaki-text-color, var(--tategaki-app-text-normal));
	--text-muted: var(--tategaki-muted-text);
	--code-normal: var(--tategaki-code-text);
	--code-comment: var(--tategaki-muted-text);
	--code-punctuation: color-mix(
		in srgb,
		var(--tategaki-code-text) 72%,
		var(
				--tategaki-background-color,
				var(--tategaki-app-background-primary)
			)
			28%
	);
}

/* styles.css:3555 */
.tategaki-pm-root {
	position: relative;
	width: 100%;
	height: 100%;
	overflow: auto;
	overflow-anchor: none;
	scroll-behavior: auto;
	box-sizing: border-box;
	padding: 16px;
	background-color: var(
		--tategaki-background-color,
		var(--background-primary)
	);
	color: var(--tategaki-text-color, var(--text-normal));
	font-family: var(--tategaki-font-family, var(--font-text));
	font-size: var(--tategaki-font-size, 18px);
	line-height: var(--tategaki-line-height, 1.8);
	writing-mode: var(--tategaki-writing-mode, vertical-rl);
	text-orientation: mixed;
	word-break: break-word;
	overflow-wrap: anywhere;
	text-wrap: pretty;
}

/* styles.css:3597 */
.tategaki-pm-root[data-writing-mode="horizontal-tb"] {
	text-orientation: initial;
	padding-inline-start: 28px;
}

/* styles.css:3707 */
.tategaki-pm-root span {
	white-space: pre-wrap;
	word-break: break-word;
	overflow-wrap: anywhere;
}

/* styles.css:3748 */
.tategaki-pm-root .tategaki-md-strong {
	font-weight: 700;
}

/* styles.css:3752 */
.tategaki-pm-root .tategaki-md-em {
	font-style: italic;
}

/* styles.css:3756 */
.tategaki-pm-root .tategaki-md-code {
	font-family: var(--font-monospace);
	background-color: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 3px;
	padding: 0 0.15em;
}

/* styles.css:3765 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) .tategaki-md-code {
	text-orientation: sideways;
}

/* styles.css:3770 */
.tategaki-pm-root .tategaki-md-strike {
	text-decoration: line-through;
}

/* styles.css:3774 */
.tategaki-pm-root .tategaki-md-highlight {
	background-color: rgba(255, 221, 0, 0.25);
}

/* styles.css:3778 */
.tategaki-pm-root .tategaki-md-tcy {
	display: inline-block;
	text-combine-upright: all;
	-webkit-text-combine: horizontal;
	text-orientation: mixed;
	line-height: 1;
}

/* styles.css:3786 */
.tategaki-pm-root .tategaki-md-underline {
	text-decoration: underline;
	text-decoration-color: color-mix(
		in srgb,
		var(--text-normal) 70%,
		transparent
	);
	text-underline-offset: 0.12em;
	text-decoration-thickness: 0.08em;
}

/* styles.css:3797 */
.tategaki-pm-root .tategaki-md-inline-widget {
	display: inline-block;
	vertical-align: middle;
}

/* styles.css:3802 */
.tategaki-pm-root .tategaki-md-math-inline-widget {
	color: var(--text-normal);
	background: color-mix(
		in srgb,
		var(--background-secondary) 70%,
		transparent
	);
	border: 1px solid var(--background-modifier-border);
	border-radius: 6px;
	padding: 0.05em 0.35em;

	writing-mode: horizontal-tb;
	text-orientation: mixed;
	white-space: normal;
}

/* styles.css:3818 */
.tategaki-pm-root .tategaki-md-math-inline-widget.is-fallback {
	font-family: var(--font-monospace);
	font-style: italic;
}

/* styles.css:3823 */
.tategaki-pm-root .tategaki-md-link {
	color: var(--link-color);
	text-decoration: underline;
	text-decoration-color: color-mix(
		in srgb,
		var(--link-color) 60%,
		transparent
	);
	text-underline-offset: 0.12em;
	text-decoration-thickness: 0.08em;
	cursor: pointer;
}

/* styles.css:3836 */
.tategaki-pm-root .tategaki-md-link:hover {
	text-decoration-color: var(--link-color);
}

/* styles.css:3840 */
.tategaki-pm-root .tategaki-md-image,
.tategaki-pm-root .tategaki-md-embed {
	display: inline-block;
	border: 1px solid var(--background-modifier-border);
	border-radius: 8px;
	padding: 0 0.35em;
	background: color-mix(
		in srgb,
		var(--background-secondary) 75%,
		transparent
	);
	color: var(--text-normal);
	cursor: pointer;
}

/* styles.css:3855 */
.tategaki-pm-root .tategaki-md-image::before {
	content: "IMG";
	font-family: var(--font-monospace);
	font-size: 0.75em;
	color: var(--text-muted);
	letter-spacing: 0.02em;
	margin-inline-end: 0.35em;
}

/* styles.css:3864 */
.tategaki-pm-root .tategaki-md-embed::before {
	content: "EMB";
	font-family: var(--font-monospace);
	font-size: 0.75em;
	color: var(--text-muted);
	letter-spacing: 0.02em;
	margin-inline-end: 0.35em;
}

/* styles.css:3873 */
.tategaki-pm-root .tategaki-md-footnote-ref {
	position: relative;
	display: inline-block;
	font-size: 0.75em;
	color: transparent;
	text-decoration: none;
	vertical-align: super;
}

/* styles.css:3882 */
.tategaki-pm-root .tategaki-md-footnote-ref::after {
	content: attr(data-footnote-number);
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	color: var(--text-muted);
	text-align: center;
	text-decoration: underline;
	text-decoration-color: color-mix(
		in srgb,
		var(--text-muted) 60%,
		transparent
	);
	text-underline-offset: 0.12em;
	text-decoration-thickness: 0.08em;
}

/* styles.css:3900 */
.tategaki-pm-root .tategaki-md-footnote-inline {
	display: inline-block;
	font-size: 0.75em;
	color: var(--text-muted);
	border: none;
	padding: 0;
	background: transparent;
	text-decoration: underline;
	text-decoration-color: color-mix(
		in srgb,
		var(--text-muted) 60%,
		transparent
	);
	text-underline-offset: 0.12em;
	text-decoration-thickness: 0.08em;
}

/* styles.css:3917 */
.tategaki-pm-root .tategaki-md-footnote-inline::before {
	content: "^[";
}

/* styles.css:3921 */
.tategaki-pm-root .tategaki-md-footnote-inline::after {
	content: "]";
}

/* styles.css:3925 */
.tategaki-pm-root[data-writing-mode="horizontal-tb"] .tategaki-md-footnote-inline {
	vertical-align: super;
}

/* styles.css:3930 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) .tategaki-md-footnote-inline {
	text-align: right;
}

/* styles.css:3935 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-image-widget {
	padding: 0.2em 0.4em;
}

/* styles.css:3971 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-embed-widget {
	padding: 0.2em 0.4em;
}

/* styles.css:4003 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-math-hidden {
	display: none;
}

/* styles.css:4007 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-math-widget {
	padding: 0.2em 0.4em;
}

/* styles.css:4039 */
.tategaki-pm-root .tategaki-pm-line {
	display: block;
	width: 100%;
}

/* styles.css:4104 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) .tategaki-pm-line {
	width: fit-content;
	min-width: calc(var(--tategaki-line-height, 1.8) * 1em);
}

/* styles.css:4110 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-heading {
	position: relative;
	font-weight: 700;
	font-family: var(
		--tategaki-heading-font-family,
		var(--tategaki-font-family, inherit)
	);
	color: var(
		--tategaki-heading-text-color,
		var(--tategaki-text-color, inherit)
	);
	overflow: visible;
	margin-block-end: var(--tategaki-heading-margin-after, 0.45em);
	text-align: var(--tategaki-heading-align, start);
}

/* styles.css:4127 */
.tategaki-pm-root.tategaki-heading-divider-h1 .tategaki-pm-line.tategaki-md-heading-1,
.tategaki-pm-root.tategaki-heading-divider-h2 .tategaki-pm-line.tategaki-md-heading-2,
.tategaki-pm-root.tategaki-heading-divider-h3 .tategaki-pm-line.tategaki-md-heading-3,
.tategaki-pm-root.tategaki-heading-divider-h4 .tategaki-pm-line.tategaki-md-heading-4,
.tategaki-pm-root.tategaki-heading-divider-h5 .tategaki-pm-line.tategaki-md-heading-5,
.tategaki-pm-root.tategaki-heading-divider-h6 .tategaki-pm-line.tategaki-md-heading-6 {
	border-block-end: 1px solid var(
		--tategaki-heading-text-color,
		var(--tategaki-text-color, currentColor)
	);
	padding-block-end: 0.15em;
}

/* styles.css:4140 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-heading-hidden {
	display: none;
}

/* styles.css:4144 */
.tategaki-pm-root .tategaki-md-heading-toggle {
	position: absolute;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 0.9em;
	height: 0.9em;
	color: var(--tategaki-text-color, var(--text-normal));
	font-size: 1em;
	line-height: 1;
	cursor: pointer;
	pointer-events: auto;
	user-select: none;
	opacity: 0;
	transform: scale(0.9);
	transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
	z-index: 2;
}

/* styles.css:4164 */
.tategaki-pm-root .tategaki-md-heading-toggle svg {
	width: 0.85em;
	height: 0.85em;
	fill: none;
	stroke: currentColor;
	stroke-width: 2;
}

/* styles.css:4173 */
.tategaki-pm-root .tategaki-pm-line[data-heading-foldable="1"]:hover .tategaki-md-heading-toggle,
.tategaki-pm-root .tategaki-pm-line[data-heading-foldable="1"] .tategaki-md-heading-toggle:hover {
	opacity: 0.8;
	transform: scale(1);
	color: var(--tategaki-text-color, var(--text-normal));
}

/* styles.css:4190 */
.tategaki-pm-root .tategaki-pm-line[data-heading-collapsed="1"][data-heading-foldable="1"] .tategaki-md-heading-toggle {
	opacity: 0.5;
	transform: scale(0.95);
}

/* styles.css:4200 */
.tategaki-pm-root .tategaki-md-heading-ellipsis {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1em;
	height: 1em;
	margin-inline-start: 0.3em;
	color: var(--tategaki-text-color, var(--text-normal));
	opacity: 0.8;
	pointer-events: auto;
	user-select: none;
	cursor: help;
	position: relative;
	transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* styles.css:4216 */
.tategaki-pm-root .tategaki-md-heading-ellipsis svg {
	width: 0.9em;
	height: 0.9em;
	fill: none;
	stroke: currentColor;
	stroke-width: 2;
}

/* styles.css:4224 */
.tategaki-pm-root .tategaki-md-heading-ellipsis:hover {
	opacity: 1;
	color: var(--tategaki-text-color, var(--text-normal));
}

/* styles.css:4230 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) .tategaki-md-heading-ellipsis svg {
	transform: rotate(90deg);
}

/* styles.css:4263 */
.tategaki-pm-root[data-writing-mode="horizontal-tb"] .tategaki-md-heading-toggle {
	left: -1.2em;
	top: 0.1em;
}

/* styles.css:4282 */
.tategaki-pm-root[data-writing-mode="vertical-rl"] .tategaki-md-heading-toggle {
	right: -0.1em;
	top: -0.6em;
}

/* styles.css:4301 */
.tategaki-pm-root[data-writing-mode="vertical-lr"] .tategaki-md-heading-toggle {
	left: -0.1em;
	top: -0.6em;
}

/* styles.css:4319 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-heading-1 {
	font-size: 1.6em;
}

/* styles.css:4323 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-heading-2 {
	font-size: 1.45em;
}

/* styles.css:4327 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-heading-3 {
	font-size: 1.3em;
}

/* styles.css:4331 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-heading-4 {
	font-size: 1.2em;
}

/* styles.css:4335 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-heading-5 {
	font-size: 1.1em;
}

/* styles.css:4339 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-heading-6 {
	font-size: 1.05em;
}

/* styles.css:4343 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-blockquote {
	background-color: var(--background-secondary);
	border-radius: 6px;
	padding: 0.15em 0.35em;
	padding-inline-start: calc(
		var(--tategaki-sot-blockquote-indent, 1em) *
			var(--tategaki-sot-blockquote-depth, 0)
	);
}

/* styles.css:4353 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-callout {
	background: color-mix(
		in srgb,
		var(--background-secondary) 80%,
		transparent
	);
	border: 1px solid var(--background-modifier-border);
	border-inline-start: 3px solid var(--interactive-accent);
	border-radius: 10px;
	padding: 0.25em 0.6em;
	color: var(--text-normal);
}

/* styles.css:4366 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-callout-title {
	font-weight: 700;
	color: var(--text-normal);
}

/* styles.css:4371 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-callout-title::before {
	content: attr(data-callout-type);
	display: inline-block;
	font-family: var(--font-monospace);
	font-size: 0.8em;
	color: var(--text-muted);
	opacity: 0.9;
	margin-inline-end: 0.6em;
}

/* styles.css:4381 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-callout-hidden {
	display: none;
}

/* styles.css:4385 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-callout-widget {
	padding: 0;
	background: transparent;
	border: 0;
	border-inline-start: 0;
	border-radius: 0;
}

/* styles.css:4393 */
.tategaki-pm-root .tategaki-md-callout-widget-inner {
	display: block;
	border: 0;
	border-radius: 0;
	padding: 0;
	background: transparent;
	max-inline-size: 100%;
	max-block-size: 80vh;
	overflow: auto;

	writing-mode: horizontal-tb;
	text-orientation: mixed;
}

/* styles.css:4413 */
.tategaki-pm-root .tategaki-md-callout-widget-content {
	white-space: normal;
}

/* styles.css:4424 */
.tategaki-pm-root .tategaki-md-callout-widget-content,
.tategaki-pm-root .tategaki-md-callout-widget-content.markdown-rendered {
	color: var(--tategaki-text-color, var(--tategaki-app-text-normal));
}

/* styles.css:4429 */
.tategaki-pm-root .tategaki-md-callout-widget-content .callout {
	--tategaki-callout-accent: rgb(var(--callout-color, 128, 128, 128));
	--callout-title-color: var(
		--tategaki-text-color,
		var(--tategaki-app-text-normal)
	);
	background: color-mix(
		in srgb,
		var(--tategaki-surface-bg) 88%,
		var(--tategaki-callout-accent) 12%
	);
	border: 1px solid
		color-mix(
			in srgb,
			var(--tategaki-surface-border) 55%,
			var(--tategaki-callout-accent) 45%
		);
	color: var(
		--tategaki-text-color,
		var(--tategaki-app-text-normal)
	) !important;
	box-shadow: none;
	mix-blend-mode: normal !important;
}

/* styles.css:4454 */
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-title,
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-fold {
	cursor: pointer;
}

/* styles.css:4459 */
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-title,
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-title-inner,
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-title-inner p,
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-content,
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-content p,
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-title-inner *,
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-content * {
	color: var(
		--tategaki-text-color,
		var(--tategaki-app-text-normal)
	) !important;
	-webkit-text-fill-color: var(
		--tategaki-text-color,
		var(--tategaki-app-text-normal)
	) !important;
	opacity: 1 !important;
	filter: none !important;
	mix-blend-mode: normal !important;
	text-shadow: none !important;
}

/* styles.css:4480 */
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-fold,
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-fold *,
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-icon,
.tategaki-pm-root .tategaki-md-callout-widget-content .callout-icon * {
	color: color-mix(
		in srgb,
		var(--tategaki-callout-accent) 82%,
		var(--tategaki-text-color, var(--tategaki-app-text-normal)) 18%
	) !important;
	-webkit-text-fill-color: currentColor !important;
}

/* styles.css:4492 */
.tategaki-pm-root .tategaki-md-callout-widget-content .callout.is-collapsed .callout-content {
	display: none;
}

/* styles.css:4517 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock {
	background: color-mix(
		in srgb,
		var(--background-secondary) 85%,
		transparent
	);
	border-left: 1px solid var(--background-modifier-border);
	border-right: 1px solid var(--background-modifier-border);
	padding-inline: 0.5em;
	padding-block: 0;
	border-radius: 0;
}

/* styles.css:4530 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock span {
	font-family: var(--font-monospace);
	font-size: 0.95em;
}

/* styles.css:4535 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock-part-single {
	border-top: 1px solid var(--background-modifier-border);
	border-bottom: 1px solid var(--background-modifier-border);
	border-radius: 8px;
	padding-block: 0.25em;
}

/* styles.css:4542 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock-part-start {
	border-top: 1px solid var(--background-modifier-border);
	border-radius: 8px 8px 0 0;
	padding-block-start: 0.25em;
}

/* styles.css:4548 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock-part-middle {
	border-top: 0;
	border-bottom: 0;
}

/* styles.css:4553 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock-part-end {
	border-bottom: 1px solid var(--background-modifier-border);
	border-radius: 0 0 8px 8px;
	padding-block-end: 0.25em;
}

/* styles.css:4560 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) .tategaki-pm-line.tategaki-md-codeblock {
	text-orientation: sideways;
	border-top: 1px solid var(--background-modifier-border);
	border-bottom: 1px solid var(--background-modifier-border);
	border-left: 0;
	border-right: 0;
}

/* styles.css:4569 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) .tategaki-pm-line.tategaki-md-codeblock-part-single {
	border-left: 1px solid var(--background-modifier-border);
	border-right: 1px solid var(--background-modifier-border);
	border-radius: 8px;
}

/* styles.css:4576 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) .tategaki-pm-line.tategaki-md-codeblock-part-start {
	border-top: 1px solid var(--background-modifier-border);
	border-bottom: 1px solid var(--background-modifier-border);
	border-right: 1px solid var(--background-modifier-border);
	border-left: 0;
	border-radius: 0 8px 8px 0;
	padding-block: 0.25em;
	padding-inline: 0.5em;
}

/* styles.css:4587 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) .tategaki-pm-line.tategaki-md-codeblock-part-middle {
	border-top: 1px solid var(--background-modifier-border);
	border-bottom: 1px solid var(--background-modifier-border);
	border-left: 0;
	border-right: 0;
	padding-block: 0;
	padding-inline: 0.5em;
}

/* styles.css:4597 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) .tategaki-pm-line.tategaki-md-codeblock-part-end {
	border-top: 1px solid var(--background-modifier-border);
	border-bottom: 1px solid var(--background-modifier-border);
	border-left: 1px solid var(--background-modifier-border);
	border-right: 0;
	border-radius: 8px 0 0 8px;
	padding-block: 0.25em;
	padding-inline: 0.5em;
}

/* styles.css:4609 */
.tategaki-pm-root[data-writing-mode="vertical-lr"] .tategaki-pm-line.tategaki-md-codeblock-part-start {
	border-right: 0;
	border-left: 1px solid var(--background-modifier-border);
	border-radius: 8px 0 0 8px;
}

/* styles.css:4616 */
.tategaki-pm-root[data-writing-mode="vertical-lr"] .tategaki-pm-line.tategaki-md-codeblock-part-end {
	border-left: 0;
	border-right: 1px solid var(--background-modifier-border);
	border-radius: 0 8px 8px 0;
}

/* styles.css:4623 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock.hljs {
	color: var(--code-normal, var(--text-normal));
}

/* styles.css:4627 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-comment,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-quote {
	color: var(--code-comment, var(--text-muted));
	font-style: italic;
}

/* styles.css:4633 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-keyword,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-selector-tag,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-literal,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-symbol,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-type {
	color: var(--code-keyword, var(--interactive-accent, #81a1c1));
}

/* styles.css:4641 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-function .hljs-title,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-title.function_,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-built_in,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-class .hljs-title,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-title.class_ {
	color: var(--code-function, var(--interactive-accent, #88c0d0));
}

/* styles.css:4649 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-string,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-meta .hljs-string,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-template-tag,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-template-variable {
	color: var(--code-string, #a3be8c);
}

/* styles.css:4656 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-number,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-attr,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-attribute,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-property,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-variable,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-variable.language_ {
	color: var(--code-number, #b48ead);
}

/* styles.css:4665 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-meta,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-meta .hljs-keyword,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-tag,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-name,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-title,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-section {
	color: var(--code-tag, #d08770);
}

/* styles.css:4674 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-punctuation,
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock .hljs-operator {
	color: var(--code-punctuation, var(--text-muted, #616e88));
}

/* styles.css:4679 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock-fence {
	min-height: 1em;
}

/* styles.css:4683 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-codeblock-fence::before {
	content: attr(data-code-info);
	display: inline-block;
	font-family: var(--font-monospace);
	font-size: 0.8em;
	color: var(--text-muted);
	opacity: 0.9;
}

/* styles.css:4692 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-frontmatter {
	background: color-mix(
		in srgb,
		var(--background-secondary) 70%,
		transparent
	);
	border: 1px solid var(--background-modifier-border);
	border-radius: 8px;
	padding: 0.15em 0.5em;
}

/* styles.css:4703 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-frontmatter span {
	font-family: var(--font-monospace);
	font-size: 0.9em;
}

/* styles.css:4708 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-frontmatter-fence {
	min-height: 1em;
}

/* styles.css:4712 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-frontmatter-fence::before {
	content: "frontmatter";
	display: inline-block;
	font-family: var(--font-monospace);
	font-size: 0.8em;
	color: var(--text-muted);
	opacity: 0.9;
}

/* styles.css:4721 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-frontmatter-hidden {
	display: none;
}

/* styles.css:4725 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-table {
	background: color-mix(
		in srgb,
		var(--background-secondary) 70%,
		transparent
	);
	border: 1px solid var(--background-modifier-border);
	border-radius: 10px;
	padding: 0.2em 0.5em;
}

/* styles.css:4736 */
.tategaki-pm-root .tategaki-md-table-row-container {
	display: inline-flex;
	gap: 0.35em;
}

/* styles.css:4741 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) .tategaki-md-table-row-container {
	flex-direction: column;
}

/* styles.css:4746 */
.tategaki-pm-root[data-writing-mode="horizontal-tb"] .tategaki-md-table-row-container {
	flex-direction: row;
}

/* styles.css:4751 */
.tategaki-pm-root .tategaki-md-table-cell {
	display: inline-block;
	padding: 0.12em 0.45em;
	border: 1px solid var(--background-modifier-border);
	border-radius: 8px;
	background: color-mix(in srgb, var(--background-primary) 80%, transparent);
	color: var(--text-normal);
}

/* styles.css:4760 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-table-header .tategaki-md-table-cell {
	font-weight: 700;
	background: var(--tategaki-surface-emphasis-bg);
	color: var(--text-normal);
}

/* styles.css:4766 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-table-sep {
	min-block-size: 0.6em;
}

/* styles.css:4770 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-table-hidden {
	display: none;
}

/* styles.css:4774 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-table-widget {
	padding: 0.2em 0.4em;
}

/* styles.css:4778 */
.tategaki-pm-root .tategaki-md-table-widget-inner {
	display: block;
	border: 1px solid var(--background-modifier-border);
	border-radius: 12px;
	padding: 0.5em;
	background: color-mix(
		in srgb,
		var(--background-secondary) 70%,
		transparent
	);
	max-inline-size: 100%;
	max-block-size: 80vh;
	overflow: auto;

	writing-mode: horizontal-tb;
	text-orientation: mixed;
}

/* styles.css:4802 */
.tategaki-pm-root .tategaki-md-table-widget-content {
	white-space: normal;
}

/* styles.css:4806 */
.tategaki-pm-root .tategaki-md-table-widget-content th,
.tategaki-pm-root .tategaki-md-table-widget-content thead td {
	background: var(--tategaki-surface-emphasis-bg);
	color: var(--text-normal);
	border-color: var(--background-modifier-border);
}

/* styles.css:4813 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-deflist-hidden {
	display: none;
}

/* styles.css:4817 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-deflist-widget {
	padding: 0.2em 0.4em;
}

/* styles.css:4821 */
.tategaki-pm-root .tategaki-md-deflist-widget-inner {
	display: block;
	border: 1px solid var(--background-modifier-border);
	border-radius: 12px;
	padding: 0.5em;
	background: color-mix(
		in srgb,
		var(--background-secondary) 70%,
		transparent
	);
	max-inline-size: 100%;
	max-block-size: 80vh;
	overflow: auto;
	writing-mode: horizontal-tb;
	text-orientation: mixed;
}

/* styles.css:4844 */
.tategaki-pm-root .tategaki-md-deflist-widget-content {
	white-space: normal;
}

/* styles.css:4848 */
.tategaki-pm-root .tategaki-md-table-sep-line {
	display: block;
	inline-size: 100%;
	block-size: 1px;
	background: var(--background-modifier-border);
	opacity: 0.9;
}

/* styles.css:4856 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-list {
	position: relative;

	padding-inline-start: calc(
		var(--tategaki-sot-list-indent, 1.2em) *
			var(--tategaki-sot-list-depth, 0)
	);
}

/* styles.css:4865 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-list::before {
	content: "";
	display: inline-block;
	opacity: 1;
	color: currentColor;
	margin-inline-end: 0.35em;
}

/* styles.css:4873 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-list[data-md-kind="olist"]::before {
	content: attr(data-list-marker);
	width: auto;
	height: auto;
	background: none;
	border: 0;
	opacity: 1;
}

/* styles.css:4882 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-list[data-md-kind="list"]::before {
	width: 0.42em;
	height: 0.42em;
	border-radius: 999px;
	opacity: 0.95;
	transform: translateY(0.05em);
}

/* styles.css:4890 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-list[data-md-kind="list"][data-list-bullet="0"]::before {
	background: currentColor;
	border: 0;
}

/* styles.css:4895 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-list[data-md-kind="list"][data-list-bullet="1"]::before {
	background: transparent;
	border: 2px solid currentColor;
}

/* styles.css:4901 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-list[data-md-kind="task"]::before {
	display: none;
	margin-inline-end: 0;
}

/* styles.css:4906 */
.tategaki-pm-root .tategaki-md-task-box {
	display: inline-block;
	width: 0.9em;
	height: 0.9em;
	border-radius: 4px;
	border: 2px solid
		color-mix(
			in srgb,
			var(--text-muted) 55%,
			var(--background-modifier-border)
		);
	background: var(--background-primary);
	box-sizing: border-box;
	opacity: 1;
	color: var(--text-normal);
	transform: translateY(0.05em);
	margin-inline-end: 0.35em;
	cursor: pointer;
	pointer-events: auto;
}

/* styles.css:4927 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-task[data-task-checked="1"] .tategaki-md-task-box {
	border-color: var(--interactive-accent);
	background: color-mix(in srgb, var(--interactive-accent) 18%, transparent);
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='%234a90e2' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' d='M3 8.5l3 3L13 4.5'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: center;
	background-size: 80% 80%;
}

/* styles.css:4937 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-task[data-task-checked="1"] span {
	text-decoration: line-through;
	text-decoration-thickness: 2px;
	text-decoration-color: color-mix(
		in srgb,
		var(--text-muted) 75%,
		transparent
	);
}

/* styles.css:4947 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-hr {
	position: relative;
	min-height: 1em;
}

/* styles.css:4952 */
.tategaki-pm-root .tategaki-pm-line.tategaki-md-hr::before {
	content: "";
	position: absolute;
	left: 0;
	right: 0;
	top: 50%;
	height: 1px;
	background: var(--background-modifier-border);
	opacity: 0.9;
}

/* styles.css:4963 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) .tategaki-pm-line.tategaki-md-hr {
	min-height: 1em;
	min-width: 1em;
}

/* styles.css:4969 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) .tategaki-pm-line.tategaki-md-hr::before {
	top: 0;
	bottom: 0;
	left: 50%;
	right: auto;
	width: 1px;
	height: auto;
}

/* styles.css:5227 */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]),
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) span,
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) span {
	line-break: strict;
	word-break: normal;
	overflow-wrap: break-word;
}
`;
