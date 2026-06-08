// Resolve the public site origin for building absolute URLs in MCP tool output.
//
// Prefers explicit env (stable across preview deploys); falls back to the
// request Host header, then VERCEL_URL. Shared by every tool that emits links
// (animation catalogue fetches, embed snippets) so origin resolution lives in
// exactly one place.
export function resolveOrigin(req) {
	const env =
		process.env.APP_ORIGIN || process.env.PUBLIC_ORIGIN || process.env.PUBLIC_APP_ORIGIN;
	if (env) return env.replace(/\/$/, '');
	const host = req?.headers?.host;
	if (host) return `${/^localhost|127\.0\.0\.1/.test(host) ? 'http' : 'https'}://${host}`;
	if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
	throw new Error('cannot resolve site origin');
}
