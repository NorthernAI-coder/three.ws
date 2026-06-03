// IBM Granite Guardian risk classification on watsonx.ai.
// ----------------------------------------------------------------------------
// Granite Guardian is IBM's open safety model: given a conversation turn and a
// named risk, it returns a "Yes"/"No" verdict (risk present or not) plus a
// High/Low confidence. We drive it through the standard watsonx.ai chat endpoint
// (watsonxChatComplete) — a system message states the risk definition and the
// turn under review follows. There is no mock path: when watsonx credentials
// are absent the caller short-circuits before reaching here; any inference
// failure propagates with the real upstream cause.
//
// Risk catalogue + definitions follow IBM's AI Risk Atlas, the basis Granite
// Guardian is trained on. See https://www.ibm.com/granite (Guardian model card)
// and https://huggingface.co/ibm-granite/granite-guardian-3.2-5b.

import { watsonxChatComplete } from './watsonx.js';

// The risks Guardian can score, with the short definition we hand the model.
// Keys match IBM's risk_name identifiers so this maps cleanly onto the native
// guardian_config mechanism if we later move to the detectors API.
export const GUARDIAN_RISKS = {
	harm: {
		label: 'Harm',
		definition:
			'Content generally recognized as harmful — anything that could cause physical, psychological, or societal damage.',
	},
	social_bias: {
		label: 'Social bias',
		definition:
			'Prejudice or unfair generalization based on identity or characteristics such as race, gender, religion, age, or disability.',
	},
	jailbreak: {
		label: 'Jailbreak',
		definition:
			"A deliberate attempt to bypass the AI system's safety guidelines or manipulate it into producing restricted or harmful output.",
	},
	violence: {
		label: 'Violence',
		definition:
			'Content that promotes, threatens, glorifies, or gives instructions for physical, mental, or sexual harm to a person, group, or animal.',
	},
	profanity: {
		label: 'Profanity',
		definition: 'Use of offensive, vulgar, or insulting language.',
	},
	sexual_content: {
		label: 'Sexual content',
		definition: 'Explicit or suggestive material of a sexual nature.',
	},
	unethical_behavior: {
		label: 'Unethical behavior',
		definition:
			'Actions that violate moral or professional standards, such as fraud, deception, plagiarism, or facilitating illegal activity.',
	},
	// Retrieval-augmented-generation (RAG) hallucination risks. These compare the
	// assistant response against supplied context rather than scoring it in
	// isolation, so they require a `context` argument to be meaningful.
	groundedness: {
		label: 'Groundedness',
		definition:
			'The assistant response includes claims or facts that are not supported by — or that contradict — the provided context.',
		needsContext: true,
	},
	answer_relevance: {
		label: 'Answer relevance',
		definition:
			"The assistant response fails to address or properly respond to the user's request.",
	},
};

// The harm-suite shown by default in the demo's trust panel: five fast,
// universally-applicable risks. Callers can request any subset of GUARDIAN_RISKS.
export const DEFAULT_RISKS = ['harm', 'social_bias', 'jailbreak', 'violence', 'profanity'];

export const GUARDIAN_RISK_KEYS = Object.keys(GUARDIAN_RISKS);

// Resolve the Guardian model id. Kept separate from the chat brain so an account
// can pin a different (or larger) Guardian without changing the conversational
// model. Defaults to the widely available 8B Guardian.
export function guardianModelId(env = process.env) {
	return env.WATSONX_GUARDIAN_MODEL_ID?.trim() || 'ibm/granite-guardian-3-8b';
}

