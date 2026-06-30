// Buyer-side discovery client. Talks to an x402 bazaar discovery API
// (<bazaarUrl>/api/bazaar/list, <bazaarUrl>/api/bazaar/search) that merges +
// normalises results across the facilitators it indexes. The base URL is
// configured via the `x402.bazaarUrl` setting — there is no hardcoded host, so
// the extension works against any compatible bazaar. Runs in the extension host
// (Node global fetch).

import * as vscode from 'vscode';

/** Configured bazaar base URL, or '' if the user hasn't set one. */
export function bazaarUrl() {
	return vscode.workspace
		.getConfiguration('x402')
		.get('bazaarUrl', '')
		.trim()
		.replace(/\/+$/, '');
}

/** Thrown when a discovery action runs but no bazaar URL is configured. */
export class NoBazaarConfigured extends Error {
	constructor() {
		super(
			'No x402 bazaar configured. Set "x402.bazaarUrl" to a discovery API base URL ' +
				'(e.g. https://three.ws) to browse and search services.',
		);
		this.name = 'NoBazaarConfigured';
	}
}

function applyFilters(url, filters = {}) {
	const set = (k, v) => v != null && v !== '' && url.searchParams.set(k, String(v));
	set('type', filters.type || 'http');
	set('network', filters.network);
	set('maxPrice', filters.maxPrice);
	set('asset', filters.asset);
	set('extension', filters.extension);
	set('tag', filters.tag);
	set('sort', filters.sort);
	set('maxItems', filters.maxItems);
	set('limit', filters.limit);
}

async function call(url) {
	const res = await fetch(url.toString(), { headers: { accept: 'application/json' } });
	const body = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(body?.error_description || body?.error || `discovery HTTP ${res.status}`);
	}
	return body;
}

/** List bazaar services. Returns { type, count, items[], sources, errors }. */
export async function list(filters = {}) {
	const base = bazaarUrl();
	if (!base) throw new NoBazaarConfigured();
	const url = new URL(`${base}/api/bazaar/list`);
	applyFilters(url, filters);
	return call(url);
}

/** Full-text search across the bazaar. Same envelope as list(). */
export async function search(query, filters = {}) {
	const base = bazaarUrl();
	if (!base) throw new NoBazaarConfigured();
	const url = new URL(`${base}/api/bazaar/search`);
	if (query) url.searchParams.set('query', query);
	applyFilters(url, filters);
	return call(url);
}
