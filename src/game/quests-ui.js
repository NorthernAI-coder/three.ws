// Jobs Board UI (W08 hooking W05) — the client the quest engine never had.
// multiplayer/src/quests.js + quest-zones.js + WalkRoom's questReq/questAccept/
// questAbandon/questInteract handlers were fully built and fully wired
// server-side, but nothing on the client ever called requestQuests() or
// rendered what came back — "designed and completely unreachable", the same
// gap W04's economy pass found and closed for the cash economy. This is that
// same fix for jobs: walk up to any quest-giver NPC (npc/quest-npcs.js) or
// open it directly, and the real board — real daily rotation, real
// prereqs/repeat rules, real per-objective progress, real heist crew size —
// renders straight from the server's own snapshot. Every button only sends an
// intent; the server's reply re-renders, exactly like the store/bank panel
// this one is styled to match.

import { EconPanel } from './economy-ui.js';
import './quests-ui.css';

function el(tag, props = {}, kids = []) {
	const n = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		if (k === 'class') n.className = v;
		else if (k === 'text') n.textContent = v;
		else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
		else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : v);
	}
	for (const kid of [].concat(kids)) if (kid != null && kid !== false) n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
	return n;
}

const KIND_GLYPH = { job: '🎯', heist: '🤝' };

function rewardText(reward) {
	if (!reward) return '';
	const parts = [`💰 ${reward.gold ?? 0}`];
	if (reward.xp?.amount) parts.push(`✨ ${reward.xp.amount} ${reward.xp.skill}`);
	return parts.join(' · ');
}

let _openQuests = null;

/**
 * Open the Jobs Board: browse offers, accept/abandon, and track active
 * objectives — all server-authoritative. Idempotent — a second open while one
 * is already up just refocuses it (and re-targets `highlight` if given).
 * @param {{ ui: object, net: object }} deps
 * @param {string} [highlight] a mission id to jump straight to (from the
 *   giver NPC the player just walked up to).
 */
export function openQuestsPanel({ ui, net } = {}, highlight) {
	if (!net) return;
	if (_openQuests) { _openQuests.focusMission(highlight); return; }
	_openQuests = new QuestsPanel({ ui, net, highlight, onClose: () => { _openQuests = null; } });
}

class QuestsPanel extends EconPanel {
	constructor({ ui, net, highlight, onClose }) {
		super({ title: 'Jobs Board', onClose });
		this.ui = ui;
		this.net = net;
		this.tab = 'board';
		this.board = { offers: [], active: [], day: '' };
		this._highlight = highlight || null;
		// One-shot flag: which id to flash/scroll-to on the NEXT render only —
		// kept separate from _pickForTab's persistent `_highlight` so a later
		// snapshot re-render (progress ticking in) doesn't keep re-pulsing it.
		this._flashId = highlight || null;

		this.boardTabBtn = el('button', { class: 'ec-tab ec-on', type: 'button', text: 'Board', onclick: () => this._setTab('board') });
		this.activeTabBtn = el('button', { class: 'ec-tab', type: 'button', text: 'Active', onclick: () => this._setTab('active') });
		this.tabs = el('div', { class: 'ec-tabs' }, [this.boardTabBtn, this.activeTabBtn]);
		this.card.insertBefore(this.tabs, this.body);

		this.track(net.on('quests', (snap) => {
			this.board = snap && typeof snap === 'object' ? snap : this.board;
			this._pickTabForHighlight();
			this._render();
		}));
		this.track(net.on('questComplete', (c) => this._onComplete(c)));

		net.requestQuests();
		this._render();
	}

	// Called again if a giver NPC/menu opens the board while it's already up —
	// jump to whichever tab actually has that mission and flash it once.
	focusMission(id) {
		if (!id) return;
		this._highlight = id;
		this._flashId = id;
		this._pickTabForHighlight();
		this._render();
	}

	_pickTabForHighlight() {
		if (!this._highlight) return;
		if (this.board.active.some((r) => r.id === this._highlight)) this.tab = 'active';
		else if (this.board.offers.some((o) => o.id === this._highlight)) this.tab = 'board';
	}

