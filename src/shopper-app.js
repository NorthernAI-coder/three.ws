// Endpoint Shopper UI — wires the form to /api/agents/endpoint-shopper-run
// and renders the execution timeline with step-by-step animation.

const STEP_ICONS = {
	discover: '🔍',
	plan: '🗺',
	call: '⚡',
	synthesize: '🧠',
};

const ACTION_LABELS = {
	discover: 'Discover',
	plan: 'Plan',
	call: 'Call',
	synthesize: 'Synthesize',
};

// The agent charges a $0.01 base fee and spends up to the budget on downstream
// calls, so a budget below the base fee can't fund a single paid step.
const MIN_BUDGET_USD = 0.01;

export function init() {
	const taskInput = document.getElementById('task-input');
	const runBtn = document.getElementById('run-btn');
	const budgetSlider = document.getElementById('budget-slider');
	const budgetDisplay = document.getElementById('budget-display');
	const resultPanel = document.getElementById('result-panel');
	const chipRow = document.getElementById('chip-row');
	const runHint = document.getElementById('run-hint');

	if (!taskInput || !runBtn || !resultPanel) return;

	// Gate the CTA on a non-empty task and a fundable budget. Distinct hints
	// tell the user exactly which precondition is unmet before they pay.
	function refreshGate() {
		const task = taskInput.value.trim();
		const budget = parseFloat(budgetSlider.value);
		let reason = '';

		if (!task) {
			reason = 'Describe a task to run.';
		} else if (!(budget >= MIN_BUDGET_USD)) {
			reason = `Raise the budget to at least $${MIN_BUDGET_USD.toFixed(2)} — the agent can't fund a paid call below that.`;
		}

		runBtn.disabled = !!reason;
		if (runHint) {
			runHint.textContent = reason;
			runHint.classList.toggle('warn', !!reason);
		}
		return !reason;
	}

	// Budget slider
	budgetSlider.addEventListener('input', () => {
		budgetDisplay.textContent = `$${parseFloat(budgetSlider.value).toFixed(2)}`;
		refreshGate();
	});

	taskInput.addEventListener('input', refreshGate);

	// Example task chips
	chipRow.addEventListener('click', (e) => {
		const chip = e.target.closest('.chip');
		if (!chip) return;
		taskInput.value = chip.dataset.task || '';
		taskInput.focus();
		refreshGate();
	});

	// Form submit
	runBtn.addEventListener('click', () => {
		if (!refreshGate()) {
			taskInput.focus();
			return;
		}
		const task = taskInput.value.trim();
		const maxCostUsd = parseFloat(budgetSlider.value) || 0.5;
		runTask({ task, maxCostUsd, resultPanel, runBtn, refreshGate });
	});

	taskInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			runBtn.click();
		}
	});

	// Establish the initial gate state (empty task → disabled, hint shown).
	refreshGate();
}

async function runTask({ task, maxCostUsd, resultPanel, runBtn, refreshGate }) {
	runBtn.disabled = true;
	runBtn.textContent = 'Running…';

	showSkeleton(resultPanel);

	let data;
	try {
		const res = await fetch('/api/agents/endpoint-shopper-run', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ task, maxCostUsd }),
		});

		if (res.status === 402) {
			const body = await res.json().catch(() => ({}));
			showPaywallPrompt(resultPanel, body, res.headers.get('payment-required'));
			return;
		}

		if (res.status === 400) {
			const body = await res.json().catch(() => ({}));
			showError(
				resultPanel,
				body.error || body.message || 'That task or budget was rejected. Adjust your inputs and try again.',
			);
			return;
		}

		if (!res.ok) {
			const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
			const isServer = res.status >= 500;
			showError(
				resultPanel,
				body.error || body.message || (isServer
					? 'The agent service is temporarily unavailable. Please try again in a moment.'
					: `Request failed (HTTP ${res.status}).`),
			);
			return;
		}

		data = await res.json();
	} catch (err) {
		showError(resultPanel, err.message || 'Network error — please try again');
		return;
	} finally {
		runBtn.innerHTML =
			'<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M3 2l9 5-9 5V2z" fill="currentColor"/></svg> Run Task';
		// Re-evaluate preconditions so the CTA only re-enables when valid.
		if (typeof refreshGate === 'function') refreshGate();
		else runBtn.disabled = false;
	}

	renderResults(resultPanel, data, task);
}

function showSkeleton(panel) {
	panel.innerHTML = `
		<div class="skeleton-list">
			<div class="skeleton-item"></div>
			<div class="skeleton-item"></div>
			<div class="skeleton-item"></div>
		</div>
	`;
}

function showError(panel, message) {
	panel.innerHTML = `
		<div class="error-card">
			<p>${escHtml(message)}</p>
			<button class="btn" type="button" id="error-retry">Run again</button>
		</div>
	`;
	const retry = panel.querySelector('#error-retry');
	if (retry) {
		retry.addEventListener('click', () => {
			// Keep the user's task and budget; just re-trigger the run.
			const runBtn = document.getElementById('run-btn');
			if (runBtn && !runBtn.disabled) runBtn.click();
			else document.getElementById('task-input')?.focus();
		});
	}
}

