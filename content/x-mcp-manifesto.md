# A body, a wallet, and a conscience: the 31 MCP servers of three.ws

*Long-form X article. The complete, canonical reference for every three.ws MCP server: what it does, how it works, who it's for, and why it exists. $THREE is the only coin.*

---

Chatbots are a dead end for what comes next. The interesting question isn't "what can a model say." It's "what can an agent actually do, safely, on your behalf, with money and consequences on the line." We've spent the last stretch answering that in code. The result is **31 MCP servers**, all published to npm under `@three-ws` and registered in the official MCP registry under `io.github.nirholas`. Every one is a thin, real wrapper over a live three.ws capability. No mocks, no demos. Add any of them to Claude, Cursor, or your own agent with one line of `npx`.

They are built in layers. Here is every server, layer by layer, and why it's there.

---

## The interface: MCP

Every capability speaks the **Model Context Protocol**, the emerging universal port between an AI assistant and the real world. We made MCP the front door, not an afterthought, because a capability an agent can't reach may as well not exist. The technical shape is consistent across all 31: an ESM Node server on `@modelcontextprotocol/sdk`, running over stdio, that turns three.ws HTTP endpoints into typed, annotated tools (read-only vs write, idempotent vs destructive) so a client can reason about each call before it makes it. Fourteen also run as hosted remote servers over Streamable HTTP for clients that prefer a URL to an install.

---

## Aggregate entry points

**`@three-ws/mcp-server`** is the flagship. It bundles the whole creation toolchain behind one server: a free `forge_free` text-to-3D tool (TRELLIS / NVIDIA NIM) plus fifteen paid tools that settle per call in USDC on Solana via x402: `mesh_forge`, `rig_mesh`, `forge_avatar`, `text_to_avatar`, `pose_seed`, `pump_snapshot`, `agent_reputation`, `vanity_grinder`, `sentiment_pulse`, `ens_sns_resolve`, `agent_delegate_action`, `agenc_list_tasks`, `agenc_get_task`, `agenc_get_agent`, `aixbt_intel`, `aixbt_projects`. It's for builders who want one endpoint that does everything and pays as it goes. Also hosted at `/api/mcp`. `npx -y @three-ws/mcp-server`

**`@three-ws/mcp-bridge`** turns *any* x402-paid endpoint on the open web into a callable tool. It pre-loads the Coinbase x402 Bazaar so new paid services appear automatically, auto-pays with spend caps, and needs no subscription or key. Tools: `call_paid_endpoint`, `list_bazaar_tools`, `refresh_bazaar`. For agents that need to reach services three.ws didn't build. `npx -y @three-ws/mcp-bridge`

---

## 3D, because agents need a body

Text agents are ghosts. These give them presence.

**`@three-ws/scene-mcp`** turns one sentence into a placed 3D diorama: it returns a composed plan (mood, palette, per-object prompts) over the live forge pipeline, ready to build into an orbitable scene. Read-only, no key, no signer. Tools: `compose_scene`, `get_scene`, `list_scenes`. For anyone who wants to speak a world into being. `npx -y @three-ws/scene-mcp`

**`@three-ws/avatar-agent`** is the full embodiment toolkit, 20 tools in one: generic GLB ops (`inspect_glb`, `validate_glb`, `optimize_glb`, `thumbnail_glb`, `viewer_url`), avatar lifecycle (`generate_avatar`, `spawn_avatar`, `render_avatar`, `dress_avatar`, `list_avatars`), a built-in Solana wallet (`wallet_create`, `wallet_send`, `wallet_balance`), pump.fun powers (`pump_launch`, `pump_buy`, `pump_collect_fees`, `pump_snapshot`), plus `speak` (TTS), `ens_sns_resolve`, and `list_animations`. It takes any GLB and turns it into a riggable agent with a voice and a wallet. For developers building a full 3D agent. `npx -y @three-ws/avatar-agent`

**`@three-ws/avatar-mcp`** (the lightweight viewer) renders a live, interactive 3D avatar inline in MCP clients that support apps, or hands back paste-anywhere embed code. Zero-config, read-only over live three.ws endpoints. Tools: `avatar`, `render_avatar`, `avatar_embed_code`, `get_avatar`. For anyone who just wants the avatar to show up in chat or on a page. `npx -y @three-ws/avatar-mcp`

