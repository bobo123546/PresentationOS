export { resolveLayout, GAP_INCH } from './layout-engine.js';
export { readDesignTokens } from './design-tokens.js';
export type { DesignTokens } from './design-tokens.js';
export type { Rect, LayoutIR, LayoutNode } from './layout-engine.js';
export { renderDeck, resolveSlideScene, resolveDeckScenes, themeFor, fontSizeFor } from './renderer.js';
export type { DeckSpec, DeckSlide, SlideBlock, RenderOptions, SlideArchetype, ResolvedCommand, ResolvedSlideScene, SourceBlockMapping } from './renderer.js';
export { verifyRenderedDeck, readRenderedDeck } from './readback.js';
export type { RenderedDeckVerification, RenderedSlideContent, RenderedObject } from './readback.js';