function showPaywallPrompt(panel, body, paymentRequiredHeader) {
	// The payment challenge can arrive in the `payment-required` header or, on
	// proxies that strip it, inside the 402 JSON body. Fall back to the body
	// (and finally to a bare paywall) so the Pay button always works.
	const challenge = paymentRequiredHeader
		|| body?.paymentRequired
		|| body?.payment_required
		|| (body?.accepts ? JSON.stringify(body) : '');

	const reqParam = challenge ? encodeURIComponent(challenge) : '';
	const ret = encodeURIComponent(location.pathname);
	const paywallUrl = reqParam
		? `/paywall.html?req=${reqParam}&return=${ret}`
		: `/paywall.html?return=${ret}`;

	const detail = body?.error || body?.message
		|| 'This endpoint costs USDC on Base or Solana. Use a wallet to pay and unlock the result.';

	panel.innerHTML = `
		<div class="error-card" style="border-color: rgba(255,180,0,0.3)">
			<p style="color:#e6a820">Payment required to use the Endpoint Shopper agent.</p>
			<p style="color:var(--text-3); font-size:13.5px; margin:0 0 14px">
				${escHtml(detail)}
			</p>
			<a class="btn primary" href="${paywallUrl}">Pay with Wallet</a>
		</div>
	`;
}

function renderResults(panel, data, task) {
	panel.innerHTML = '';

	const steps = Array.isArray(data.steps) ? data.steps : [];
	const answer = data.result?.answer || '';
	const totalCost = data.totalCostUsdc || '0.000000';

	// Render step cards with staggered animation delays
	const timeline = document.createElement('div');
	timeline.className = 'timeline';

	steps.forEach((step, i) => {
		const card = buildStepCard(step, i);
		timeline.appendChild(card);
	});

	panel.appendChild(timeline);

	// Total cost row
	if (steps.length > 0) {
		const totalRow = document.createElement('div');
		totalRow.className = 'total-row';
		const costFloat = parseFloat(totalCost);
		totalRow.innerHTML = `
			<span class="total-lbl">Total spent</span>
			<span class="total-val">${costFloat > 0 ? '$' + costFloat.toFixed(6) + ' USDC' : 'Free (no paid calls executed)'}</span>
		`;
		panel.appendChild(totalRow);
	}

	// Final answer card
	if (answer) {
		const answerCard = document.createElement('div');
		answerCard.className = 'answer-card';
		answerCard.style.animationDelay = `${steps.length * 120 + 80}ms`;
		answerCard.style.opacity = '0';
		answerCard.style.animation = `step-in 0.4s ease ${steps.length * 120 + 80}ms forwards`;
		answerCard.innerHTML = `
			<div class="answer-eyebrow">Final Answer</div>
			<div class="answer-text">${escHtml(answer)}</div>
		`;
		panel.appendChild(answerCard);
	}
}

function buildStepCard(step, index) {
	const card = document.createElement('div');
	card.className = 'step-card';
	card.style.animationDelay = `${index * 120}ms`;

	const action = step.action || 'call';
	const icon = STEP_ICONS[action] || '•';
	const actionLabel = ACTION_LABELS[action] || action;
	const costFloat = parseFloat(step.costUsdc || '0');
	const costNonzero = costFloat > 0;

	let outputHtml = '';
	if (step.output !== undefined && step.output !== null) {
		const outputStr = typeof step.output === 'string'
			? step.output
			: JSON.stringify(step.output, null, 2);

		// Check for payment_required flag
		const is402 = step.output?.payment_required === true;
		if (is402) {
			outputHtml = `<div class="step-output"><span class="badge-402">402 Payment Required</span> ${escHtml(JSON.stringify(step.output?.requirements || {}, null, 2)).slice(0, 300)}</div>`;
		} else if (outputStr && outputStr !== '{}' && outputStr !== '[]') {
			outputHtml = `<div class="step-output">${escHtml(outputStr.slice(0, 600))}${outputStr.length > 600 ? '\n…' : ''}</div>`;
		}
	}

	const endpointHtml = step.endpoint
		? `<div class="step-endpoint">${escHtml(step.endpoint)}</div>`
		: '';

	card.innerHTML = `
		<div class="step-icon">${icon}</div>
		<div class="step-body">
			<div class="step-meta">
				<span class="step-num">Step ${step.step}</span>
				<span class="step-action">${escHtml(actionLabel)}</span>
				<span class="step-cost${costNonzero ? ' nonzero' : ''}">${costNonzero ? '$' + costFloat.toFixed(6) : '0'}</span>
			</div>
			<div class="step-desc">${escHtml(step.description || '')}</div>
			${endpointHtml}
			${outputHtml}
		</div>
	`;

	return card;
}

function escHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

// Auto-init on DOMContentLoaded
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
