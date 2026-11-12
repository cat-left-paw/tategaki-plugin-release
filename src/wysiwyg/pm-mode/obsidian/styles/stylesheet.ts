import { copiedLineCss } from "./copied-lines";

// Frame is new. Native ruby follows src/pm-mode-spike/styles.ts:165-190 (D20), without importing it.
export const pmModeStylesheet = copiedLineCss + String.raw`
:host {
	/* J7: a native selection may begin in the page margin before entering the text root. */
	user-select: text;
	-webkit-user-select: text;
	display: block;
	position: absolute;
	inset: 0;
	background: var(--tategaki-pm-page-background);
	color: var(--tategaki-text-color);
}
:host .tategaki-pm-page {
	position: absolute;
	inset: var(--tategaki-pm-page-inset);
}
:host .tategaki-pm-page-border {
	position: relative;
	width: 100%;
	height: 100%;
	transform-origin: center center;
	transform: scale(var(--tategaki-pm-page-scale));
	box-shadow: var(--tategaki-pm-page-shadow);
	background: var(--tategaki-background-color);
}
:host .tategaki-pm-scroll {
	position: relative;
	width: 100%;
	box-sizing: border-box;
	overflow: auto;
	overflow-anchor: none;
	writing-mode: var(--tategaki-writing-mode);
}
.tategaki-pm-root {
	position: relative;
	box-sizing: border-box;
	min-height: 0;
	overflow: visible;
	outline: none;
	font-weight: 400;
	font-style: normal;
	font-stretch: normal;
	text-transform: none;
	margin: 0;
	padding-top: var(--tategaki-pm-padding-top);
	padding-bottom: var(--tategaki-pm-padding-bottom);
	letter-spacing: var(--tategaki-letter-spacing);
	text-align: justify;
	text-align-last: auto;
	text-justify: inter-ideograph;
	/* Obsidian disables selection on body. The read-only text still lends native selection to the pointer. */
	user-select: text;
	-webkit-user-select: text;
	caret-color: transparent;
}
/* The height (vertical) or the least height (horizontal) is written on the root by mount.ts. */
.tategaki-pm-root[data-writing-mode="horizontal-tb"] {
	height: auto;
}
.tategaki-pm-root .tategaki-pm-line {
	unicode-bidi: isolate;
}
/* VLB1 (D-V-1, D-V-2, D-V-3; Nyoze BETA-TY-VLB1, src/styles.css @ 6fb200f8, investigation docs/vertical-inline-boundary-line-break-investigation.md): Chromium rolls the line break of a vertical paragraph
   back to the last inline boundary (ruby, bold, link, TCY, span) before it when the paragraph's last character is a full-width closing bracket that does not fit at the end of the column, and
   makes an extremely short column. A zero-width space after the paragraph's text gives the break an opportunity and the roll-back is gone. Display only: generated content (never in the
   display's DOM text, the document, the Markdown, the copy, the input record), and the empty alternative text keeps it out of the accessibility tree.
   The rule is for the plain paragraph lines of vertical writing (not the headings, lists, quotes, code, parts: they carry the data-md-kind attribute; not the definition lines), and not for a line that
   has ProseMirror's trailing break, always its last child (an empty line; a line that ends in a Ruby, a vertical-in-horizontal text or an inline formula, whose last child is not text; a line with a composition's
   room at its end): the generated space would come after the break and make an empty column (measured: the line's width doubles), and such a line does not end in a character the roll-back is about.
   To turn it off, delete this one rule. */
.tategaki-pm-root:not([data-writing-mode="horizontal-tb"]) tg-line.tategaki-pm-line:not([data-md-kind]):not([data-definition-label]):not(:has(> br.ProseMirror-trailingBreak))::after {
	content: "\200B" / "";
}
.tategaki-pm-root ruby.tategaki-aozora-ruby {
	ruby-position: over;
}
.tategaki-pm-root ruby.tategaki-aozora-ruby rt {
	font-size: calc(var(--tategaki-ruby-size) * 1em);
	padding-block-end: calc(var(--tategaki-pm-ruby-gap) * 1em);
	line-height: normal;
	color: inherit;
	white-space: nowrap;
	user-select: none;
	pointer-events: none;
}
/* M3b (D-M3-11, J25): the number of a footnote reference is generated content over the id's characters; a drag that begins on it
   must reach those characters (the text under it), as a drag on any other text does. The generated content takes no pointer. */
.tategaki-pm-root .tategaki-md-footnote-ref::after {
	pointer-events: none;
}
/* M1-7 (D-M17-3): the [label]: of a definition line ("[^1]: note", "[注]: text") is dimmed; the line's characters stay as written. The colour is the theme's muted text colour
   (the mode's :host maps --text-muted to the mix of its text and background colours). Nyoze's counterpart: styles.css @ e1da1a98, .nyoze-ref-def-label { color: var(--text-muted) }. */
.tategaki-pm-root .tategaki-md-definition-label {
	color: var(--text-muted);
}
/* M3b (range-overlay.ts, D-M3-10, PIS-RANGE-DISPLAY1): what a selected range shows that the CSS Custom Highlight cannot paint (the line breaks, the parts, the rules)
   and, without the highlight registry, the text: a layer of boxes in the scrolling element (content coordinates, no pointer, above the text, below the
   input surface at 19). The boxes' places are written by range-overlay.ts; the colors are the native selection's (variables on the layer). */
:host .tategaki-pm-range-layer {
	position: absolute;
	left: 0;
	top: 0;
	width: 0;
	height: 0;
	margin: 0;
	padding: 0;
	border: 0;
	overflow: visible;
	pointer-events: none;
	z-index: 1;
	overflow-anchor: none;
}
:host .tategaki-pm-range-layer > div {
	position: absolute;
	pointer-events: none;
}
:host .tategaki-pm-range-layer > [data-tategaki-range="newline"] {
	background-color: var(--tategaki-pm-range-bg);
}
:host .tategaki-pm-range-layer > [data-tategaki-range="text"],
:host .tategaki-pm-range-layer > [data-tategaki-range="atom"] {
	background-color: var(--tategaki-pm-range-bg);
	opacity: var(--tategaki-pm-range-wash-opacity);
}
/* M1-4 (D23): the part is drawn in the host's light DOM and projected here by a slot; it lays out
   as if it were the frame's child (display: contents), so V's widget DOM and styles.css apply. */
.tategaki-pm-root tg-frontmatter,
.tategaki-pm-root tg-widget {
	display: block;
}
.tategaki-pm-root slot::slotted(tategaki-pm-part) {
	display: contents;
}
/* V's caret anchor after a math / table / deflist / image / embed widget (span.tategaki-sot-eol,
   styles.css:5013-5022 and 5042-5047; hidden for callouts at 4417) took one more line pitch. M1 has
   no such element (M1 design §9 #7); this keeps the same width. */
.tategaki-pm-root tg-widget.tategaki-md-math-widget::after,
.tategaki-pm-root tg-widget.tategaki-md-table-widget::after,
.tategaki-pm-root tg-widget.tategaki-md-deflist-widget::after,
.tategaki-pm-root tg-widget.tategaki-md-image-widget::after,
.tategaki-pm-root tg-widget.tategaki-md-embed-widget::after {
	content: "";
	display: inline-block;
	width: calc(var(--tategaki-line-height, 1.8) * 1em);
	height: 0.5em;
	vertical-align: top;
}
.tategaki-pm-root[data-writing-mode="horizontal-tb"] tg-widget.tategaki-md-math-widget::after,
.tategaki-pm-root[data-writing-mode="horizontal-tb"] tg-widget.tategaki-md-table-widget::after,
.tategaki-pm-root[data-writing-mode="horizontal-tb"] tg-widget.tategaki-md-deflist-widget::after,
.tategaki-pm-root[data-writing-mode="horizontal-tb"] tg-widget.tategaki-md-image-widget::after,
.tategaki-pm-root[data-writing-mode="horizontal-tb"] tg-widget.tategaki-md-embed-widget::after {
	width: 0.5em;
	height: calc(var(--tategaki-line-height, 1.8) * 1em);
	vertical-align: baseline;
}
/* CHUNK1 (pm/chunk-layout.ts): runs of text lines are grouped into chunks. A chunk is a plain block
   box with no margin, border or padding, so the lines' margins collapse through it as before. */
.tategaki-pm-root tg-chunk {
	display: block;
}
/* CHUNK2-B (chunk-skip.ts, chunked-skip design §9): the chunks outside the view skip their layout and paint;
   chunk-skip.ts writes each chunk's size (contain-intrinsic-block-size). Skipping also clips what is drawn
   outside the chunk, so a chunk reaches over the root's padding along the lines (a negative margin and the
   same padding; the lines stay where they are): what a line draws past its end (hanging punctuation) is
   inside it. The paddings are the root's (vertical: these variables; horizontal: copied-lines.ts, 28px and
   16px; a test compares them). */
.tategaki-pm-root[data-tategaki-pm-chunk-skip="on"] tg-chunk {
	content-visibility: auto;
}
/* chunk-skip.ts, rescaling: a skipped chunk is hidden until the ResizeObserver sees its new size (a class, not an inline style: styles are not written from code). The selector is more specific
   than the rule above (0,3,1 against 0,2,1), so it wins as the inline value did. */
.tategaki-pm-root[data-tategaki-pm-chunk-skip="on"] tg-chunk.tategaki-pm-chunk-forget-size {
	content-visibility: hidden;
}
.tategaki-pm-root[data-tategaki-pm-chunk-skip="on"]:not([data-writing-mode="horizontal-tb"]) tg-chunk {
	margin-top: calc(-1 * var(--tategaki-pm-padding-top));
	padding-top: var(--tategaki-pm-padding-top);
	margin-bottom: calc(-1 * var(--tategaki-pm-padding-bottom));
	padding-bottom: var(--tategaki-pm-padding-bottom);
}
.tategaki-pm-root[data-tategaki-pm-chunk-skip="on"][data-writing-mode="horizontal-tb"] tg-chunk {
	margin-left: -28px;
	padding-left: 28px;
	margin-right: -16px;
	padding-right: 16px;
}
.tategaki-pm-root tg-gap {
	display: block;
	inline-size: 0;
	block-size: 0;
	overflow: hidden;
}
/* M4b (D-M4-1, Nyoze compositionPresentation.ts): the room reserved in a text line for the text being composed (pm/composition-widget.ts, composition-presentation.ts). It takes the
   room of the composing text and draws nothing: the input surface draws the characters (and the input method's own marks) over it. Fixed rules; only the widget's text changes. The
   widget is in no mark, so it takes the line's own typography, as the surface copies it. !important: nothing around it (a link's color, the focus dimming) may show through. */
.tategaki-pm-root .tategaki-pm-preedit-widget {
	/* M4c round 3 (P2-1): the room is as wide as the characters of the input surface, which does not trim adjacent punctuation as the row does (text-spacing-trim: normal makes an opening bracket after a full stop half a character wide), so the room is not trimmed either. */
	text-spacing-trim: space-all;
	color: transparent !important;
	-webkit-text-fill-color: transparent !important;
	text-decoration-color: transparent !important;
	text-shadow: none !important;
	background-color: transparent !important;
	pointer-events: none;
}
/* offscreen-skip.ts (off in the product since 2026-10-21, M1 design D25): the text lines outside the view
   skip their layout and paint. A skipped line takes the size the browser remembered from the full layout
   before skipping started; a line never laid out takes the average. Skipping also clips what a line draws
   outside its box, so headings (the fold toggle sits outside the line) and Obsidian parts / frontmatter
   (their size and overflow come from Obsidian) are never skipped. Nothing here applies while it is off. */
.tategaki-pm-root[data-tategaki-pm-skip="measuring"] > tg-line:not(.tategaki-md-heading),
.tategaki-pm-root[data-tategaki-pm-skip="on"] > tg-line:not(.tategaki-md-heading) {
	contain-intrinsic-block-size: auto var(--tategaki-pm-skip-fallback, 10em);
}
.tategaki-pm-root[data-tategaki-pm-skip="on"] > tg-line:not(.tategaki-md-heading) {
	content-visibility: auto;
}
/* M2-2b (M2 design §7.1): the input surface. One element, a child of the scrolling element beside the PM root (the
   root is aria-hidden: the surface is never inside it). input-surface.ts writes its place (content coordinates), size
   and typography; the rules here never change, and nothing here is written during a composition. It takes no
   pointer event (a click goes through to the text). Nyoze: position absolute, z-index 19 (above the text, below the
   pseudo caret of M3), PREEDIT-FOLLOW1's scroll-margin and overflow-anchor: none. */
:host .tategaki-pm-input-surface {
	position: absolute;
	left: 0;
	top: 0;
	right: auto;
	inline-size: auto;
	block-size: auto;
	text-indent: 0;
	/* J33: placement already indents to the caret; aligning this empty surface again would move its native caret. (Written as a rule, not from code: surface-typography.ts used to write
	   these two inline; text-align and text-align-last are not copied from the line, so nothing inline competes.) */
	text-align: start;
	text-align-last: start;
	z-index: 19;
	margin: 0;
	padding: 0;
	border: 0;
	outline: 0;
	min-width: 1em;
	min-height: 1em;
	white-space: pre;
	box-sizing: content-box;
	overflow: visible;
	background-color: transparent;
	pointer-events: none;
	overflow-anchor: none;
	scroll-margin: 5px;
}
:host .tategaki-pm-input-surface[data-tategaki-pm-vertical] {
	/* input-surface.ts placement: in vertical writing the surface is placed by right (written inline); left stays auto. */
	left: auto;
}
/* R2-3 (input-surface.ts applyRowRules): the room's row rules, put on the surface for the composition (the attribute data-tategaki-pm-row holds which: trim, justify, wrap; matched with *= because the scope check of m1-2-unit.ts forbids the tilde, and no word is part of another) and taken off after it. Each beats what the typography copied inline (text-spacing-trim,
   text-wrap), as the inline write over it did, so each is !important; taking the class off shows the copied value again. */
:host .tategaki-pm-input-surface[data-tategaki-pm-row*="trim"] {
	text-spacing-trim: space-all !important;
}
:host .tategaki-pm-input-surface[data-tategaki-pm-row*="justify"] {
	text-align: justify !important;
}
:host .tategaki-pm-input-surface[data-tategaki-pm-row*="wrap"] {
	text-wrap: wrap !important;
}
/* M3c (H17, Nyoze PIS-RETAINED-TEXT-COLOR1 @ 38750b33): text that could not be committed and stays on the surface (retained text) is drawn in a red tone chosen from the
   backdrop, so that it does not look as if it had entered the document. The color is the surface's own variable (surface-typography.ts writes it where the backdrop is
   read); the surface's text color is copied from the line as an inline style, so this needs !important. The rule is fixed: only the attribute (retained-display.ts) and the
   variable change. Underline, strike-through and the native caret follow currentColor. */
:host .tategaki-pm-input-surface[data-tategaki-pm-retained] {
	color: var(--tategaki-pm-retained-color) !important;
}
/* M3c (D-M3-17, Nyoze pseudoCaretOverlay and styles.css .nyoze-pseudo-caret-overlay): the pseudo caret, a thin line in the scrolling element's content coordinates, above
   the input surface (19) and the range layer (1): display only. Its box is written by display-visuals.ts; its color is a variable on the element (the caret's color setting).
   The surface's own caret is transparent only while the pseudo caret is drawn. The blink is a CSS animation (an instant on / off as V's caret: steps(1, end)). */
:host .tategaki-pm-pseudo-caret {
	position: absolute;
	left: 0;
	top: 0;
	width: 0;
	height: 0;
	margin: 0;
	padding: 0;
	border: 0;
	z-index: 20;
	pointer-events: none;
	border-radius: 999px;
	background: var(--tategaki-pm-caret-color, var(--tategaki-accent-color, #1e90ff));
	overflow-anchor: none;
}
:host .tategaki-pm-pseudo-caret[data-shown="off"] {
	display: none;
}
:host .tategaki-pm-pseudo-caret[data-blink="on"] {
	animation: tategaki-pm-caret-blink 1s steps(1, end) infinite;
}
@keyframes tategaki-pm-caret-blink {
	0%, 49% { opacity: 1; }
	50%, 100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
	:host .tategaki-pm-pseudo-caret[data-blink="on"] {
		animation: none;
		opacity: 1;
	}
}
:host .tategaki-pm-input-surface[data-tategaki-pm-caret-hidden] {
	caret-color: transparent;
}
/* M3c (D-M3-18, V's styles.css .tategaki-sot-focus-current-line-overlay): the current line's band, a box in the scrolling element's content coordinates below the range layer
   (z-index 0, so the text shows through its translucent color). display-visuals.ts writes its box; the colors are variables on the scrolling element (the settings'
   colors and opacities). */
:host .tategaki-pm-current-line {
	position: absolute;
	left: 0;
	top: 0;
	width: 0;
	height: 0;
	margin: 0;
	padding: 0;
	border: 0;
	z-index: 0;
	pointer-events: none;
	overflow-anchor: none;
	border-radius: 4px;
	background: color-mix(in srgb, var(--tategaki-pm-line-color, #1e90ff) calc(var(--tategaki-pm-line-opacity, 0.28) * 100%), transparent);
}
:host .tategaki-pm-current-line[data-shown="off"] {
	display: none;
}
/* M3c (D-M3-18, V's styles.css .tategaki-sot-focus-*): the visual focus. The scrolling element's attribute says which parts apply (a substring match: the two words do not contain each other, and the unit test's sibling-combinator check takes '~=' for a combinator) ('dim': the other lines are dimmed; 'block': the
   focused block's lines are tinted); the focused block's lines carry the class 'tategaki-pm-focus-line' (a node decoration, pm/decorations.ts). Parts and the frontmatter hold no caret,
   so they are always "other lines". Nothing here applies when the attribute is absent (a range, no focus, the plain text view). */
:host .tategaki-pm-scroll[data-tategaki-pm-focus*="dim"] .tategaki-pm-root tg-line:not(.tategaki-pm-focus-line),
:host .tategaki-pm-scroll[data-tategaki-pm-focus*="dim"] .tategaki-pm-root tg-widget,
:host .tategaki-pm-scroll[data-tategaki-pm-focus*="dim"] .tategaki-pm-root tg-frontmatter {
	opacity: var(--tategaki-pm-nonfocus-opacity, 0.42);
}
:host .tategaki-pm-scroll[data-tategaki-pm-focus*="block"] .tategaki-pm-root tg-line.tategaki-pm-focus-line {
	background: color-mix(in srgb, var(--tategaki-pm-block-color, #1e90ff) calc(var(--tategaki-pm-block-opacity, 0.16) * 100%), transparent);
	border-radius: 12px;
}
`;
