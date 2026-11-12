import { Annotation } from "@codemirror/state";
/** Per-view origin, added to the existing selection transaction without another dispatch. */
export const pmModeNavigation = Annotation.define<object>();
