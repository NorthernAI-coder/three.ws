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

	return {
		AGENT_ID: process.env.AGENT_ID,
		AGENT_JWT: process.env.AGENT_JWT,
		PUSH_URL: process.env.PUSH_URL || 'https://three.ws/api/agent-screen-push',
		TASK_URL: process.env.TASK_URL || 'https://three.ws/api/agent-task',
		BROWSERBASE_API_KEY,
		BROWSERBASE_PROJECT_ID,
		CYCLE_MS: Number(process.env.CYCLE_MS || 30_000),
		// Whether to capture a screenshot on every pushFrame call (can be throttled)
		SCREENSHOT_INTERVAL_MS: Number(process.env.SCREENSHOT_INTERVAL_MS || 5_000),
	};
}
