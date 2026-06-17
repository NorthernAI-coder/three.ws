// Geohash (precision-6) — the coarse spatial key for the IRL world.
//
// Shared by the IrlRoom (server) and src/irl-net.js (client, bundled by Vite the
// same way it bundles schemas.js). A precision-6 cell is ~1.2km × 0.6km, the
// matchmaking key every viewer inside one cell joins (filterBy(['geocell'])).
//
// Privacy by design: the geohash IS the coarse location. A viewer's device never
// has to send precise GPS — it sends only this cell string, and the server places
// presence markers at the cell centre + bounded jitter. So "where someone is"
// never resolves finer than "somewhere in this ~1km cell."

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'; // (no a, i, l, o)

/**
 * Encode a lat/lng to a geohash string of the given precision.
 * @param {number} lat
 * @param {number} lng
 * @param {number} [precision=6]
 * @returns {string}
 */
export function encodeGeohash(lat, lng, precision = 6) {
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
	let idx = 0;
	let bit = 0;
	let evenBit = true; // true → bisecting longitude, false → latitude
	let geohash = '';
	let latMin = -90, latMax = 90;
	let lngMin = -180, lngMax = 180;

	while (geohash.length < precision) {
		if (evenBit) {
			const mid = (lngMin + lngMax) / 2;
			if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; } else { idx = idx * 2; lngMax = mid; }
		} else {
			const mid = (latMin + latMax) / 2;
			if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx = idx * 2; latMax = mid; }
		}
		evenBit = !evenBit;
		if (++bit === 5) {
			geohash += BASE32[idx];
			bit = 0;
			idx = 0;
		}
	}
	return geohash;
}

/**
 * Decode a geohash to its bounding box.
 * @returns {{ latMin:number, latMax:number, lngMin:number, lngMax:number }}
 */
export function decodeGeohashBounds(geohash) {
	let evenBit = true;
	let latMin = -90, latMax = 90;
	let lngMin = -180, lngMax = 180;
	for (const ch of String(geohash || '').toLowerCase()) {
		const idx = BASE32.indexOf(ch);
		if (idx < 0) continue; // tolerate stray chars rather than throwing on the wire
		for (let n = 4; n >= 0; n--) {
			const bitN = (idx >> n) & 1;
			if (evenBit) {
				const mid = (lngMin + lngMax) / 2;
				if (bitN === 1) lngMin = mid; else lngMax = mid;
			} else {
				const mid = (latMin + latMax) / 2;
				if (bitN === 1) latMin = mid; else latMax = mid;
			}
			evenBit = !evenBit;
		}
	}
	return { latMin, latMax, lngMin, lngMax };
}

/**
 * Decode a geohash to its centre point and half-extents (degrees of error each way).
 * The half-extents bound the jitter the server adds so a presence marker stays
 * inside the cell it claims.
 * @returns {{ lat:number, lng:number, latErr:number, lngErr:number }}
 */
export function decodeGeohash(geohash) {
	const b = decodeGeohashBounds(geohash);
	return {
		lat: (b.latMin + b.latMax) / 2,
		lng: (b.lngMin + b.lngMax) / 2,
		latErr: (b.latMax - b.latMin) / 2,
		lngErr: (b.lngMax - b.lngMin) / 2,
	};
}
