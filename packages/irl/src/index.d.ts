// Type definitions for @three-ws/irl

export declare class ThreeWsError extends Error {
	name: string;
	code: string;
	status: number | null;
	detail?: string;
	retryAfter?: number;
	body: unknown;
}

export declare class PaymentRequiredError extends ThreeWsError {
	accepts: unknown | null;
}

export declare const DEFAULT_BASE_URL: string;

export type InteractionType = 'view' | 'tap' | 'message' | 'pay';
export type PlacementKind = 'precise' | 'approximate';
export type AnchorSource = 'webxr' | 'gyro-gps' | 'gyro-gps:rel' | 'map' | 'marker';

/** An explicit GPS fix passed to `checkIn()` in non-browser environments. */
export interface FixInput {
	lat: number;
	lng: number;
	/** Reported accuracy in metres, if known. */
	accuracy?: number;
}

/** The proof-of-presence returned by `checkIn()`. */
export interface Presence {
	/** The fix used to mint the token. */
	lat: number;
	lng: number;
	/** Reported GPS accuracy in metres, or null. */
	accuracy: number | null;
	/** HMAC-signed presence token — sent as the `x-irl-fix` header on reads. */
	token: string;
	/** Token lifetime in seconds (180). Re-`checkIn()` when it lapses. */
	expiresIn: number;
	/** The precision-7 geohash (~153 m) the fix fell in — the re-mint trigger. */
	cell: string;
	/** Raw `POST /api/irl/fix-token` response. */
	raw: unknown;
}

export interface NearbyOptions {
	/** Metres. Clamped server-side to 10–60 m. Default 40. */
	radius?: number;
	/** Anonymous device token (header-only) to flag `isMine` on the caller's pins. */
	deviceToken?: string;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

/** A pin from the public nearby feed (allow-list projection — never owner ids). */
export interface Pin {
	id: string;
	agentId: string | null;
	/** Coarsened to ~1.1 m (5 dp). */
	lat: number;
	lng: number;
	/** Facing, 0–359°. */
	heading: number;
	/** Great-circle metres from your fix. */
	distanceM: number | null;
	avatarUrl: string | null;
	avatarName: string | null;
	caption: string | null;
	/** First-party pay target for the agent, if any. */
	x402Endpoint: string | null;
	viewCount: number;
	/** Bumps on a remote outfit re-skin — diff to swap the GLB. */
	avatarVersion: number;
	placedAt: string | null;
	anchorHeightM: number | null;
	anchorYawDeg: number | null;
	anchorQuat: number[] | string | null;
	anchorSource: AnchorSource | null;
	gpsAccuracyM: number | null;
	altitudeM: number | null;
	/** Room frame for shared-anchor clusters (null on standalone pins). */
	roomId: string | null;
	relEastM: number | null;
	relNorthM: number | null;
	originLat: number | null;
	originLng: number | null;
	originYawDeg: number | null;
	/** True for the caller's own pins. */
	isMine: boolean;
	raw: unknown;
}

/** Optional reproducible pose for AR replay. */
export interface AnchorPose {
	heightM?: number;
	yawDeg?: number;
	quat?: number[];
	gpsAccuracyM?: number;
	altitudeM?: number;
	source?: AnchorSource;
}

/** Optional shared-room frame to place into a colocalized cluster. */
export interface RoomFrame {
	id: string;
	originLat: number;
	originLng: number;
	relEast: number;
	relNorth: number;
	originYawDeg?: number;
}

export interface PlacePinInput {
	/** Required. Range-checked. */
	lat: number;
	lng: number;
	/** Initial facing in degrees (default 0). */
	heading?: number;
	/** GLB URL — relative same-origin or https (no private hosts). */
	avatarUrl?: string;
	/** ≤ 40 chars. */
	avatarName?: string;
	/** ≤ 140 chars. Content-gated; may reference only $THREE. */
	caption?: string;
	/** Link the pin to a registered agent. */
	agentId?: string;
	/** Pay target — must be a first-party three.ws host. */
	x402Endpoint?: string;
	anchor?: AnchorPose;
	room?: RoomFrame;
	vps?: { provider?: string; id?: string };
	/** `approximate` blurs the spot by `fuzzRadiusM` (10–500 m). */
	placementKind?: PlacementKind;
	fuzzRadiusM?: number;
}

/** A pin the caller owns (from `placePin` / `myPins`). */
export interface OwnPin {
	id: string;
	agentId: string | null;
	lat: number;
	lng: number;
	heading: number;
	avatarUrl: string | null;
	avatarName: string | null;
	caption: string | null;
	x402Endpoint: string | null;
	viewCount: number;
	avatarVersion: number;
	placedAt: string | null;
	expiresAt: string | null;
	/** True for signed-in owners; false (7-day expiry) for anonymous device pins. */
	permanent: boolean;
	raw: unknown;
}

export interface InteractInput {
	/** Required. The agent you met. */
	pinId: string;
	/** `view` repeats from one device collapse within 5 min. Default `view`. */
	type?: InteractionType;
	/** ≤ 280 chars (for `message`). */
	message?: string;
	/** Interaction id this message replies to. */
	replyTo?: string;
	payload?: Record<string, unknown>;
	/** `pay` — on-chain settlement signature (required for `pay`). */
	signature?: string;
	/** `pay` — $THREE or USDC mint. */
	currencyMint?: string;
	/** `pay` — settled amount. */
	amount?: number;
	/** `pay` — settlement network, e.g. `solana`. */
	network?: string;
	deviceType?: string;
	/** Anonymous viewer attribution (header-only). */
	deviceToken?: string;
}

export interface Interaction {
	ok: boolean;
	id: string | null;
	type: InteractionType | null;
	createdAt: string | null;
	/** True when a repeat view/pay was collapsed onto an existing record. */
	deduped: boolean;
	/** True when the caller is the pin owner (a self-view is not counted). */
	self: boolean;
	/** True when the owner was notified (a `pay` / visitor `message`). */
	notified: boolean;
	raw: unknown;
}

export interface CheckInOptions {
	signal?: AbortSignal;
}

export interface WriteOptions {
	/** Anonymous device token (header-only) for ownership/attribution. */
	deviceToken?: string;
	signal?: AbortSignal;
}

export interface IrlClientOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
	/** Bearer session token for signed-in ownership. */
	apiKey?: string;
	/** Default anonymous device token, sent header-only on every write. */
	deviceToken?: string;
	headers?: Record<string, string>;
}

