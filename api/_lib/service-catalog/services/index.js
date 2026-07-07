// Static barrel of every paid-service descriptor, in the order the x402
// discovery doc lists them. Static imports are deliberate: Vercel's bundler
// only reliably ships what static imports reach (a runtime glob assembled
// EMPTY in the deployed lambda — see api/_lib/crypto-catalog/index.js for the
// full account of that failure), so this barrel is the production source of
// truth.
//
// >>> Adding a paid service: drop `services/<slug>.js` AND add its import +
// >>> row here, in the position it should appear in the discovery doc.

import modelCheck from './model-check.js';
import agentReputation from './agent-reputation.js';
import agentBouncer from './agent-bouncer.js';
import onchainIdentityVerify from './onchain-identity-verify.js';
import pumpLaunch from './pump-launch.js';
import forge from './forge.js';
import skillMarketplace from './skill-marketplace.js';
import symbolAvailability from './symbol-availability.js';
import vanity from './vanity.js';
import vanityVerifiable from './vanity-verifiable.js';
import vanityPremium from './vanity-premium.js';
import permit2PaidDemo from './permit2-paid-demo.js';
import assetDownload from './asset-download.js';
import skillCall from './skill-call.js';
import tokenIntel from './token-intel.js';
import cosmeticPurchase from './cosmetic-purchase.js';
import animationDownload from './animation-download.js';
import clubCover from './club-cover.js';
import analytics from './analytics.js';
import apiKeyHealth from './api-key-health.js';
import authHealth from './auth-health.js';
import avatarOptimizeBatch from './avatar-optimize-batch.js';
import pipelineRig from './pipeline-rig.js';
import pipelineRemesh from './pipeline-remesh.js';
import pipelineGameready from './pipeline-gameready.js';
import pipelineStylize from './pipeline-stylize.js';
import pipelineRembg from './pipeline-rembg.js';
import pipeline from './pipeline.js';
import bazaarFeed from './bazaar-feed.js';
import billboard from './billboard.js';
import crossChain from './cross-chain.js';
import did from './did.js';
import feedHealth from './feed-health.js';
import llmProxy from './llm-proxy.js';
import mcpToolCatalog from './mcp-tool-catalog.js';
import modelValidationSweep from './model-validation-sweep.js';
import notify from './notify.js';
import payByName from './pay-by-name.js';
import rateLimitProbe from './rate-limit-probe.js';
import schemaCheck from './schema-check.js';
import solanaRegisterHealth from './solana-register-health.js';
import spendSession from './spend-session.js';
import telegramHealth from './telegram-health.js';
import walletConnect from './wallet-connect.js';

export const PAID_SERVICES = Object.freeze([
	modelCheck,
	agentReputation,
	agentBouncer,
	onchainIdentityVerify,
	pumpLaunch,
	forge,
	skillMarketplace,
	symbolAvailability,
	vanity,
	vanityVerifiable,
	vanityPremium,
	permit2PaidDemo,
	assetDownload,
	skillCall,
	tokenIntel,
	cosmeticPurchase,
	animationDownload,
	clubCover,
	analytics,
	apiKeyHealth,
	authHealth,
	avatarOptimizeBatch,
	pipelineRig,
	pipelineRemesh,
	pipelineGameready,
	pipelineStylize,
	pipelineRembg,
	pipeline,
	bazaarFeed,
	billboard,
	crossChain,
	did,
	feedHealth,
	llmProxy,
	mcpToolCatalog,
	modelValidationSweep,
	notify,
	payByName,
	rateLimitProbe,
	schemaCheck,
	solanaRegisterHealth,
	spendSession,
	telegramHealth,
	walletConnect,
]);