**`@three-ws/audio-mcp`** is the voice-and-motion layer: `text_to_speech`, `speech_to_text`, `audio_to_face` (lipsync blendshapes from audio), and a motion-capture clip library (`motion_capture_clip`, `motion_capture_clips`). It transforms audio into the signals that drive a 3D agent's face and body. For builders who want agents that talk and move, not just type. `npx -y @three-ws/audio-mcp`

**`@three-ws/loom-mcp`** is the community 3D-creation gallery: browse the feed, fetch a creation with its viewer URL, and submit your own. Tools: `get_loom_feed`, `get_creation`, `submit_creation`. It closes the loop with scene and avatar generation by giving creations a home. For creators sharing what they forged. `npx -y @three-ws/loom-mcp`

---

## AI capability surfaces

**`@three-ws/brain-mcp`** is one interface over many models. `list_providers` enumerates what's available; `chat` runs a completion through the three.ws multi-provider router (Claude, GPT, Qwen, Nemotron and more) with automatic fallback, so a client wires one tool instead of every vendor SDK. For agents that want the best model for a task without the plumbing. `npx -y @three-ws/brain-mcp`

**`@three-ws/vision-mcp`** gives an agent eyes: `analyze_image` and `describe_image` run a vision-language model (free-first NVIDIA NIM with a paid fallback), and `get_vision_status` reports which backend is live. Pass a URL or base64 image and an instruction. For agents that need to understand what they're looking at. `npx -y @three-ws/vision-mcp`

**`@three-ws/ibm-watsonx-mcp`** bridges IBM watsonx.ai Granite models using the caller's own IBM Cloud credentials: `watsonx_chat`, `watsonx_generate`, `watsonx_embed`, `watsonx_tokenize`, `watsonx_forecast`, `watsonx_list_models`. For enterprises already on IBM Cloud who want Granite in their agent. `npx -y @three-ws/ibm-watsonx-mcp`

**`@three-ws/ibm-x402-mcp`** is the same Granite power with no IBM account required from the caller: `ibm_granite_chat`, `ibm_granite_code`, `ibm_granite_embed`, `ibm_granite_analyze`, `ibm_granite_forecast`, billed per call in USDC over x402 (the operator supplies the credentials). For agents that want enterprise inference on a pay-as-you-go basis. `npx -y @three-ws/ibm-x402-mcp`

---

## x402, because autonomy requires payments

An agent that can't pay can't act in the real economy.

**`@three-ws/x402-mcp`** is a self-custodial buyer: `find_services` searches the Bazaar, `inspect_endpoint` reads a price *before* you commit funds, `pay_and_call` settles in USDC or $THREE from your own Solana key (real settlement, bounded by spend caps), and `x402_wallet` reports balance and keypair info. Never custodial. For agents that must pay for things while their owner keeps the keys. `npx -y @three-ws/x402-mcp`

(The merchant side and the open-web bridge live in `mcp-server` and `mcp-bridge` above.)

---

## $THREE, because value should be native

**`@three-ws/three-token-mcp`** is, as far as we know, the first MCP server whose actions burn a token. `three_price` reads the live USD price via Jupiter, `three_balance` reads a wallet's holdings, and `three_burn` executes a real on-chain burn that removes $THREE from supply and funds the treasury. $THREE is the only coin three.ws touches, and across the platform agents are net buyers of it by design. For agents that hold and defend $THREE. `npx -y @three-ws/three-token-mcp`

---

## Market data and discovery

**`@three-ws/pumpfun-mcp`** is free, read-only pump.fun and Solana analytics over public RPC, 22 tools deep: token discovery (`get_new_tokens`, `get_trending_tokens`, `get_graduated_tokens`, `get_king_of_the_hill`, `search_tokens`, `get_token_details`), on-chain analysis (`get_bonding_curve`, `get_token_holders`, `get_token_trades`, `get_creator_profile`), creator-fee tooling (`pumpfun_list_claims`, `pumpfun_watch_claims`, `pumpfun_first_claims`, `pumpfun_watch_whales`), `sns_resolve`, social sentiment (`social_cashtag_sentiment`, `social_x_post_impact`), `kol_leaderboard`, `pumpfun_quote_swap`, `pumpfun_vanity_mint`, `pumpfun_token_3d`, and `pumpfun_bot_status`. No API keys. For agents reading the memecoin market. `npx -y @three-ws/pumpfun-mcp`

