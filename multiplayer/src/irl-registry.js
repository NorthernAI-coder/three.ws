// IRL room registry — the lookup that lets the HTTP publish webhook find the live
// Colyseus room(s) a pin change belongs to.
//
// Colyseus routes WebSocket traffic through the matchmaker, but the publish
// webhook arrives as a plain Express POST with no room context. Each IrlRoom
// registers itself here under its CENTRE geocell on create and unregisters on
// dispose; the webhook then resolves the rooms whose 3×3 window covers a pin's
// cell and patches their state directly.
//
// Why fan out to neighbours: a room centred on cell C holds pins for C plus its 8
// neighbours. A pin in cell P therefore belongs in every room whose window
// includes P — i.e. every room centred on P or one of P's neighbours. Geohash
// 8-neighbour adjacency is symmetric, so the set of covering centres is exactly
// { P } ∪ neighbours(P). We register by centre and dispatch over that 9-cell set.

import { geohashNeighbors } from './geohash.js';

class IrlRegistry {
	constructor() {
		this._byCell = new Map(); // centre geocell → Set<IrlRoom>
	}

	register(cell, room) {
		if (!cell || !room) return;
		let set = this._byCell.get(cell);
		if (!set) {
			set = new Set();
			this._byCell.set(cell, set);
		}
		set.add(room);
	}

	unregister(cell, room) {
		const set = this._byCell.get(cell);
		if (!set) return;
		set.delete(room);
		if (set.size === 0) this._byCell.delete(cell);
	}

	// Apply a pin change to every room whose window covers `cell`. Returns how many
	// rooms received it (0 = nobody is watching this area right now, which is fine —
	// the pin is already persisted and the next viewer to join loads it from Neon).
	dispatch(cell, type, pin) {
		if (!cell) return 0;
		const centres = [cell, ...geohashNeighbors(cell)];
		const seen = new Set();
		let delivered = 0;
		for (const c of centres) {
			const set = this._byCell.get(c);
			if (!set) continue;
			for (const room of set) {
				if (seen.has(room)) continue;
				seen.add(room);
				try {
					room.applyPublish(type, pin);
					delivered++;
				} catch (err) {
					console.warn('[irl-registry] applyPublish threw:', err?.message);
				}
			}
		}
		return delivered;
	}
}

// One registry shared by every IrlRoom in the process — that shared map is what
// lets the stateless webhook reach the right live rooms.
export const irlRegistry = new IrlRegistry();
