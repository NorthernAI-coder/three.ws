/**
 * Money Studio — mount bootstrap (P4)
 * ===================================
 * Binds the Money Studio to the Agent Studio shell's Money tab on
 * `studio-shell:ready`. Mirrors P1–P3 mounts: idempotent and order-independent.
 *
 * The agent-studio page loads this alongside the shell:
 *   <script type="module" src="/src/studio/money/money-mount.js"></script>
 */

import { studio } from '../agent-studio-store.js';
import { mountMoneyStudio } from './money-studio.js';

const SELECTOR = '[data-studio-mount="money"]';

function mount() {
	const panel = document.querySelector(SELECTOR);
	if (!panel || panel.dataset.moneyMounted) return false;
	mountMoneyStudio(panel, { studio });
	return true;
}

document.addEventListener('studio-shell:ready', mount, { once: false });

if (!mount()) {
	let tries = 0;
	const t = setInterval(() => {
		if (mount() || ++tries > 60) clearInterval(t); // ~6s ceiling
	}, 100);
}
