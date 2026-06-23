import { X402Error, send402 } from '../_lib/x402-spec.js';
import { reportServerError } from '../_lib/http.js';

export function sendX402Error(res, { resourceUrl, accepts }, err) {
	if (err instanceof X402Error) {
		if (err.status === 402) return send402(res, { resourceUrl, accepts, error: err.message });
		res.statusCode = err.status;
		res.setHeader('content-type', 'application/json; charset=utf-8');
		res.end(JSON.stringify({ error: err.code, error_description: err.message }));
		return;
	}
	// Unexpected (non-X402) fault — route it through the shared boundary so the
	// MCP payment path gets the same ref + Sentry capture + deduped ops alert as
	// an HTTP 5xx, then echo the ref so an agent can quote it to support.
	const ref = reportServerError(err, { code: 'mcp_x402_failed', context: { resourceUrl } });
	res.statusCode = 500;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.end(JSON.stringify({ error: 'internal', error_description: `x402 processing failed — quote ref ${ref} to support`, ref }));
}
