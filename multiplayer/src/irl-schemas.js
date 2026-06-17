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
});

// A live viewer present in this geocell — the seed of D2 (presence / ghost
// viewers). Declared now so D2 only has to POPULATE the map, never alter the
// schema mid-deploy (which the append-only rule would otherwise complicate). D1
// leaves `viewers` empty; the room defines it but writes no entries yet.
export class IrlViewer extends Schema {
	constructor() {
		super();
		this.id = '';            // session id
		this.lat = 0;            // cell-centre + bounded jitter (privacy — never precise GPS)
		this.lng = 0;
		this.agentId = '';       // the agent this viewer is embodying, if any
	}
}
defineTypes(IrlViewer, {
	id: 'string',
	lat: 'float64',
	lng: 'float64',
	agentId: 'string',
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
		// Live viewers in this cell (D2). Empty in D1 — see IrlViewer above.
		this.viewers = new MapSchema();
	}
}
defineTypes(IrlState, {
	pins: { map: IrlPin },
	geocell: 'string',
	viewers: { map: IrlViewer },
});
