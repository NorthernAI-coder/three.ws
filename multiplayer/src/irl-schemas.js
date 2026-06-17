// Schema definitions for the IRL realtime world (irl_world room), shared between
// the IrlRoom (server) and src/irl-net.js (client, bundled by Vite the same way
// it bundles walk's schemas.js).
//
// @colyseus/schema uses delta encoding: only fields that changed since the last
// patch ride the wire, and a late joiner receives the full current set on join
// for free. That delta sync is exactly what makes the pin set LIVE — a placed /
// moved / removed pin is a one-entry patch the room broadcasts to everyone in the
// geocell, and a fresh viewer is handed the whole MapSchema on connect.
//
// IMPORTANT: append-only. Field indices are positional in @colyseus/schema's
// binary protocol — inserting in the middle shifts every later index and breaks
// clients still connected to an older deployed server. Always add at the end.

import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

// One placed 3D agent anchored at a real-world GPS coordinate. Keyed in the pins
// MapSchema by its pin id (the Neon row UUID), so a place/move/remove is a single
// MapSchema patch. lat/lng are float64 — float32 quantizes a degree to ~1 m of
// error, which is fine for distance but loses the precision a placement actually
// stored, so we pay the extra bytes for an honest coordinate.
export class IrlPin extends Schema {
	constructor() {
		super();
		this.id = '';
		this.lat = 0;
		this.lng = 0;
		this.heading = 0;        // compass bearing 0–359° the agent faces
		this.avatarUrl = '';     // GLB the viewer loads (validated server-side before the row existed)
		this.avatarName = '';
		this.caption = '';
		this.x402Endpoint = '';  // optional paid endpoint the IRL Pay button calls
		this.agentId = '';       // three.ws agent id this pin embodies (cross-links)
		this.placedAt = 0;       // epoch ms, for age / ordering on the client
		// — Room frame (append-only) — shared room-relative anchoring. An agent
		// placed in a ROOM stores its exact offset from a shared origin instead of
		// relying on its own (noisy) GPS, so a cluster keeps its room-scale layout
		// identical for every viewer — see src/irl/room-anchor.js. roomId === ''
		// means a legacy standalone pin that renders from its absolute lat/lng.
		this.roomId = '';        // groups agents into one shared local frame
		this.relEast = 0;        // metres east of the room origin (room frame)
		this.relNorth = 0;       // metres north of the room origin (room frame)
		this.originLat = 0;      // room origin latitude (the cluster's GPS index)
		this.originLng = 0;      // room origin longitude
		this.originYawDeg = 0;   // room frame rotation vs true north (0 = aligned)
	}
}
defineTypes(IrlPin, {
	id: 'string',
	lat: 'float64',
	lng: 'float64',
	heading: 'float32',
	avatarUrl: 'string',
	avatarName: 'string',
	caption: 'string',
	x402Endpoint: 'string',
	agentId: 'string',
	placedAt: 'float64',
	// Append-only (room frame): new fields at the end so a still-connected older
	// client isn't shifted off the positional binary format mid-deploy. relEast/
	// relNorth are metres (float32 ≈ 1e-5 m resolution over a building — ample);
	// the origin is a coordinate, so float64 like lat/lng.
	roomId: 'string',
	relEast: 'float32',
	relNorth: 'float32',
	originLat: 'float64',
	originLng: 'float64',
	originYawDeg: 'float32',
});

// A live viewer present in this geocell — live presence (D2). D1 declared this
// schema and left the map empty; D2 POPULATES it (IrlRoom.onJoin / heartbeat /
// reaper) so the count and ghost markers are pure MapSchema deltas — no new
// transport. lat/lng are ALWAYS the viewer's geocell centre + bounded jitter,
// never their precise GPS: the only location a viewer reveals is "somewhere in
// this ~1 km cell." The new D2 fields are appended (heading/avatar/ghost/
// tsServer) so an older still-connected client isn't shifted off the wire format.
export class IrlViewer extends Schema {
	constructor() {
		super();
		this.id = '';            // ephemeral session id (NOT the device token)
		this.lat = 0;            // cell-centre + bounded jitter (privacy — never precise GPS)
		this.lng = 0;
		this.agentId = '';       // the agent this viewer is embodying, if any
		// — D2 (append-only) —
		this.heading = 0;        // optional compass facing 0–359°, for ghost orientation
		this.avatar = '';        // GLB url — '' unless the viewer opted to share a ghost
		this.ghost = false;      // false = counted only; true = render a marker for this viewer
		this.tsServer = 0;       // server epoch ms of the last heartbeat (drives the reaper)
	}
}
defineTypes(IrlViewer, {
	id: 'string',
	lat: 'float64',
	lng: 'float64',
	agentId: 'string',
	// Append-only (D2): keep new fields at the end so a still-connected older
	// client isn't shifted off the positional binary format mid-deploy.
	heading: 'float32',
	avatar: 'string',
	ghost: 'boolean',
	tsServer: 'float64',
});

export class IrlState extends Schema {
	constructor() {
		super();
		// The set of pins in this room's 3×3 geocell window (centre cell + up to 8
		// neighbours), keyed by pin id. This is the live, delta-synced collection
		// the client reconciles into its scene.
		this.pins = new MapSchema();
		// The centre geocell this room instance serves (filterBy key). Seeded by the
		// first client to land here; identical for every viewer in the instance.
		this.geocell = '';
		// Live viewers present in this cell (D2), keyed by session id. Populated by
		// IrlRoom on join/heartbeat and pruned by its reaper — see IrlViewer above.
		this.viewers = new MapSchema();
	}
}
defineTypes(IrlState, {
	pins: { map: IrlPin },
	geocell: 'string',
	viewers: { map: IrlViewer },
});