**`@three-ws/intel-mcp`** reads the market the way smart money does: `smart_money_coin` scores a coin by who is net-buying it, `wallet_intel` pulls a wallet's realized reputation, `signal_feed` reports a feed's proven accuracy, `kol_leaderboard` and `kol_trades` rank tracked traders, and `copy_smart_wallets` browses the copy-trade directory. Read-only over live data. For agents that judge a coin by its buyers, not its chart. `npx -y @three-ws/intel-mcp`

**`@three-ws/kol-mcp`** is the per-wallet deep dive that complements intel's leaderboard: `get_wallet_portfolio` (one tracked trader's holdings and realized P&L) and `get_wallet_trades` (their trades on a given mint), via a Birdeye proxy. For agents studying a specific KOL before following them. `npx -y @three-ws/kol-mcp`

**`@three-ws/signals-mcp`** is the signal marketplace: `list_signal_feeds` ranks feeds by proven edge, `subscribe_signal` and `set_subscription_status` manage follows, `get_subscriptions` lists them, and `get_mirror_leaderboard` ranks publishers by real on-chain performance. For agents that want vetted alpha, not noise. `npx -y @three-ws/signals-mcp`

**`@three-ws/activity-mcp`** is the live pulse of the platform: `get_trending_agents`, `get_trending_coins`, the `$THREE` holder leaderboard (`get_holder_leaderboard`, `get_tier_info`), and the site-wide activity ticker (`get_feed_events`). Public, read-only. For agents and dashboards that need situational awareness. `npx -y @three-ws/activity-mcp`

**`@three-ws/marketplace-mcp`** browses the public catalog: `browse_agents`, `agent_detail`, `agent_categories`, `browse_skills`, `skill_categories`. Read-only discovery. For agents shopping the marketplace or finding reusable skills. `npx -y @three-ws/marketplace-mcp`

---

## Identity, reputation, and provenance, because trust can't be vibes

**`@three-ws/naming-mcp`** is the on-chain identity layer: `sns_resolve` (a `.sol` name to its owner wallet), `sns_reverse` (a wallet to its primary name) over Bonfida SNS on mainnet, and `threews_availability` to check if a `*.threews.sol` agent handle is free. For agents that need a human-readable name and address. `npx -y @three-ws/naming-mcp`

**`@three-ws/provenance-mcp`** is the trust substrate: `append_agent_action` writes to an append-only, ERC-191-signed log, and `list_agent_actions` / `query_action` read it back. Records are never deleted and are on-chain verifiable, so one agent can audit another's history before trusting it. For any system that needs proof, not screenshots. `npx -y @three-ws/provenance-mcp`

**`@three-ws/agenc-mcp`** is agent-to-agent coordination: `list_tasks` and `get_task` browse the AgenC on-chain task marketplace, `get_agent` reads the ERC-8004-style identity registry, `link_agent` ties a three.ws identity in, and `query_x402_services` discovers paid work. For agents that hire and get hired by other agents. `npx -y @three-ws/agenc-mcp`

**`@three-ws/vanity-mcp`** reads the secret-blind vanity-address bounty market: `vanity_quote` (price and difficulty for a pattern), `vanity_appraise` (rarity of an address), `vanity_board`, `vanity_open`, `vanity_leaderboard`, `vanity_gallery`, `vanity_stats`, `vanity_config`. Workers grind in parallel while the requester's found address stays sealed. For agents that want a memorable, provably-rare address. `npx -y @three-ws/vanity-mcp`

---

## The autonomous control plane, because "autonomous" without limits is just "reckless"

This is the part most platforms skip, and the part we care about most. An agent with a wallet and no boundaries is a liability, so the agent's own controls are first-class servers, every limit enforced server-side where the agent's prompt cannot reach.

