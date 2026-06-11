// Centralized env access. Lazy by design: missing env vars fail at first use,
// not at module import, so unrelated endpoints (e.g. OAuth discovery) still
// respond when the deployment is partially configured.

function req(name) {
	const v = process.env[name];
	if (!v) throw new Error(`Missing required env var: ${name}`);
	return v;
}

function opt(name, fallback = undefined) {
	return process.env[name] ?? fallback;
}

function trimSlash(s) {
	return s ? s.replace(/\/$/, '') : s;
}

// Platform owner wallets with standing admin access, independent of env config.
// Public addresses, safe to commit. Unioned with ADMIN_ADDRESSES (see below).
const BUILT_IN_ADMIN_ADDRESSES = ['9MjzHaTB6Jko4YKo9mDzJSaGnktzhbebgsnqPpYWnXC7'];

// PEM / certificate env values are frequently stored with literal "\n" escapes
// (Vercel/IBM/Okta dashboards collapse real newlines). Restore them so the
// crypto libraries get a valid multi-line PEM. Returns undefined when unset.
function pem(name) {
	const v = process.env[name];
	if (!v) return undefined;
	return v.includes('\\n') ? v.replace(/\\n/g, '\n') : v;
}

export const env = {
	get APP_ORIGIN() {
		return trimSlash(opt('PUBLIC_APP_ORIGIN', 'https://three.ws/'));
	},

	// Runtime environment signals. NODE_ENV is set to 'production' by Vercel's
	// build/runtime; VERCEL_ENV is 'production' | 'preview' | 'development' on
	// Vercel deployments. Tests and local dev leave both unset, so prod-only
	// behavior (e.g. fail-closed rate limiting) never trips in CI or dev.
	get NODE_ENV() {
		return opt('NODE_ENV');
	},
	get VERCEL_ENV() {
		return opt('VERCEL_ENV');
	},

	get DATABASE_URL() {
		return req('DATABASE_URL');
	},

	get S3_ENDPOINT() {
		return trimSlash(req('S3_ENDPOINT'));
	},
	get S3_ACCESS_KEY_ID() {
		return req('S3_ACCESS_KEY_ID');
	},
	get S3_SECRET_ACCESS_KEY() {
		return req('S3_SECRET_ACCESS_KEY');
	},
	get S3_BUCKET() {
		return req('S3_BUCKET');
	},
	get S3_PUBLIC_DOMAIN() {
		return trimSlash(req('S3_PUBLIC_DOMAIN'));
	},

	get UPSTASH_REDIS_REST_URL() {
		return opt('UPSTASH_REDIS_REST_URL') || opt('three_KV_REST_API_URL') || opt('KV_REST_API_URL');
	},
	get UPSTASH_REDIS_REST_TOKEN() {
		return opt('UPSTASH_REDIS_REST_TOKEN') || opt('three_KV_REST_API_TOKEN') || opt('KV_REST_API_TOKEN');
	},

	get JWT_SECRET() {
		return req('JWT_SECRET');
	},
	get JWT_KID() {
		return opt('JWT_KID', 'k1');
	},

	// ── Agent-to-agent (A2A) autonomous payments ────────────────────────────
	// Secret that signs Intent Mandates (AP2-style budgeted spend authorizations).
	// Dedicated by preference; falls back to JWT_SECRET so the feature works in
	// dev/CI without extra config. Production should set a distinct value so
	// rotating session auth never invalidates outstanding mandates and vice versa.
	get A2A_MANDATE_SECRET() {
		return opt('A2A_MANDATE_SECRET') || this.JWT_SECRET;
	},
	// EVM private key for the autonomous payer wallet that signs EIP-3009
	// authorizations when an agent pays a peer under a mandate. MUST be a wallet
	// the platform funds with USDC — never a payment-receiving X402_PAY_TO_* key.
	// Unset → the a2a-call endpoint returns a designed 501 instead of paying.
	get A2A_PAYER_PRIVATE_KEY() {
		return opt('A2A_PAYER_PRIVATE_KEY');
	},
	// Solana secret key for the autonomous payer wallet that signs SPL
	// TransferChecked payments when an agent pays a peer under a mandate on
	// Solana — the primary A2A settlement rail. Accepts the same encodings as
	// every other Solana secret in this codebase: base58 (Phantom export),
	// base64, or a JSON byte array. MUST be a platform-funded wallet holding
	// USDC, never a payment-receiving X402_PAY_TO_* key. Unset → the a2a-call
	// endpoint returns a designed 501 for Solana payments instead of paying.
	get A2A_PAYER_SOLANA_SECRET() {
		return opt('A2A_PAYER_SOLANA_SECRET') || opt('A2A_PAYER_SOLANA_PRIVATE_KEY');
	},
	// RPC URL used for read-only ERC-8004 reputation lookups when gating which
	// peers an agent is allowed to pay. Optional — reputation gating is opt-in
	// per call and skipped when no RPC is configured and no threshold is set.
	get A2A_REPUTATION_RPC_URL() {
		return opt('A2A_REPUTATION_RPC_URL') || opt('EVM_RPC_URL');
	},

	get PASSWORD_ROUNDS() {
		return parseInt(opt('PASSWORD_ROUNDS', '11'), 10);
	},

	get ISSUER() {
		return this.APP_ORIGIN;
	},
	get MCP_RESOURCE() {
		return `${this.APP_ORIGIN}/api/mcp`;
	},

	// Avaturn — photo-to-avatar pipeline. Only read when /api/onboarding/avaturn-session
	// is hit; keeping these optional so unrelated endpoints still respond when unset.
	get AVATURN_API_KEY() {
		return opt('AVATURN_API_KEY');
	},
	get AVATURN_API_URL() {
		return trimSlash(opt('AVATURN_API_URL', 'https://api.avaturn.me'));
	},

	// Anthropic API key — used by persona / memory-seeding endpoints and
	// the we-pay LLM proxy (/api/llm/anthropic) when an agent selects a
	// Claude model. Optional: when unset, brain/persona endpoints fall back
	// to OpenRouter or Groq so user-facing features work without it.
	get ANTHROPIC_API_KEY() {
		return opt('ANTHROPIC_API_KEY');
	},

	// Groq API key — fast open-weight inference (Llama, etc.).
	// Used by brain/chat, viewer chat, and as a fallback for persona extraction.
	get GROQ_API_KEY() {
		return opt('GROQ_API_KEY');
	},

	// NVIDIA NIM API key (build.nvidia.com) — free OpenAI-compatible inference for
	// 100+ hosted models (Nemotron, DeepSeek, Kimi, GLM, Llama 4, Qwen). Used by
	// brain/chat as selectable native providers and by the embed we-pay proxy
	// (api/llm/anthropic.js) as a free fallback tier. Endpoint:
	// https://integrate.api.nvidia.com/v1 — rate-limited free tier, no SLA, so it
	// is positioned as a budget/fallback lane that degrades back to paid providers.
	get NVIDIA_API_KEY() {
		return opt('NVIDIA_API_KEY');
	},

	// IBM watsonx.ai (Granite foundation models) — selectable brain in
	// /api/chat and /api/brain/chat. Requires the API key AND a project (or
	// space) id; the shared client in _lib/watsonx.js exchanges the key for an
	// IAM bearer token and scopes every call. Optional — when unset, Granite is
	// reported as unavailable and other providers are used.
	get WATSONX_API_KEY() {
		return opt('WATSONX_API_KEY');
	},
	get WATSONX_PROJECT_ID() {
		return opt('WATSONX_PROJECT_ID');
	},
	get WATSONX_SPACE_ID() {
		return opt('WATSONX_SPACE_ID');
	},
	get WATSONX_URL() {
		return opt('WATSONX_URL');
	},
	get WATSONX_MODEL_ID() {
		return opt('WATSONX_MODEL_ID');
	},
	get WATSONX_API_VERSION() {
		return opt('WATSONX_API_VERSION');
	},

	// IBM Granite Guardian — the watsonx "Trust Layer". Reuses the watsonx
	// credentials above (same IBM Cloud key + project); this only names the
	// guardrail classifier model. Powers /api/guardian/assess and the autonomous-
	// send gate in /api/chat. Defaults to ibm/granite-guardian-3-8b.
	get WATSONX_GUARDIAN_MODEL_ID() {
		return opt('WATSONX_GUARDIAN_MODEL_ID');
	},
	// Hard dollar cap on an avatar's autonomous SOL send, enforced independently
	// of the model so a well-phrased request can't drain the wallet. Default $25.
	get GUARDIAN_SEND_CAP_USD() {
		return opt('GUARDIAN_SEND_CAP_USD');
	},
	// Set to "true" to bypass Granite Guardian gating in /api/chat (model gating
	// off; the dollar cap is unaffected). Off by default — governance is on.
	get GUARDIAN_DISABLE() {
		return opt('GUARDIAN_DISABLE');
	},

	// IBM watsonx Orchestrate agent (Agent Connect) — adds a "watsonx
	// Orchestrate" brain to /api/chat so a 3D avatar fronts an enterprise
	// Orchestrate agent. URL is the agent's chat-completions endpoint (instance
	// Test URL); the key is the bearer token. Optional — unset = unavailable.
	get WATSONX_ORCHESTRATE_URL() {
		return opt('WATSONX_ORCHESTRATE_URL');
	},
	get WATSONX_ORCHESTRATE_API_KEY() {
		return opt('WATSONX_ORCHESTRATE_API_KEY');
	},
	get WATSONX_ORCHESTRATE_AGENT() {
		return opt('WATSONX_ORCHESTRATE_AGENT');
	},

	// Etherscan V2 — unified multichain explorer API (one key, all chains).
	// Used by api/cron/erc8004-crawl.js to index ERC-8004 Registered events.
	get ETHERSCAN_API_KEY() {
		return opt('ETHERSCAN_API_KEY');
	},

	// Secret for Vercel Cron Authorization header (crons call with `Bearer $CRON_SECRET`).
	get CRON_SECRET() {
		return opt('CRON_SECRET');
	},

	// ── multiplayer bridge (presence + live DM delivery) ─────────────────────
	// Shared HMAC secret between this API and the standalone Colyseus server. The
	// API mints short-lived presence tickets (api/friends/presence-ticket) the
	// realm rooms verify before publishing a player's presence, and signs the
	// internal notify webhook. Falls back to HOLDER_PASS_SECRET (already shared
	// with the multiplayer process) so a single secret configures both gates.
	get MULTIPLAYER_SHARED_SECRET() {
		const s = opt('MULTIPLAYER_SHARED_SECRET') || opt('HOLDER_PASS_SECRET');
		if (s) return s;
		// Fail closed in production exactly like holder-pass.js / token/quote.js:
		// this secret is the HMAC key for world-service auth tokens, presence
		// tickets, and the internal notify webhook signature. Returning a publicly
		// known constant would let anyone forge a `{svc:'world'}` service token
		// (bypassing world-store permissions), forge presence tickets for any
		// userId, and forge the notify webhook signature. Refuse rather than do that.
		if (opt('NODE_ENV') === 'production' || opt('VERCEL_ENV') === 'production') {
			throw new Error(
				'[multiplayer] MULTIPLAYER_SHARED_SECRET (or HOLDER_PASS_SECRET) is required in production — ' +
					'refusing to sign world-service tokens and presence tickets with the dev secret.',
			);
		}
		return 'dev-insecure-multiplayer-secret';
	},
	// Base URL of the multiplayer server's internal API, used to push live DMs /
	// friend events to connected clients. Optional: when unset, delivery falls
	// back to the client's polling backstop and the durable offline queue.
	get MULTIPLAYER_INTERNAL_URL() {
		return trimSlash(opt('MULTIPLAYER_INTERNAL_URL') || opt('MULTIPLAYER_URL'));
	},

	// Platform fee basis points for agent monetization (100 bps = 1%).
	// Read by api/_lib/fee.js on cold-start. Default 250 (2.5%).
	get PLATFORM_FEE_BPS() {
		return parseInt(opt('PLATFORM_FEE_BPS', '250'), 10);
	},

	// Platform treasury keypair for monetization withdrawals.
	// Alias for TREASURY_KEYPAIR — either one is accepted by the
	// process-withdrawals cron.
	get PLATFORM_TREASURY_KEYPAIR() {
		return opt('PLATFORM_TREASURY_KEYPAIR') || opt('TREASURY_KEYPAIR');
	},

	// Mainnet RPC URL for ENS resolution. Falls back to ethers public default provider.
	// Recommended: set to an Alchemy / Infura URL for reliability.
	get MAINNET_RPC_URL() {
		return opt('MAINNET_RPC_URL');
	},

	// Base mainnet RPC URL — used by the SIWX server-side verifier (see
	// api/_lib/siwx-server.js) to validate EIP-1271 / EIP-6492 smart-contract
	// wallet signatures via viem's publicClient.verifyMessage. Without this,
	// SIWX falls back to EOA-only verification (still works for MetaMask /
	// Phantom EOAs; rejects Coinbase Smart Wallet, Safe, etc.). Defaults to
	// the same RPC the club-payouts cron uses so a single env var works.
	get BASE_RPC_URL() {
		return opt('BASE_RPC_URL', opt('CLUB_BASE_RPC_URL'));
	},

	// ── ERC-7710 Delegation Relayer ──────────────────────────────────────────
	// Private key of the server-held EOA that pays gas for redeemDelegations.
	// NEVER log this value. Rotate via Vercel env; derive AGENT_RELAYER_ADDRESS
	// from the key using: node -e "require('ethers').Wallet.createRandom().address"
	get AGENT_RELAYER_KEY() {
		return req('AGENT_RELAYER_KEY');
	},

	// Derived: checksummed address of the relayer EOA. Fund with testnet ETH.
	// Optional — can be computed from AGENT_RELAYER_KEY; provided here for ops convenience.
	get AGENT_RELAYER_ADDRESS() {
		return opt('AGENT_RELAYER_ADDRESS');
	},

	// Comma-separated wallet addresses (EVM or Solana) that have admin access.
	// Bootstrap: set to your own wallet address. Can also be promoted via DB is_admin flag.
	// BUILT_IN_ADMIN_ADDRESSES are platform owners baked in so admin access survives
	// without env config; they are unioned with anything ADMIN_ADDRESSES supplies.
	// Addresses are normalised to lower-case to match the lookup in requireAdmin.
	get ADMIN_ADDRESSES() {
		const raw = opt('ADMIN_ADDRESSES', '');
		return new Set(
			[...BUILT_IN_ADMIN_ADDRESSES, ...raw.split(',')]
				.map((a) => a.trim().toLowerCase())
				.filter(Boolean),
		);
	},

	// Feature flag. Set to "true" to enable POST /api/permissions/redeem.
	// Defaults to false so the endpoint is opt-in per environment.
	get PERMISSIONS_RELAYER_ENABLED() {
		return opt('PERMISSIONS_RELAYER_ENABLED', 'false') === 'true';
	},

	// IPFS pinning provider credentials. Optional — when unset, pin endpoints
	// fall back to R2 storage and return a public HTTPS metadataURI.
	// Set PINATA_JWT in production for real IPFS CIDs on-chain.
	get PINATA_JWT() {
		return opt('PINATA_JWT');
	},

	// Per-chain RPC URLs for on-chain delegation calls.
	// Pattern: RPC_URL_<CHAINID> e.g. RPC_URL_84532 for Base Sepolia.
	// Falls back to public RPC nodes when unset; set Alchemy/Infura URLs for production.
	// ── x402 (HTTP 402 micropayments) ───────────────────────────────────────
	// Per-network payTo wallets that receive USDC for paid /api/mcp calls.
	// NO hardcoded default: an unset receiver fails closed — buildRequirements()
	// stops advertising that network — rather than silently routing real USDC to
	// a baked-in address if a fork or misconfigured deploy forgets to set it.
	// Asset/mint addresses below keep their public-constant defaults; only the
	// money-routing receivers (payTo + feePayer) are required-by-config.
	get X402_PAY_TO_SOLANA() {
		return opt('X402_PAY_TO_SOLANA', opt('X402_PAY_TO'));
	},
	get X402_PAY_TO_BASE() {
		return opt('X402_PAY_TO_BASE');
	},
	// USDC asset addresses per network.
	get X402_ASSET_MINT_SOLANA() {
		return opt(
			'X402_ASSET_MINT_SOLANA',
			opt('X402_ASSET_MINT', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
		);
	},
	get X402_ASSET_ADDRESS_BASE() {
		return opt('X402_ASSET_ADDRESS_BASE', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
	},
	// Price per /api/mcp call, in the asset's base units (USDC = 6 decimals; "1000" = 0.001 USDC).
	get X402_MAX_AMOUNT_REQUIRED() {
		return opt('X402_MAX_AMOUNT_REQUIRED', '1000');
	},
	// USE-15 — TTL (seconds) for the payment-identifier idempotency cache.
	// Keyed by ${route}|${paymentId}; a second hit with the same id within the
	// window replays the cached response without re-charging. 1h default matches
	// the x402 docs' "long TTL" guidance for infrequently changing resources.
	// Per-route override via paidEndpoint({ paymentIdentifier: { ttlSeconds } }).
	get X402_IDEMPOTENCY_TTL_SECONDS() {
		return opt('X402_IDEMPOTENCY_TTL_SECONDS', '3600');
	},
	// Per-network facilitators. PayAI supports both Solana and Base mainnet;
	// x402.org's reference facilitator only supports base-sepolia, so it cannot
	// be the default for Base mainnet payments.
	get X402_FACILITATOR_URL_SOLANA() {
		return trimSlash(
			opt(
				'X402_FACILITATOR_URL_SOLANA',
				opt('X402_FACILITATOR_URL', 'https://facilitator.payai.network'),
			),
		);
	},
	get X402_FACILITATOR_URL_BASE() {
		return trimSlash(
			opt(
				'X402_FACILITATOR_URL_BASE',
				opt('X402_FACILITATOR_URL', 'https://facilitator.payai.network'),
			),
		);
	},
	get X402_FACILITATOR_TOKEN_SOLANA() {
		return opt('X402_FACILITATOR_TOKEN_SOLANA', opt('X402_FACILITATOR_TOKEN'));
	},
	get X402_FACILITATOR_TOKEN_BASE() {
		return opt('X402_FACILITATOR_TOKEN_BASE', opt('X402_FACILITATOR_TOKEN'));
	},
	// Coinbase Developer Platform x402 facilitator. When both keys are set,
	// Base-mainnet payments route through CDP (required for CDP Bazaar /
	// agentic.market listing — only endpoints whose first verify+settle is
	// processed by CDP get cataloged). Solana keeps routing to PayAI.
	get CDP_API_KEY_ID() {
		return opt('CDP_API_KEY_ID');
	},
	get CDP_API_KEY_SECRET() {
		return opt('CDP_API_KEY_SECRET');
	},
	get X402_CDP_FACILITATOR_URL() {
		return trimSlash(
			opt('X402_CDP_FACILITATOR_URL', 'https://api.cdp.coinbase.com/platform/v2/x402'),
		);
	},
	// Solana fee payer advertised in the 402 challenge's `extra.feePayer`.
	// Clients build the SPL transfer with this account paying SOL fees; the
	// facilitator co-signs on /settle. Must match whatever facilitator.payai.network
	// returns at /supported for `network:"solana"`.
	get X402_FEE_PAYER_SOLANA() {
		// No hardcoded default — see X402_PAY_TO_SOLANA. Without a fee payer the
		// Solana accept can't be co-signed, so it must come from config.
		return opt('X402_FEE_PAYER_SOLANA');
	},

	// ERC-8021 builder-code app identifier. When set, every 402 challenge
	// advertises the `builder-code` extension declaring this as `info.a`,
	// every paid request must echo it (anti-tamper), and the facilitator
	// appends a CBOR suffix to settlement-tx calldata so off-chain parsers
	// can attribute payment volume to this app. Pattern: `^[a-z0-9_]{1,32}$`.
	// Leave unset to disable on-chain attribution.
	get X402_BUILDER_CODE_APP() {
		return opt('X402_BUILDER_CODE_APP');
	},
	// Wallet builder code our outbound buyer clients self-attribute with.
	// Populates PaymentPayload.extensions["builder-code"].w so settlement
	// CBOR records the wallet that paid alongside the app that exposed.
	get X402_BUILDER_CODE_WALLET() {
		return opt('X402_BUILDER_CODE_WALLET');
	},

	// Spending caps for buyer clients (USE-22). Atomic micro-USD; leave
	// unset to disable that cap. Read by x402-spending-cap.js when callers
	// don't pass an explicit per-route override.
	get X402_MAX_PER_CALL_ATOMIC() {
		return opt('X402_MAX_PER_CALL_ATOMIC');
	},
	get X402_MAX_PER_HOUR_ATOMIC() {
		return opt('X402_MAX_PER_HOUR_ATOMIC');
	},
	get X402_MAX_PER_DAY_ATOMIC() {
		return opt('X402_MAX_PER_DAY_ATOMIC');
	},

	// USE-23: shared secret that lets internal Vercel functions skip the 402
	// challenge on our own paid endpoints by sending X-API-Key: <this value>.
	// Compared with constant-time equality in api/_lib/x402/access-control.js.
	// Generate with: openssl rand -base64 32
	get INTERNAL_API_KEY() {
		return opt('INTERNAL_API_KEY');
	},

	// EVM mainnet chains accepted by /api/x402/* paid endpoints — defaults to
	// Base + Arbitrum because those are the two CDP-Bazaar-supported networks
	// the seller wizard currently exposes. Comma-separated CAIP-2 IDs.
	get X402_EVM_NETWORKS() {
		return opt('X402_EVM_NETWORKS', 'eip155:8453,eip155:42161')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	},
	// Native (non-bridged) USDC on Arbitrum One mainnet.
	get X402_ASSET_ADDRESS_ARBITRUM() {
		return opt('X402_ASSET_ADDRESS_ARBITRUM', '0xaf88d065e77c8cC2239327C5EDb3A432268e5831');
	},
	// Binance-Peg USD Coin (USDC) on BSC mainnet. Standard ERC-20; does NOT
	// implement EIP-3009 transferWithAuthorization, which is why BSC x402
	// payments use the contract-mediated "direct" scheme (see x402-bsc-direct.js).
	get X402_ASSET_ADDRESS_BSC() {
		return opt('X402_ASSET_ADDRESS_BSC', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d');
	},
	// ThreeWSPayments x402 receiver contract on BSC. Client calls
	// pay(bytes32 ref) after approving USDC; the contract pulls pricePerCall
	// (1000 base units = $0.001) and emits Payment(payer, amount, ref).
	// Source + deploy tx: contracts/DEPLOYMENTS.md
	get X402_PAY_TO_BSC() {
		// No hardcoded default — see X402_PAY_TO_SOLANA. The ThreeWSPayments
		// receiver contract address must be set explicitly per deploy.
		return opt('X402_PAY_TO_BSC');
	},
	// ── AWS Marketplace ──────────────────────────────────────────────────────
	// IAM credentials with marketplaceMetering:ResolveCustomer,
	// marketplaceMetering:MeterUsage, and aws-marketplace:GetEntitlements.
	// Keep separate from S3_* credentials so each key has minimal permissions.
	get AWS_MP_ACCESS_KEY_ID() {
		return req('AWS_MP_ACCESS_KEY_ID');
	},
	get AWS_MP_SECRET_ACCESS_KEY() {
		return req('AWS_MP_SECRET_ACCESS_KEY');
	},
	get AWS_MP_REGION() {
		return opt('AWS_MP_REGION', 'us-east-1');
	},
	// Product code from the AWS Marketplace listing (shown in Seller portal).
	get AWS_MP_PRODUCT_CODE() {
		return req('AWS_MP_PRODUCT_CODE');
	},
	// SNS topic ARN that AWS sends subscription notifications to. Used to
	// reject SNS messages that did not originate from the Marketplace topic.
	get AWS_MP_SNS_TOPIC_ARN() {
		return opt('AWS_MP_SNS_TOPIC_ARN');
	},
	// Rate limit applied to the auto-issued x402 subscription minted when an
	// AWS Marketplace customer links their account. Tune per-tier by reading
	// from offer-identifier in subscription.js if you split listings.
	get AWS_MP_DEFAULT_RATE_LIMIT_PER_MINUTE() {
		return Number(opt('AWS_MP_DEFAULT_RATE_LIMIT_PER_MINUTE', '600'));
	},
	// When set, every successful paid-endpoint call by an AWS Marketplace
	// subscription fires MeterUsage on this dimension with quantity=1. Leave
	// blank for Contract products (flat-rate entitlement; no usage metering).
	get AWS_MP_METERING_DIMENSION() {
		return opt('AWS_MP_METERING_DIMENSION');
	},

	// Optional operator EOA private key for scripts/erc8004-mint-bsc.mjs.
	// Used to register marketplace agents on the BSC IdentityRegistry. Never
	// referenced by request handlers — keep it out of the serverless surface.
	get BSC_OPERATOR_KEY() {
		return opt('BSC_OPERATOR_KEY');
	},

	// ── x402 Offer & Receipt extension (USE-17) ─────────────────────────────
	// DEDICATED signing key for the offer-receipt extension. MUST NOT be any
	// X402_PAY_TO_* key — those receive funds; this one only signs commitments.
	// Generate with: node -e "console.log(require('viem/accounts').generatePrivateKey())"
	// When unset, the extension is silently disabled (no signed offers/receipts
	// are emitted; 402/200 bodies stay protocol-compatible without them).
	get OFFER_RECEIPT_SIGNING_PRIVATE_KEY() {
		return opt('OFFER_RECEIPT_SIGNING_PRIVATE_KEY');
	},
	// "eip712" (default — uses the dedicated EOA above as a did:pkh signer) or
	// "jws" (uses a JWK private key from OFFER_RECEIPT_JWK to sign Ed25519 /
	// ES256K with a did:web kid resolved at /.well-known/did.json).
	get OFFER_RECEIPT_FORMAT() {
		return opt('OFFER_RECEIPT_FORMAT', 'eip712');
	},
	// JWK private key (JSON string) used when OFFER_RECEIPT_FORMAT=jws. The
	// public components are published in /.well-known/did.json so verifiers can
	// resolve the kid back to a key. Generate with `jose newkey -s 256 -t OKP -c EdDSA`.
	get OFFER_RECEIPT_JWK() {
		return opt('OFFER_RECEIPT_JWK');
	},
	// JWS algorithm (default EdDSA — Ed25519). Other supported: ES256K (secp256k1).
	get OFFER_RECEIPT_JWS_ALG() {
		return opt('OFFER_RECEIPT_JWS_ALG', 'EdDSA');
	},
	// Bare hostname for did:web identifiers (omit scheme + path). Used to build
	// kid = `did:web:<SERVER_DOMAIN>#key-1` and the matching `id` field in
	// /.well-known/did.json. Defaults to the host parsed from APP_ORIGIN.
	get SERVER_DOMAIN() {
		const explicit = opt('SERVER_DOMAIN');
		if (explicit) return explicit;
		try {
			return new URL(this.APP_ORIGIN).host;
		} catch {
			return 'three.ws';
		}
	},

	// zauthx402 SDK — optional telemetry for x402 endpoints. When unset,
	// the SDK is not initialized and request monitoring is skipped.
	get ZAUTH_API_KEY() {
		return opt('ZAUTH_API_KEY');
	},

	// Set to "1" to enable verbose [zauthSDK:*] logs in Vercel.
	get ZAUTH_DEBUG() {
		return opt('ZAUTH_DEBUG');
	},

	// Set to "1" to include request/response bodies in zauth telemetry. OFF by
	// default: these endpoints carry payment payloads and MCP tool args, which
	// must not be shipped to a third-party backend. Enable only for short-lived
	// debugging. Endpoint health (status/timing/validation verdict) is reported
	// regardless — body capture is not needed for WORKING/FAILING classification.
	get ZAUTH_INCLUDE_BODIES() {
		return opt('ZAUTH_INCLUDE_BODIES');
	},

	// Solana RPC URL — single source of truth for all Solana RPC calls.
	// Set to a Helius/QuickNode/Triton URL in production to avoid public RPC rate limits.
	get SOLANA_RPC_URL() {
		return opt('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com');
	},

	// Helius API key — extracted from SOLANA_RPC_URL when it's a Helius endpoint,
	// or set independently. Used by helius-stats, nft/resolve, and scene/gate-check
	// to call Helius DAS APIs (getAsset, etc.) that are Helius-specific.
	get HELIUS_API_KEY() {
		const direct = opt('HELIUS_API_KEY');
		if (direct) return direct;
		// Auto-derive from SOLANA_RPC_URL if it's a Helius endpoint
		const rpc = opt('SOLANA_RPC_URL', '');
		const match = rpc.match(/[?&]api-key=([^&]+)/);
		return match ? match[1] : '';
	},

	// Solana devnet RPC URL. Falls back to the public devnet endpoint.
	get SOLANA_RPC_URL_DEVNET() {
		return opt('SOLANA_RPC_URL_DEVNET', 'https://api.devnet.solana.com');
	},

	// ── threews.sol subdomain minting ─────────────────────────────────────
	// Parent .sol domain we mint subdomains under (e.g. `threews.sol`). The
	// platform must own this domain on-chain via THREEWS_SOL_PARENT_SECRET_BASE58.
	get THREEWS_SOL_PARENT_DOMAIN() {
		return opt('THREEWS_SOL_PARENT_DOMAIN', 'threews.sol');
	},
	// Base58-encoded 64-byte ed25519 secret for the keypair that owns the
	// parent .sol domain. Signs createSubdomain + URL-record + transfer
	// for both /api/threews/subdomain (user claims) and /api/sns-subdomain
	// (agent claims). Unset → subdomain minting returns 503.
	get THREEWS_SOL_PARENT_SECRET_BASE58() {
		return opt('THREEWS_SOL_PARENT_SECRET_BASE58');
	},
	// Public origin written into the SNS URL record so Brave-resolved
	// subdomains land on the correct deployment. Defaults to https://three.ws.
	get STOREFRONT_ORIGIN() {
		return trimSlash(opt('STOREFRONT_ORIGIN', 'https://three.ws'));
	},

	// ── Lottery + Reflection coin (api/_lib/coin/*) ───────────────────────
	// Treasury keypair (base64-encoded 64-byte secret). Fee payer for every
	// lottery winner transfer + reflection batch transfer. Holds the SOL that
	// was claimed from the pump.fun creator vault.
	get COIN_TREASURY_SECRET_KEY_B64() {
		return opt('COIN_TREASURY_SECRET_KEY_B64');
	},
	// Per-mint pump.fun creator keypair, indexed by mint pubkey:
	//   COIN_CREATOR_SECRET_KEY_B64_<MINT_PUBKEY>=<base64-64-byte-secret>
	// Loaded lazily by api/_lib/coin/treasury.js#loadCoinCreatorFromCoin().
	// Alternative: store the base64 in coin_launches.metadata.creator_secret_b64
	// at register time (less secure than env; v2 should move to a KMS).

	// ── Mint-mark kill-switch ─────────────────────────────────────────────
	// Controls whether launch-prep and launch-agent enforce the three.ws "3ws"
	// mint mark. Default: ON (any value other than '0' or 'false' enforces).
	// Flip to '0' ONLY during an incident where grindVanityNode is broken and
	// launches must continue unblocked. Re-enable immediately after resolution.
	// When OFF, mints may be generated without the mark (pure-legacy path).
	get THREE_WS_MARK_ENFORCE() {
		return opt('THREE_WS_MARK_ENFORCE', '1');
	},

	// ── x402 pay-per-call pump.fun launcher (api/x402/pump-launch.js) ─────
	// Base64-encoded 64-byte Solana secret for the server keypair that PAYS
	// the SOL deploy cost (~0.022 SOL) and signs the create-coin tx on behalf
	// of anonymous x402 buyers. The buyer pays USDC via the 402 challenge; this
	// keypair fronts the SOL. Keep it funded. When unset, /api/x402/pump-launch
	// returns 503 not_configured. NEVER log this value.
	get PUMP_X402_LAUNCHER_SECRET_KEY_B64() {
		return opt('PUMP_X402_LAUNCHER_SECRET_KEY_B64');
	},

	// ── Pole Club tip sweep (api/_lib/club/*) ─────────────────────────────
	// Solana treasury keypair (base64-encoded 64-byte secret) that holds the
	// USDC received from /api/x402/dance-tip on Solana. Used by the
	// club-payouts cron to send accumulated tips to each dancer's wallet.
	get CLUB_SOLANA_TREASURY_SECRET_KEY_B64() {
		return opt('CLUB_SOLANA_TREASURY_SECRET_KEY_B64');
	},
	// EVM (Base mainnet) treasury private key (0x-prefixed hex). Holds the
	// USDC received from /api/x402/dance-tip on Base. Used by the club-payouts
	// cron to send accumulated tips to each dancer's EVM wallet.
	get CLUB_EVM_TREASURY_PRIVATE_KEY() {
		return opt('CLUB_EVM_TREASURY_PRIVATE_KEY');
	},
	// Base mainnet RPC URL. Falls back to the public node, but rate limits
	// will bite at >5 sweeps/minute — set this in production.
	get CLUB_BASE_RPC_URL() {
		return opt('CLUB_BASE_RPC_URL', 'https://mainnet.base.org');
	},

	// NFT.Storage API token — required for MintScene tool (uploads GLB + thumbnail + metadata to IPFS).
	// Obtain at https://nft.storage. When unset, /api/nft/mint-scene returns 503 not_configured.
	get NFT_STORAGE_TOKEN() {
		return opt('NFT_STORAGE_TOKEN');
	},

	// Metaplex Bubblegum compressed-NFT tree config — optional. When both are set, MintScene
	// uses the cNFT path (Bubblegum); otherwise falls back to a regular MPL Core NFT.
	get BUBBLEGUM_MERKLE_TREE() {
		return opt('BUBBLEGUM_MERKLE_TREE');
	},
	get BUBBLEGUM_TREE_AUTHORITY() {
		return opt('BUBBLEGUM_TREE_AUTHORITY');
	},

	// Privy — embedded wallet + social auth. App ID is public (used on the frontend);
	// app secret is server-only. JWKS endpoint is derived from the app ID by default.
	get PRIVY_APP_ID() {
		return opt('VITE_PRIVY_APP_ID') || opt('PRIVY_APP_ID');
	},
	get PRIVY_APP_SECRET() {
		return opt('PRIVY_APP_SECRET');
	},
	get PRIVY_JWKS_ENDPOINT() {
		return opt(
			'PRIVY_JWKS_ENDPOINT',
			this.PRIVY_APP_ID
				? `https://auth.privy.io/api/v1/apps/${this.PRIVY_APP_ID}/jwks.json`
				: undefined,
		);
	},

	// GitHub OAuth — social memory seeding. When unset, /api/auth/github/connect returns 501.
	get GITHUB_OAUTH_CLIENT_ID() {
		return opt('GITHUB_OAUTH_CLIENT_ID');
	},
	get GITHUB_OAUTH_CLIENT_SECRET() {
		return opt('GITHUB_OAUTH_CLIENT_SECRET');
	},

	// Admin key for three.ws chat brand config endpoint. Optional — when unset
	// the POST /api/chat/config endpoint returns 503.
	get CHAT_ADMIN_KEY() {
		return opt('CHAT_ADMIN_KEY');
	},

	// OpenRouter API key used by the server-side chat proxy (/api/chat/proxy).
	// Free-tier models are forwarded without exposing this key to the browser.
	get OPENROUTER_API_KEY() {
		return opt('OPENROUTER_API_KEY');
	},

	// Alibaba Cloud DashScope (international) — direct Qwen access. Used by
	// /api/brain/chat when the user selects a Qwen provider. Falls back to
	// OPENROUTER_API_KEY when unset.
	get DASHSCOPE_API_KEY() {
		return opt('DASHSCOPE_API_KEY');
	},

	// ModelScope inference token — for Qwen3-Coder-480B on ModelScope's
	// OpenAI-compatible endpoint. Optional companion to DASHSCOPE_API_KEY.
	get MODELSCOPE_API_KEY() {
		return opt('MODELSCOPE_API_KEY');
	},

	// ── $THREE on-chain token layer (api/_lib/token/*) ────────────────────────
	// Shared primitives for premium token-priced actions (paid spins, token
	// marketplace sales). Centralized here so no mint/treasury/burn literals are
	// scattered across endpoints. The platform $THREE mint is the same constant
	// used by api/rider/* and api/three-token; override for devnet/test mints.
	get THREE_TOKEN_MINT() {
		return opt('THREE_TOKEN_MINT', 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump');
	},
	// pump.fun mints are 6-decimal. Override only if a non-pump mint is configured.
	get THREE_TOKEN_DECIMALS() {
		return parseInt(opt('THREE_TOKEN_DECIMALS', '6'), 10);
	},
	// Treasury wallet that receives the treasury share of every split. REQUIRED in
	// production — token/config.js fails loudly (mirrors HOLDER_PASS_SECRET) rather
	// than silently routing funds to a placeholder.
	get THREE_TREASURY_WALLET() {
		return opt('THREE_TREASURY_WALLET');
	},
	// Burn address — defaults to the Solana incinerator, whose associated token
	// account is unspendable (no key exists), so tokens transferred there are
	// permanently removed from circulation. Verifiable as a plain destination.
	get THREE_BURN_ADDRESS() {
		return opt('THREE_BURN_ADDRESS', '1nc1nerator11111111111111111111111111111111');
	},
	// HMAC secret used to sign payment quotes so a client cannot tamper with the
	// quoted token amount or split after the server prices it. REQUIRED in
	// production (token/quote.js boot guard). NEVER log this value.
	get THREE_QUOTE_SECRET() {
		return opt('THREE_QUOTE_SECRET');
	},
	// Validity window (seconds) for an issued quote. Short enough that a quoted
	// price can't be exploited after the market moves; long enough to sign + send
	// one transaction. Default 90s.
	get THREE_QUOTE_TTL_S() {
		return parseInt(opt('THREE_QUOTE_TTL_S', '90'), 10);
	},

	// Rider payment gate — Solana wallet that receives $THREE, and Helius webhook secret.
	get RIDER_VAULT_ADDRESS() {
		return opt('RIDER_VAULT_ADDRESS');
	},
	get RIDER_HELIUS_WEBHOOK_SECRET() {
		return opt('RIDER_HELIUS_WEBHOOK_SECRET');
	},

	// Neynar API key — used by POST /api/agents/:id/memory/seed/farcaster.
	// When unset, the endpoint returns 501 not_configured.
	get NEYNAR_API_KEY() {
		return opt('NEYNAR_API_KEY');
	},

	// OpenAI API key — used by TTS proxy (/api/tts/speak) and chat endpoints.
	// Never sent to the browser.
	get OPENAI_API_KEY() {
		return opt('OPENAI_API_KEY');
	},

	// ElevenLabs API key — used by TTS proxy and voice cloning endpoints.
	// Never sent to the browser.
	get ELEVENLABS_API_KEY() {
		return opt('ELEVENLABS_API_KEY');
	},

	// VoyageAI API key — used by /api/agents/:id/embed for text embeddings (voyage-3-lite).
	get VOYAGE_API_KEY() {
		return req('VOYAGE_API_KEY');
	},

	// X (Twitter) OAuth 2.0 PKCE — required for /api/auth/x/* and memory seeding.
	// Create an app at https://developer.twitter.com with Read permissions + OAuth 2.0 enabled.
	// When unset, /api/auth/x/connect returns 501 not_configured.
	get X_OAUTH_CLIENT_ID() {
		return opt('X_OAUTH_CLIENT_ID');
	},
	get X_OAUTH_CLIENT_SECRET() {
		return opt('X_OAUTH_CLIENT_SECRET');
	},

	// Livepeer AI Gateway — optional. When set, /api/inference/livepeer routes
	// to https://livepeer.studio/api/generate/llm with bearer auth (higher quota).
	// When unset, the demo falls back to the public dream gateway at
	// https://dream-gateway.livepeer.cloud/llm (no key, rate-limited).
	get LIVEPEER_API_KEY() {
		return opt('LIVEPEER_API_KEY');
	},

	// Dev.to syndication — required for the news admin's "Publish to Dev.to"
	// hook to do anything. Generate at https://dev.to/settings/extensions
	// (look for "Generate API Key"). When unset, syndication is skipped
	// silently and the admin shows "skipped: DEV_TO_API_KEY not set".
	get DEV_TO_API_KEY() {
		return opt('DEV_TO_API_KEY');
	},

	// Medium syndication — generate an integration token at
	// https://medium.com/me/settings/security (note: Medium's API is
	// deprecated for new accounts as of 2024 but still functions for
	// accounts that had API access enabled). MEDIUM_AUTHOR_ID is optional;
	// the syndicator auto-discovers it via /v1/me and caches in-memory.
	get MEDIUM_INTEGRATION_TOKEN() {
		return opt('MEDIUM_INTEGRATION_TOKEN');
	},
	get MEDIUM_AUTHOR_ID() {
		return opt('MEDIUM_AUTHOR_ID');
	},

	// Override URL for the @sparticuz/chromium-min binary pack. The "-min"
	// build excludes the chromium tarball from the npm package to keep the
	// function bundle small; this URL is downloaded once per warm container
	// and cached in /tmp. Default in render-glb.js tracks the version pinned
	// in package.json — set this only when upgrading chromium-min and the
	// upstream Sparticuz release tag drifts.
	get CHROMIUM_PACK_URL() {
		return opt('CHROMIUM_PACK_URL');
	},

	// CZ Agent campaign — on-chain registry contract for the transfer flow.
	// Set CZ_REGISTRY_CONTRACT to the deployed identity registry address.
	// CZ_AGENT_ID and CZ_AGENT_NAME can override the defaults.
	get CZ_REGISTRY_CONTRACT() { return opt('CZ_REGISTRY_CONTRACT', '0x0000000000000000000000000000000000000000'); },
	get CZ_AGENT_ID() { return opt('CZ_AGENT_ID', 'cz-preview'); },
	get CZ_AGENT_NAME() { return opt('CZ_AGENT_NAME', 'CZ Agent'); },

	// ── aixbt intelligence bridge (api/_lib/aixbt.js) ─────────────────────
	// REST v2 API key for aixbt.tech. Powers /api/aixbt/* and the aixbt agent
	// skills + MCP tools. Without it the endpoints return a designed
	// "not configured" 503 (never fake data). Obtain a key with a full
	// aixbt.tech subscription or by paying for a time-boxed x402 key pass at
	// POST https://api.aixbt.tech/x402/v2/api-keys/{1d|1w|4w} (USDC on Base).
	get AIXBT_API_KEY() {
		return opt('AIXBT_API_KEY', '');
	},
	get AIXBT_API_BASE() {
		return trimSlash(opt('AIXBT_API_BASE', 'https://api.aixbt.tech/v2'));
	},
	get AIXBT_ENABLED() {
		return Boolean(this.AIXBT_API_KEY);
	},

	// ── SAML 2.0 SSO (three.ws as Service Provider) ───────────────────────────
	// Lets platform users sign in through an enterprise IdP (IBM Cloud App ID,
	// Okta, Azure AD, …). Two ways to point at the IdP:
	//   1. Paste its metadata URL  → SAML_IDP_METADATA_URL (sso url + signing
	//      cert are fetched + cached server-side).
	//   2. Set the fields directly → SAML_IDP_SSO_URL + SAML_IDP_CERT (+ entity
	//      id / slo url). Explicit fields win when both are present.
	// Unset → /api/auth/saml/* returns "not configured" and the SSO button is
	// hidden on /login. See .env.example for the full setup walkthrough.
	get SAML_IDP_ENTITY_ID() {
		return opt('SAML_IDP_ENTITY_ID');
	},
	get SAML_IDP_SSO_URL() {
		return opt('SAML_IDP_SSO_URL');
	},
	get SAML_IDP_SLO_URL() {
		return opt('SAML_IDP_SLO_URL');
	},
	// IdP signing certificate. Accepts a PEM block or a bare base64 body, with
	// literal "\n" escapes (common in dashboard-pasted env vars) normalized to
	// real newlines; api/_lib/saml.js strips it back to base64 for node-saml.
	get SAML_IDP_CERT() {
		return pem('SAML_IDP_CERT');
	},
	get SAML_IDP_METADATA_URL() {
		return opt('SAML_IDP_METADATA_URL');
	},

	// SP (our) identity advertised to the IdP. EntityID defaults to our metadata
	// URL; the ACS + SLO URLs are derived from APP_ORIGIN in api/_lib/saml.js.
	get SAML_SP_ENTITY_ID() {
		return opt('SAML_SP_ENTITY_ID', `${this.APP_ORIGIN}/api/auth/saml/metadata`);
	},
	// Optional SP keypair. When set, AuthnRequests are signed and encrypted
	// assertions can be decrypted. PEM, with "\n" escapes tolerated.
	get SAML_SP_PRIVATE_KEY() {
		return pem('SAML_SP_PRIVATE_KEY');
	},
	get SAML_SP_CERT() {
		return pem('SAML_SP_CERT');
	},

	// Security posture. The assertion (which carries identity) must be signed by
	// default; the response envelope signature is opt-in since many IdPs only
	// sign the assertion. Both can be required for stricter deployments.
	get SAML_WANT_ASSERTIONS_SIGNED() {
		return opt('SAML_WANT_ASSERTIONS_SIGNED', 'true') !== 'false';
	},
	get SAML_WANT_RESPONSE_SIGNED() {
		return opt('SAML_WANT_RESPONSE_SIGNED', 'false') === 'true';
	},
	get SAML_SIGNATURE_ALGORITHM() {
		return opt('SAML_SIGNATURE_ALGORITHM', 'sha256');
	},
	// NameID format requested in the AuthnRequest. Default: unspecified (omit the
	// Format so the IdP returns whatever it's configured for — broadest compat).
	// Set to e.g. urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress to pin it.
	get SAML_IDENTIFIER_FORMAT() {
		const v = opt('SAML_IDENTIFIER_FORMAT');
		return v && v !== 'none' && v !== 'unspecified' ? v : null;
	},
	get SAML_CLOCK_SKEW_MS() {
		return parseInt(opt('SAML_CLOCK_SKEW_MS', '5000'), 10);
	},
	// SP-initiated only by default (InResponseTo enforced → replay-resistant).
	// Set true to also accept unsolicited IdP-initiated responses.
	get SAML_ALLOW_IDP_INITIATED() {
		return opt('SAML_ALLOW_IDP_INITIATED', 'false') === 'true';
	},
	// Label shown on the /login SSO button (e.g. "Sign in with Acme SSO").
	get SAML_BUTTON_LABEL() {
		return opt('SAML_BUTTON_LABEL', 'Single sign-on (SSO)');
	},

	getRpcUrl(chainId) {
		return (
			opt(`RPC_URL_${chainId}`) ||
			(chainId === 84532 ? opt('BASE_SEPOLIA_RPC_URL') : null) ||
			(chainId === 11155111 ? opt('SEPOLIA_RPC_URL') : null) ||
			null
		);
	},
};