	_setTab(tab) {
		this.tab = tab;
		this.boardTabBtn.classList.toggle('ec-on', tab === 'board');
		this.activeTabBtn.classList.toggle('ec-on', tab === 'active');
		this._render();
	}

	_onComplete(c) {
		if (!c) return;
		const crew = c.coop && c.crew > 1 ? ` (crew of ${c.crew})` : '';
		this.setStatus(`${c.title} complete${crew} — ${rewardText(c.reward)}`, 'ok');
	}

	_render() {
		this.activeTabBtn.textContent = this.board.active.length ? `Active (${this.board.active.length})` : 'Active';
		this.body.replaceChildren();
		if (this.tab === 'board') this._renderBoard(); else this._renderActive();
		// One-shot: flash + scroll to the targeted row, then clear so a later
		// re-render (progress ticking in) doesn't keep re-pulsing it.
		if (this._flashId) {
			const flashed = this.body.querySelector('.qb-flash');
			flashed?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			this._flashId = null;
		}
	}

	_renderBoard() {
		if (!this.board.offers.length) {
			this.body.appendChild(el('div', { class: 'ec-empty', text: 'No jobs on the board right now — dailies rotate at UTC midnight, and repeatable work is always open somewhere in town.' }));
			return;
		}
		for (const offer of this.board.offers) {
			const flash = offer.id === this._flashId;
			const row = el('div', { class: 'ec-row qb-row' + (flash ? ' qb-flash' : ''), 'data-mission': offer.id }, [
				el('span', { class: 'ec-row-glyph', text: KIND_GLYPH[offer.kind] || '🎯' }),
				el('div', { class: 'ec-row-main' }, [
					el('div', { class: 'ec-row-name', text: offer.title }),
					el('div', { class: 'ec-row-sub', text: `${offer.giver} · ${offer.summary}` }),
					el('div', { class: 'qb-obj-preview', text: offer.objectives.map((o) => o.label).join('  →  ') }),
					el('div', { class: 'qb-reward', text: rewardText(offer.reward) + (offer.kind === 'heist' ? ` · needs a crew of ${offer.party}` : '') }),
				]),
				el('button', {
					class: 'ec-row-btn', type: 'button', text: 'Accept',
					'aria-label': `Accept ${offer.title}`,
					onclick: () => { this.setStatus('Accepting…'); this.net.questAccept(offer.id); },
				}),
			]);
			this.body.appendChild(row);
		}
	}

	_renderActive() {
		if (!this.board.active.length) {
			this.body.appendChild(el('div', { class: 'ec-empty', text: 'No active jobs — accept one from the Board tab or talk to a quest-giver out in the world.' }));
			return;
		}
		for (const run of this.board.active) {
			const flash = run.id === this._flashId;
			const objList = el('div', { class: 'qb-obj-list' }, run.objectives.map((o) => el('div', {
				class: 'qb-obj' + (o.done ? ' is-done' : '') + (o.current ? ' is-current' : ''),
			}, [
				el('span', { class: 'qb-obj-mark', text: o.done ? '✔' : (o.current ? '▶' : '·') }),
				el('span', { class: 'qb-obj-label', text: o.label }),
				el('span', { class: 'qb-obj-count', text: o.count > 1 ? `${o.progress}/${o.count}` : '' }),
			])));
			const crewLine = run.kind === 'heist'
				? el('div', { class: 'qb-reward', text: `Crew: ${run.crew || 1}/${run.party || 2}` })
				: null;
			const row = el('div', { class: 'ec-row qb-row qb-active-row' + (flash ? ' qb-flash' : ''), 'data-mission': run.id }, [
				el('div', { class: 'ec-row-main' }, [
					el('div', { class: 'ec-row-name', text: run.title }),
					el('div', { class: 'ec-row-sub', text: run.giver }),
					objList,
					crewLine,
					el('div', { class: 'qb-reward', text: rewardText(run.reward) }),
				].filter(Boolean)),
				el('button', {
					class: 'ec-row-btn ec-secondary', type: 'button', text: 'Abandon',
					'aria-label': `Abandon ${run.title}`,
					onclick: () => { this.net.questAbandon(run.id); },
				}),
			]);
			this.body.appendChild(row);
		}
	}
}
