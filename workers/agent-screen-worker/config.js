export function loadConfig() {
	const required = ['AGENT_ID', 'AGENT_JWT'];
	for (const k of required) {
		if (!process.env[k]) throw new Error(`Missing required env var: ${k}`);
	}

	const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY || '';
	const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID || '';

	if (BROWSERBASE_API_KEY && !BROWSERBASE_PROJECT_ID) {
		throw new Error('BROWSERBASE_PROJECT_ID is required when BROWSERBASE_API_KEY is set');
	}

	// Stagehand's page.act()/page.extract() are LLM-driven — without a model + key
	// they throw on the first real interaction. The provider-prefixed form
	// ("anthropic/<model>") passes the model string straight to Stagehand's
	// Anthropic client, so it isn't gated by Stagehand's built-in model allowlist
	// and survives model releases. Navigation-only casters don't need it, so this
	// is a loud warning rather than a hard requirement.
	const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
	const MODEL_NAME = process.env.STAGEHAND_MODEL || 'anthropic/claude-opus-4-8';

	if (!ANTHROPIC_API_KEY) {
		console.warn(
			'[config] ANTHROPIC_API_KEY is not set — the agent can navigate and screenshot, ' +
				'but page.act()/page.extract() (typing, clicking, reading) will fail. ' +
				'Set ANTHROPIC_API_KEY to enable full task execution.',
		);
	}

	return {
		AGENT_ID: process.env.AGENT_ID,
		AGENT_JWT: process.env.AGENT_JWT,
		PUSH_URL: process.env.PUSH_URL || 'https://three.ws/api/agent-screen-push',
		TASK_URL: process.env.TASK_URL || 'https://three.ws/api/agent-task',
		// Neutral home the agent rests on while idle (no task queued). Coin-agnostic
		// by design — defaults to the platform home.
		HOME_URL: process.env.HOME_URL || 'https://three.ws',
		BROWSERBASE_API_KEY,
		BROWSERBASE_PROJECT_ID,
		ANTHROPIC_API_KEY,
		MODEL_NAME,
		CYCLE_MS: Number(process.env.CYCLE_MS || 30_000),
		// Whether to capture a screenshot on every pushFrame call (can be throttled)
		SCREENSHOT_INTERVAL_MS: Number(process.env.SCREENSHOT_INTERVAL_MS || 5_000),
	};
}