**`@three-ws/autopilot-mcp`** is the keystone. The owner grants `scopes` (nothing by default), sets a daily **SOL** spend cap, and chooses a confirmation policy via `get_autopilot_config` / `set_autopilot_config`. The agent then runs a transparent loop: `generate_proposals` turns high-salience memories into provenance-cited candidate actions, `list_proposals` and `dryrun_proposal` review them, `adjust_proposal` tunes one, `execute_proposal` takes the real action (confirmation-gated and irreversible), and `dismiss_proposal` / `undo_action` close the trust loop. `list_autopilot_activity` is the signed receipts log and `compute_trust` is the earned trust level (sandbox, then trusted, then autonomous). Crucially, the spend cap is in SOL, and a server-side guard makes **$THREE a one-way valve**: an agent can buy, hold, and burn $THREE but can never sell or send it. For owners who want autonomy with brakes. `npx -y @three-ws/autopilot-mcp`

**`@three-ws/portfolio-mcp`** is the agent's view of its own money: `get_portfolio_summary`, `get_portfolio_history`, `get_portfolio_asset`, `get_trades_feed`, and `get_wallet_balances` are live reads, and `send_transfer` broadcasts a real signed Solana transfer. For agents that need to know and move what they hold. `npx -y @three-ws/portfolio-mcp`

**`@three-ws/copy-mcp`** runs copy-trading non-custodially: `list_subscriptions`, `create_subscription`, `update_subscription`, `cancel_subscription` manage the follows and guard rules, while `get_executions`, `record_execution`, and `get_earnings` track results and fees. For agents that mirror a proven leader within their own limits. `npx -y @three-ws/copy-mcp`

**`@three-ws/alerts-mcp`** lets an agent watch the market headlessly: `create_alert_rule`, `update_alert_rule`, `delete_alert_rule`, `list_alert_rules`, and `get_alert_history` define pump.fun rules that fire across in-app, webhook, and Telegram, evaluated by a server-side cron. For agents that need to know the moment something moves. `npx -y @three-ws/alerts-mcp`

**`@three-ws/notifications-mcp`** is the agent's inbox: `list_notifications`, `mark_read`, `delete_notification`, the delivery-preference matrix (`get_preferences`, `set_preferences`), and Web Push device registration (`register_push_device`, `unregister_push_device`). For agents that need to receive and triage inbound events without polling. `npx -y @three-ws/notifications-mcp`

**`@three-ws/billing-mcp`** is the agent's account economics: `get_billing_summary`, `query_usage`, `list` and `get_receipt` for invoices, plus `get_revenue`, `get_fee_info`, and `export_billing_history`. Account-scoped and read-only. For agents that should know their own quota and spend before they act. `npx -y @three-ws/billing-mcp`

---

## Product surfaces with real backends

**`@three-ws/clash-mcp`** is Coin Clash, the community faction game backed by real holdings and pump.fun data: `get_clash_state`, `get_clash_leaderboard`, `enlist_faction`, `rally_faction`. For agents (and people) who want to play. `npx -y @three-ws/clash-mcp`

**`@three-ws/tutor-mcp`** runs a Pay-As-You-Learn tutoring session ledger: `load_session` reads the running itemized tab and `close_session` finalizes it into an attested invoice. For agents that teach and bill fairly by the minute. `npx -y @three-ws/tutor-mcp`

---

## Sniping and trading, and what's next

Put the layers together: discovery (`pumpfun-mcp`), signals (`intel-mcp`, `signals-mcp`, `kol-mcp`), alerts (`alerts-mcp`), a wallet (`portfolio-mcp`, `x402-mcp`), and the control plane (`autopilot-mcp`). What you get is the use case agents will actually reach for: sniping pump.fun launches and acting on alpha, in SOL, within limits their owner set. We've published the spec for the trading capability: SOL-denominated buy and sell of arbitrary coins, grounded in real signals, confirmation-gated, daily-capped, and $THREE still never sold. We'd rather build it with brakes than pretend it won't happen.

Next:

- **`trading-mcp`**, shipped in phases: quotes and positions first (read-only), then buys, then sells, then autopilot-generated trade proposals that flow through the same dry-run, confirm, and signed-receipt loop.
- **Deeper agent-to-agent coordination** over AgenC: agents discovering, hiring, paying, and rating each other, with provenance as the trust substrate.
- **More senses and surfaces** as MCP standardizes them.

The thesis hasn't changed since the first server: agents should do things. See, pay, trade, prove, and stay inside the lines their owner drew. Thirty-one servers in, that's a platform you can build on today.

Browse them all in the MCP registry (`io.github.nirholas`). Build agents that do more than chat. **$THREE.**
