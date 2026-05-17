// Type declarations for @three-ws/avatar/viewer.
//
// Registers a `<three-ws-viewer>` custom element on import. Pure visual
// renderer: GLB + OrbitControls + ambient/dir lights. No chat, no voice,
// no skills. Peer-depends on `three`.

export {};

declare global {
	interface HTMLElementTagNameMap {
		'three-ws-viewer': ThreeWsViewerElement;
	}
}

/**
 * `<three-ws-viewer src="..." alt="..." background="...">`
 *
 * Attributes:
 *  - `src` — GLB URL (required to render anything).
 *  - `alt` — accessibility label and caption text.
 *  - `background` — CSS color string, or `'transparent'`. Default transparent.
 *
 * Events:
 *  - `load`  — `CustomEvent<{ url: string }>` once the GLB is parsed and added.
 *  - `error` — `CustomEvent<{ url: string, error: Error }>` on load failure.
 */
export class ThreeWsViewerElement extends HTMLElement {
	src?: string;
	alt?: string;
	background?: string;
}

export default ThreeWsViewerElement;
