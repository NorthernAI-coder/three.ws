/* three.ws — referral capture (zero-dep, static).
 *
 * Loaded on the public auth pages (/login, /register). Reads a `?ref=CODE`
 * query param, validates it against the referral-code alphabet, and parks it
 * in localStorage so the dashboard can attribute the referral once the user
 * has a session (see src/dashboard-next/referral-claim.js).
 *
 * Captured here rather than threaded through every auth handshake (email,
 * Privy, SIWS, SIWE) so a single replay covers all of them.
 */
(function () {
	var KEY = 'tw:ref';
	var CODE_RE = /^[A-Z2-9]{4,20}$/;
	// A captured code older than this is stale — drop it rather than attribute a
	// signup to a link the user clicked weeks ago.
	var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

	function readParam() {
		try {
			var params = new URLSearchParams(window.location.search);
			var raw = params.get('ref') || params.get('r');
			if (!raw) return null;
			var code = raw.trim().toUpperCase();
			return CODE_RE.test(code) ? code : null;
		} catch (e) {
			return null;
		}
	}

	try {
		var code = readParam();
		if (code) {
			localStorage.setItem(KEY, JSON.stringify({ code: code, ts: Date.now() }));
		} else {
			// Expire a stale capture so it never attributes a much later signup.
			var existing = localStorage.getItem(KEY);
			if (existing) {
				var parsed = JSON.parse(existing);
				if (!parsed || !parsed.ts || Date.now() - parsed.ts > MAX_AGE_MS) {
					localStorage.removeItem(KEY);
				}
			}
		}
	} catch (e) {
		/* private mode / disabled storage — referral capture is best-effort */
	}
})();
