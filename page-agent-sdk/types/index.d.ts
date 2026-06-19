// Type definitions for @three-ws/page-agent

export type AgentId = string;
export type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type LipsyncMode = 'viseme' | 'jaw' | 'animation';
export type Presents = 'female' | 'male' | 'neutral' | 'robot';
export type AvatarStyle = 'realistic' | 'stylized' | 'robot';
export type Framing = 'bust' | 'upper' | 'full';

export interface VoiceProfile {
	lang?: string;
	pitch?: number;
	rate?: number;
	match?: string[];
}

/** A skeleton-rigged, lipsync-capable agent in the catalog. */
export interface RiggedAgent {
	id: AgentId;
	name: string;
	tagline: string;
	persona: string;
	file: string;
	url?: string;
	rig: 'rpm' | 'mixamo' | 'studio';
	lipsync: LipsyncMode;
	presents: Presents;
	style: AvatarStyle;
	framing: Framing;
	voice: VoiceProfile;
	accent: string;
}

export const AGENTS: RiggedAgent[];
export const DEFAULT_AGENT_ID: AgentId;
export const DEFAULT_ASSET_BASE: string;
export function getAgent(id: AgentId): RiggedAgent | undefined;
export function agentUrl(agent: RiggedAgent, assetBase?: string): string;
export function filterAgents(q?: {
	style?: AvatarStyle;
	presents?: Presents;
	lipsync?: LipsyncMode;
	ids?: AgentId[];
}): RiggedAgent[];

export interface PageAgentConfig {
	/** Element is not used as a mount; the agent docks itself to the page. */
	mount?: HTMLElement;
	agent?: AgentId;
	/** Allow-list of agent ids shown in the picker. */
	agents?: AgentId[];
	assetBase?: string;
	position?: Position;
	muted?: boolean;
	collapsed?: boolean;
	/** Hide the "change agent" affordance + picker. Default true (shown). */
	picker?: boolean;
	/** Show the control bar. Default true. */
	controls?: boolean;
	/** Spoken once on load (ignored when autoNarrate is set). */
	greeting?: string;
	/** true → tour the page; string → CSS selector of segments to narrate. */
	autoNarrate?: boolean | string;
	/** Persist the visitor's chosen agent in localStorage. Default true. */
	persistAgent?: boolean;
}

export type PageAgentEvent =
	| 'ready' | 'agentchange' | 'state' | 'caption' | 'segment' | 'error';

export class PageAgent {
	constructor(config?: PageAgentConfig);
	readonly currentAgent: RiggedAgent | null;
	narrate(text: string, opts?: { interrupt?: boolean }): Promise<void>;
	narratePage(opts?: { selector?: string; greet?: boolean }): Promise<void>;
	stop(): void;
	setAgent(id: AgentId): Promise<void>;
	mute(on?: boolean): void;
	collapse(on?: boolean): void;
	openPicker(): void;
	closePicker(): void;
	on(event: PageAgentEvent, cb: (payload: any) => void): this;
	off(event: PageAgentEvent, cb: (payload: any) => void): this;
	dispose(): void;
}

export function mount(config?: PageAgentConfig): PageAgent;
export function collectSegments(selector?: string): { el: Element; text: string }[];

export class PageAgentElement extends HTMLElement {
	readonly controller: PageAgent | null;
	readonly currentAgent: RiggedAgent | null;
	narrate(text: string, opts?: { interrupt?: boolean }): Promise<void> | undefined;
	narratePage(opts?: { selector?: string; greet?: boolean }): Promise<void> | undefined;
	stop(): void;
	setAgent(id: AgentId): Promise<void> | undefined;
	mute(on?: boolean): void;
	collapse(on?: boolean): void;
	openPicker(): void;
}
export function registerElement(tag?: string): string;

export class AvatarStage {
	constructor(container: HTMLElement, opts?: { background?: string });
	morph: unknown;
	onFrame(fn: (dt: number, nowMs: number) => void): () => void;
	load(url: string, opts?: { framing?: Framing }): Promise<unknown>;
	setSpeaking(on: boolean): void;
	dispose(): void;
}

export class SpeechNarrator {
	constructor(stage: AvatarStage, opts?: {
		muted?: boolean;
		onState?: (s: 'idle' | 'speaking') => void;
		onCaption?: (text: string | null) => void;
		onError?: (e: Error) => void;
	});
	readonly speaking: boolean;
	setAgent(agent: RiggedAgent): void;
	setMuted(muted: boolean): void;
	speak(text: string, opts?: { interrupt?: boolean }): Promise<void>;
	cancel(): void;
	dispose(): void;
}

export class AvatarPicker {
	constructor(agents: RiggedAgent[], opts: {
		onSelect: (id: AgentId) => void;
		getCurrent: () => AgentId | undefined;
		title?: string;
		subtitle?: string;
	});
	static restore(): AgentId | null;
	static persist(id: AgentId): void;
	readonly isOpen: boolean;
	mount(parent?: HTMLElement): void;
	open(): void;
	close(): void;
	dispose(): void;
}

export function createLipsync(
	text: string,
	morph: unknown,
	opts?: { rate?: number },
): { tick(nowMs: number): void; stop(): void; readonly done: boolean; readonly totalMs: number };
export function buildMorphMap(root: unknown): { mode: 'arkit' | 'jaw'; map: Map<string, any[]> } | null;
export function estimateDurationMs(text: string): number;

export default PageAgent;
