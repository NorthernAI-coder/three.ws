// Forge generation job-handle codec — shared by the /api/forge endpoint and the
// 3D Studio MCP server (/api/mcp-3d).
//
// Jobs from the geometry providers (Meshy / Tripo) and the self-hosted GCP
// backend are polled on a different upstream than the default Replicate path, so
// callers are handed an opaque token that records which provider + task-kind to
// poll. The legacy Replicate path keeps returning its bare prediction id (which
// matches JOB_ID_RE), so old links and existing job handles never break.

export function encodeJobToken({ provider, kind, taskId }) {
	return `f1.${Buffer.from(JSON.stringify({ p: provider, k: kind, t: taskId }), 'utf8').toString('base64url')}`;
}

export function decodeJobToken(token) {
	if (typeof token !== 'string' || !token.startsWith('f1.')) return null;
	try {
		const obj = JSON.parse(Buffer.from(token.slice(3), 'base64url').toString('utf8'));
		if (!obj?.p || !obj?.t) return null;
		return { provider: obj.p, kind: obj.k || null, taskId: String(obj.t) };
	} catch {
		return null;
	}
}