export interface IrlClient {
	checkIn(input?: FixInput, opts?: CheckInOptions): Promise<Presence>;
	nearby(presence: Presence | FixInput, opts?: NearbyOptions): Promise<Pin[]>;
	placePin(input: PlacePinInput, opts?: WriteOptions): Promise<{ pin: OwnPin; raw: unknown }>;
	myPins(opts?: WriteOptions): Promise<OwnPin[]>;
	interact(input: InteractInput, opts?: WriteOptions): Promise<Interaction>;
	removePin(id: string, opts?: WriteOptions): Promise<{ ok: boolean; raw: unknown }>;
	purgePins(opts?: WriteOptions): Promise<{ ok: boolean; deleted: number; raw: unknown }>;
}

export declare function createIrl(options?: IrlClientOptions): IrlClient;
export declare function configure(opts?: IrlClientOptions): IrlClientOptions;

export declare function checkIn(input?: FixInput, opts?: CheckInOptions): Promise<Presence>;
export declare function nearby(presence: Presence | FixInput, opts?: NearbyOptions): Promise<Pin[]>;
export declare function placePin(input: PlacePinInput, opts?: WriteOptions): Promise<{ pin: OwnPin; raw: unknown }>;
export declare function myPins(opts?: WriteOptions): Promise<OwnPin[]>;
export declare function interact(input: InteractInput, opts?: WriteOptions): Promise<Interaction>;
export declare function removePin(id: string, opts?: WriteOptions): Promise<{ ok: boolean; raw: unknown }>;
export declare function purgePins(opts?: WriteOptions): Promise<{ ok: boolean; deleted: number; raw: unknown }>;

/** Encode a lat/lng to a geohash (default precision 7, the IRL cell key). */
export declare function encodeGeohash(lat: number, lng: number, precision?: number): string;