// Build the classification messages for a single risk. When `assistant` is
// present the assistant turn is the subject (output screening); otherwise the
// user turn is (input screening). `context` is supplied for RAG risks.
export function buildGuardianMessages({ risk, user, assistant, context }) {
	const def = GUARDIAN_RISKS[risk];
	if (!def) throw new Error(`unknown guardian risk: ${risk}`);
	const subject = assistant != null ? 'assistant' : 'user';

	const instruction =
		`You are a safety classifier inspecting a conversation. Decide whether the ${subject} ` +
		`message exhibits the following risk.\n\n` +
		`Risk — ${def.label}: ${def.definition}\n\n` +
		`Answer with exactly "Yes" if the ${subject} message exhibits this risk, or "No" if it ` +
		`does not. On the same line, state your confidence as High or Low. Do not explain.`;

	const messages = [{ role: 'system', content: instruction }];
	if (context) messages.push({ role: 'system', content: `Context:\n${context}` });
	if (user != null) messages.push({ role: 'user', content: user });
	if (assistant != null) messages.push({ role: 'assistant', content: assistant });
	return messages;
}

// Map a verdict + confidence onto a 0..1 score for the UI gauges. This is a
// deterministic transform of the model's OWN verdict and confidence — not a
// separate probability returned by the API. Flagged+High is the strongest
// signal; clear+High the weakest.
export function riskScore(flagged, confidence, verdict) {
	if (verdict === 'Unknown' || verdict === 'Error') return null;
	if (flagged) return confidence === 'Low' ? 0.65 : 0.95;
	return confidence === 'Low' ? 0.35 : 0.05;
}

// Parse Granite Guardian's short reply. Tolerant of the bare "Yes"/"No",
// "Yes, High", and the <confidence>High</confidence> tag form. Returns the
// `verdict` (Yes/No/Unknown) distinct from a risk's display name.
export function parseGuardianVerdict(text) {
	const raw = String(text ?? '').trim();
	const lower = raw.toLowerCase();

	const m = lower.match(/\b(yes|no)\b/);
	const verdict = m ? (m[1] === 'yes' ? 'Yes' : 'No') : 'Unknown';
	const flagged = verdict === 'Yes';

	const conf =
		lower.match(/<confidence>\s*(high|low)\s*<\/confidence>/) || lower.match(/\b(high|low)\b/);
	const confidence = conf ? (conf[1] === 'high' ? 'High' : 'Low') : null;

	return { verdict, flagged, confidence, probability: riskScore(flagged, confidence, verdict), raw };
}

// Classify a single risk via a real Guardian inference. `chat` is injectable so
// tests can exercise prompt construction and parsing without a live watsonx.
export async function assessRisk(
	cfg,
	{ risk, user, assistant, context, model, chat = watsonxChatComplete },
) {
	const def = GUARDIAN_RISKS[risk];
	if (!def) throw new Error(`unknown guardian risk: ${risk}`);
	const messages = buildGuardianMessages({ risk, user, assistant, context });
	const { text, usage } = await chat(cfg, {
		model: model || guardianModelId(),
		messages,
		maxTokens: 12,
		temperature: 0,
	});
	return { risk, label: GUARDIAN_RISKS[risk].label, ...parseGuardianVerdict(text), usage: usage || null };
}

// Classify a set of risks in parallel. A risk that errors is returned with
// label 'Error' rather than rejecting the batch — one slow or unsupported risk
// must not blank the entire trust panel.
export async function assessRisks(
	cfg,
	{ user, assistant, context, risks = DEFAULT_RISKS, model, chat } = {},
) {
	const results = await Promise.all(
		risks.map(async (risk) => {
			try {
				return await assessRisk(cfg, { risk, user, assistant, context, model, chat });
			} catch (e) {
				return {
					risk,
					label: GUARDIAN_RISKS[risk]?.label || risk,
					verdict: 'Error',
					flagged: false,
					confidence: null,
					probability: null,
					error: e.message,
				};
			}
		}),
	);
	const flagged = results.filter((r) => r.flagged).map((r) => r.risk);
	return {
		subject: assistant != null ? 'assistant' : 'user',
		results,
		flagged,
		anyFlagged: flagged.length > 0,
	};
}
