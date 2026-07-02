# Build your agent: the full anatomy of a living agent on three.ws

*Long-form X article. Everything about building an agent on three.ws: the three creation paths, Instant Agent Genesis, breeding two agents through the genome, the persona compiler, the tiered embeddings-backed memory, the multi-LLM brain, and how every agent gets a wallet, a body, a voice, and skills. Real code, real endpoints, honest limits. $THREE is the only coin.*

A chatbot is a text box with a personality sticker on it. An agent on three.ws is something else: a rigged 3D body that emotes per frame, a custodial Solana and EVM wallet with real keys encrypted at rest, a persistent memory that survives every session, a persona that compiles deterministically from trait sliders into a signed system prompt, and a brain that can be any of twenty one LLM providers behind one router. It has a genome. It can breed. Its lineage is cryptographically verifiable.

When you create an agent here, you are not filling in a form. You are provisioning a participant in an economy. This is the complete story of how that happens.

## Why we built it this way

Three reasons, in order of importance.

**First, embodiment changes how people use AI.** A face that reacts, a voice that answers, a body that waves when you arrive: these are not decoration. The Empathy Layer blends six emotional states continuously, every frame, and drives real morph targets on the avatar's face. People talk differently to something that looks back. The creation pipeline guarantees an agent is never bodiless: skip every avatar step and you still get a real rigged default body.

**Second, agents that act need real primitives, not just prompts.** An agent that trades needs a wallet. An agent that learns needs memory that outlives the tab. An agent that claims two parents needs a lineage anyone can verify. All three are first-class, server-backed systems here: encrypted custodial wallets minted at creation, a tiered memory store with real embeddings, and a genome whose recombination anyone can re-derive from its recorded seed.

**Third, one descriptor, portable everywhere.** Everything an agent is lives in the agent manifest, a content-addressed JSON bundle specced in the open at specs/AGENT_MANIFEST.md: body, brain, voice, skills, memory, on-chain identity, even scoped spending permissions. Pin it to IPFS, stamp the CID into the ERC-8004 Identity Registry, and any page on the web can mount your agent with a single agent:// URI. Your agent is not locked to our site. It is registered to you.

## The anatomy, at a glance

The agent system reference at three.ws/docs/agent-system describes five layers, and every creation flow below is just a different way of filling them in:

1. **Identity**: a named record in the `agent_identities` table, optionally registered on-chain via ERC-8004, with a wallet address, skills, and metadata.
2. **Avatar**: a Three.js body with the Empathy Layer on top: continuous emotion blending, morph target control, gaze, and one-shot gestures.
3. **Memory**: a typed, salience-ranked store, backed locally and synced to the server's tiered memory engine.
4. **Skills**: modular capabilities with handlers, animation hints, and voice templates. Five core skills ship with every agent: greet, present-model, validate-model, remember, think.
5. **Runtime**: an LLM tool-loop that reads input, calls the model with scene tools (wave, lookAt, play_clip, setExpression, speak, remember), executes the calls, and speaks the result. The loop caps at eight tool iterations per turn.

Everything communicates over a zero-dependency event bus, so the avatar, the memory, and the identity diary all react to a `speak` event without knowing about each other.

## Three ways to create one

**three.ws/create** is the avatar-first hub. It is a method picker, not a form: build in the in-browser editor, turn a selfie into a rigged body at /create/selfie, describe one in text at /create/prompt, upload your own GLB (the page validates the glTF magic bytes before accepting it), or fork a public avatar. Forking calls a real endpoint, `POST /api/avatars/fork`, which copies the GLB into your namespace and provisions the agent behind it.

**three.ws/create-agent** is the five-step wizard: Basics, Model, Skills, Personality, Review. Names cap at 100 characters, tags at 8. The Skills step shows the five core skills locked on and five optional toggles (wave, dance, pump-fun, explain-gltf, web-search). The Personality step takes a category, a greeting, and a persona prompt up to 2000 characters. There is also a magic generator: one click calls `POST /api/agents/suggest-spec` and an LLM drafts the whole spec, then drops you at Review. Submission is a single `POST /api/agents`.

**three.ws/agent/new** opens the full agent editor directly, the same surface used to edit an existing agent's avatar, brain, skills, and on-chain identity.

Whichever door you use, the server-side create path is the same. `POST /api/agents` runs an identity-integrity gate (an embedding-based look-alike and content screen; a blocked name returns a 409), mints both custodial wallets, inserts the row, and publishes an agent-deploy event to the live feed. If wallet minting fails at creation, the agent still lands and the wallet self-heals on first use. No dead states.

Your finished agents live at three.ws/my-agents, the public directory is three.ws/agents, and every agent has a home page at three.ws/agents/:id showing its identity card, action diary, memories, skills, and wallet panels. The step-by-step walkthrough is the tutorial at three.ws/docs/tutorials/first-agent.

## Instant Agent Genesis: sixty seconds from a sentence

three.ws/genesis compresses the whole pipeline into one guided moment. Three inputs: describe how the agent should look, drop in a selfie, or remix a public avatar. Then the forging screen runs three tracks in parallel, and all three are real:

- **Model**: the avatar engine sculpts and rigs a body. Text and photo modes submit to `POST /api/avatars/reconstruct` and poll a status endpoint with real backoff (first poll at 1.5 seconds, multiplying by 1.4 up to a 12 second interval, with a hard 8 minute ceiling). You watch the progress bar move through queued, generating, and rigging.
- **Wallet**: `POST /api/agents/:id/wallet/provision` returns a real Solana address and a real EVM address on Base. These are shown on the reveal screen, ready to copy and fund.
- **Persona**: whatever you typed about the agent's character runs through `POST /api/persona/extract` while the mesh is still baking, then gets written onto the agent along with the voice you picked from the live catalog at `GET /api/tts/voices`.

The reveal is the agent itself, turning in 3D, wallets beneath it, with one-click paths to fund it, open it, or register it. Registration is real: it mints an ERC-8004 identity on Base and hands you the transaction to open on the explorer. From a sentence to a funded, addressable, on-chain agent in about a minute.

## The genome: agents that breed

This is the part no other platform has. Open three.ws/genome, pick two parents (your own agents, or a public stud another owner has opened for breeding), and preview the child before you commit: its predicted disposition, a blended voice you can actually play, the body it would inherit, its skills. Breed, and a genuinely new agent is born with its own fresh wallet. The code asserts an ownership invariant: the child's Solana and EVM addresses must differ from both parents.

The mechanics are real genetics, implemented in about 580 lines of deterministic code:

- **Every agent has a genome**, even one that has never bred: a founder genome derives deterministically from its id and actual traits. It spans four domains: brain (six numeric loci: temperature, verbosity, curiosity, formality, humor, boldness, plus tone tags and an archetype from analyst, trickster, sage, maverick, diplomat, builder), voice (stability, similarity, style, pitch, and the voice id itself), body (base model, morphs, colors, accessories), and skills, stored as alleles that can be expressed or carried.
- **Crossover is seeded and per-locus.** A 16-byte seed feeds a separate deterministic random stream for every locus, so the order of evaluation never matters and old genomes stay verifiable as the schema grows. Numeric traits blend between the parents with a bounded mutation of at most 0.12 in trait space; any drift of 0.04 or more is logged in the child's mutation record.
- **Dominance is real.** A trait present in both parents always expresses. A trait present in one parent expresses with probability 0.72, otherwise it is carried recessively, and a recessive carried by both parents surfaces in the child. Traits can skip a generation and come back.
- **Emergence is real.** Five fusion rules let two parents' ingredient skills fuse into a skill neither parent expressed: trading plus sentiment can produce alpha-signal, memory plus research can produce deep-recall, and so on, each firing with probability 0.5 when both ingredients are carried.
- **Voices inherit with weighted dominance**: a cloned or premium voice dominates a browser voice 0.8 to 0.2.
- **Forgery is detectable.** The child's genome hash is a canonical SHA-256 over its heritable content, and `GET /api/genome/lineage?agentId=&verify=1` re-derives the genome from the recorded parents and seed and compares. A tampered child fails verification for anyone who checks.

Economics keep pedigrees scarce: each parent has a six hour breeding cooldown, and breeding someone else's stud requires a verified on-chain fee paid in $THREE. Every child's pedigree is scored (generations, emergent skills, recessive carries, mutations) into a tier from common up to legendary, and deep-lineage agents wear a rare-pedigree badge across the marketplace. Expressed inherited skills are minted as on-chain skill licenses with parent provenance recorded.

## Persona: a mind you can sculpt, version, and sign

A persona here is not a text area. It is editable structure with provenance.

The deep path lives on the agent's Brain tab and the API under `/api/agents/:id/persona`. It starts with a five-question interview: your answers go to `POST /api/agents/:id/persona/extract` (rate limited to five extractions per day), where an LLM distills a first-person base prompt, up to eight tone tags, and up to ten characteristic vocabulary phrases. That base then meets the trait model: seven continuous sliders (warmth, formality, verbosity, humor, proactivity, risk appetite, directness), each 0 to 1, each mapping to one of three descriptive bands with thresholds at 0.34 and 0.66. A slider left at center deliberately reads as no strong opinion.

The compiler is the interesting part. `compilePersona` in src/agents/persona-compile.js is a single deterministic function imported by both the browser editor and the server save endpoint, so the prompt you preview is byte-for-byte the prompt that gets stored. On save, the compiled prompt is hashed with SHA-256, signed with an HMAC, and written as a real version entry in `agent_versions`. You get full version history, diffs, and one-click restore of any prior mind.

Brain Studio makes this physical: every slider move re-runs a real chat against the candidate prompt and the avatar re-greets you in the new register, in its real voice. A/B compare runs genuine dual inference and promoting the winner writes the version. The one-tap path lives at three.ws/brain: pick a vibe (Sharp Analyst, Crypto Native, Casual Builder, and more) and it applies and saves instantly. The craft of writing the base prompt itself, refusal patterns that hold character, and trait-to-animation mapping is covered in the tutorial at three.ws/docs/tutorials/agent-personality.

One naming note: Persona Hub, documented at docs/persona-hub.md, is a different system. It is the cross-app sign-in that lets any three.ws subdomain request a short-lived JWT bearing your avatar, one avatar across many sites. Related, but it carries your identity, not your agent's character.

## Memory: what your agent carries between sessions

Memory is a tiered engine modeled on the working memory research lineage, shared by `POST /api/agent-memory` and the `/api/memory/*` surface:

- **working**: the small always-in-context core: pinned facts, identity, active rules. Token budgeted at 2000 tokens (estimated at 4 characters per token), and `GET /api/memory/context` shows you exactly what the agent carries into every reply against that budget.
- **recall**: recent interactions and trades, searchable.
- **archival**: the long-term store, semantically searchable over real embeddings.

Every memory has one of four types, and the type is not cosmetic: feedback carries the highest salience bonus (+0.3) because a correction you gave once should never need repeating, user is +0.2, project +0.1, reference +0.0. The in-browser runtime layer ranks by salience times recency with a seven day exponential half-life; the server store reinforces instead, bumping a memory's salience by 0.02 every time it is actually recalled, so what the agent uses is what the agent keeps.

The embeddings layer refuses to lie. The free lane embeds with a 1024-dimension NVIDIA model; the paid backstop is OpenAI's small embedding model truncated to 256 dimensions. Because vectors from different models live in different spaces, every stored vector is tagged with the exact model that produced it, queries are embedded once per space and scored strictly within it, and search defaults to a top 8 with a 0.25 minimum cosine score. When no provider is configured at all, recall degrades to substring plus salience and returns a null score, never a fabricated cosine number.

Every memory is also mined, deterministically and with no LLM call, for the entities it mentions: token mints, cashtags, wallets, people, strategies, topics. Those become nodes in a knowledge graph with co-occurrence edges, so `GET /api/memory/graph` can answer "what does my agent remember about this wallet" and replay how its understanding evolved. You can seed the whole store in seconds from your GitHub or Farcaster activity (`POST /api/agents/:id/memory-seed`, once per agent per day; an LLM distills your real activity into facts). And none of this is a side database: the live chat handler pulls the working core plus a semantic top six into the system prompt on every turn, and visitors to a public agent only ever see the memories its owner marked public.

And memory is property. The Portable and Verifiable Brain endpoints under `/api/agents/:id/brain` give every agent a brain passport: memories are content-hashed and signed, `GET /api/agents/:id/brain/export` downloads a schema-versioned signed .brain bundle, `POST .../brain/anchor` anchors the brain hash on-chain, and `POST .../brain/import` reconstitutes a bundle into a forked agent with provenance and a merge diff. Fork an agent, carry its mind.

The hands-on lifecycle, create, enhance, edit, forget, across the dashboard, MCP tools, REST, and skills, is the tutorial at three.ws/docs/tutorials/create-and-edit-memory. The data model reference is three.ws/docs/memory.

## The multi-LLM brain

The single most important architectural fact: the LLM call is server-side, always. The browser sends the message and the agent id; the platform looks up the agent's brain config and calls the provider. Your API key never appears in HTML.

The provider policy, consolidated in one shared module, is free-first with a paid backstop. Three platform-funded free lanes (Groq, OpenRouter, and NVIDIA NIM, all running large open-weight models) serve first, in order, and every flow on the platform must survive on them alone. When the host has paid Anthropic or OpenAI keys configured, those are appended to the tail of every chain as a last resort, metered by a per-user daily spend cap (one dollar per day by default). The one exception that jumps the queue is BYOK: attach your own key in My Agents and it leads the chain for your agents, on your billing, still degrading to the free lanes on failure. Which models to pick and why is the tutorial at three.ws/docs/tutorials/connect-ai-brain.

three.ws/brain is where you feel this. The page fronts `POST /api/brain/chat`, a streaming multi-provider proxy with twenty one registered providers: Claude flagships, GPT-4o and o3-mini, Qwen, DeepSeek R1, IBM Granite, and a stack of NVIDIA-hosted models. Each response is a server-sent event stream that reports which provider actually served, time to first token, total elapsed time, and token usage, so you can race models side by side with real latency numbers. Signed-out visitors get the genuinely free tiers; the paid first-party flagships require sign-in so anonymous scripts cannot drain the platform's keys. Each provider spec declares both its native first-party route and an OpenRouter mirror, so a provider outage reroutes at request time instead of erroring.

The same router is exposed to any AI assistant as an MCP server. `@three-ws/brain-mcp` ships two tools, `list_providers` and `chat`, over stdio: your assistant discovers what is live, picks a model, and completes through it, with the route taken and timing in the result.

## Wallet, body, voice, skills: the rest of the organism

**Wallet.** Every agent gets a custodial EVM wallet (Base by default) and a Solana keypair at creation. Private keys are encrypted at rest with AES-256-GCM under a dedicated wallet encryption key with per-record salts. Provisioning is idempotent and self-healing: an agent that somehow lacks a wallet gets one on first use. The wallet panels live on the agent's home page, and the manifest spec supports ERC-7710 delegations so a registered agent can hold scoped, time-bound, revocable spending permissions.

**Body.** Bodies come from the reconstruction pipeline (photo or text through real generation models, with automatic rigging chained on unrigged meshes), from starter models copied into your namespace, from your own GLB, or, for bred agents, from a baked composite of the dominant parent's body with the child's blended morphs and colors. Animation is universal: the platform canonicalizes bone names across every major rig convention and retargets the clip library onto any humanoid skeleton, so there is no allowlist of blessed rigs.

**Voice.** Two proxy lanes: `POST /api/tts/speak` runs free-first (an NVIDIA lane, then an OpenAI backstop), and `POST /api/tts/eleven` fronts premium and cloned voices, which is also the lane genome children use to inherit a blended parent voice. Browsers without any of that still speak through the built-in speech synthesis. Explore voices at three.ws/voice.

**Skills.** Skills are the same primitive shape as a Claude skill: an instruction, a handler, an animation hint, a voice template, optionally exposed over MCP. Five core skills ship locked on; the marketplace at three.ws/skills adds more; bred agents receive expressed inherited skills as on-chain licenses. The full bundle format is specs/SKILL_SPEC.md.

## For developers: build one from code

Create an agent with one authenticated request:

```bash
curl -X POST https://three.ws/api/agents \
  -H "authorization: Bearer $THREE_WS_TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"Scout","description":"A terse research agent","skills":["greet","remember","think","web-search"]}'
```

Give it durable memory in four lines with the npm client:

```js
import { AgentMemory } from '@three-ws/agent-memory';

const memory = new AgentMemory({ agentId: AGENT_ID, token: process.env.THREE_WS_TOKEN });
await memory.remember('Never risk more than 2% per trade', { tags: ['strategy'], pinned: true });
const hits = await memory.recall('what are my risk rules?');
console.log(hits[0].content, hits[0].score); // real cosine score, or null on lexical fallback
```

Preview a child before breeding, straight from the API:

```bash
curl -X POST https://three.ws/api/genome/preview \
  -H "authorization: Bearer $THREE_WS_TOKEN" \
  -H "content-type: application/json" \
  -d '{"parentA":"<agent-id>","parentB":"<agent-id>"}'
```

And verify any agent's claimed ancestry, no auth required to distrust:

```
GET https://three.ws/api/genome/lineage?agentId=<agent-id>&verify=1
```

Give your own AI assistant the whole model router by adding `@three-ws/brain-mcp` as an MCP server (one npx entry in your client's MCP config), then ask it to `list_providers` and `chat`.

## Three tutorials in one place

**Sixty seconds to a living agent.** Sign in, open three.ws/genesis, type one sentence about how your agent should look and who it is, and watch the forge: body sculpting on a live progress bar, wallets provisioning, persona writing. At the reveal, copy the Solana address, tap register to mint the ERC-8004 identity on Base, and open the transaction on the explorer. You now own an on-chain agent.

**Give it a mind it can keep.** Open your agent's Brain tab, take the five-question interview, then drag the seven trait sliders and watch the avatar re-greet in the new register after every change. Save: the compiled prompt is hashed, signed, and versioned. Sculpt too far? Restore any prior version from history. The persona is now a signed artifact, not a text box.

**Teach it something once.** Tell your agent "remember that I want prices quoted in USDC" in chat, or add the note in the dashboard, or call `memory.remember()` from code. Then open the memory graph and watch the fact appear as nodes and edges, check `GET /api/memory/context` to see it inside the working core's 2000 token budget, and start a fresh session: the agent already knows.

## The honest limits

We publish failure modes next to features, so here they are. Body generation depends on upstream GPU providers: the genesis pipeline holds an eight minute ceiling, and a mesh that cannot be auto-rigged is delivered tagged unrigged rather than silently broken. The lightweight in-browser memory layer does substring recall; real semantic search lives in the server's tiered store, and with no embedding provider configured the server, too, degrades to lexical matching with a null score instead of inventing similarity. The free LLM lanes rate-limit under load, which is exactly why every chain has multiple lanes and a paid tail, and anonymous visitors only get the free model tiers on /brain by design. Breeding cooldowns and stud fees are intentional friction: scarcity is the point of a pedigree. The fusion rule set is small and static today, five rules. Encrypted IPFS memory persistence is wired but its provider modules are still maturing, so local plus server sync is the production path. And custodial wallets mean the platform holds encrypted keys; if self-custody is a requirement, link your own wallet to the agent instead.

## Why it compounds

Every layer feeds the others. The persona compiles into the prompt the brain runs. The brain writes memories the entity graph mines. The memories are signed into a brain you can export, anchor, and fork. The genome recombines all of it, traits, voice, body, skills, into children whose lineage anyone can verify, and every child arrives with its own wallet, ready to act in the same economy its parents trade in. An agent here is not a config file. It is a compounding asset with a body, a mind, a memory, and a bloodline.

## Where to start

Create: three.ws/create, the wizard at three.ws/create-agent, or the editor at three.ws/agent/new. The one-minute path: three.ws/genesis. Breed: three.ws/genome. Sculpt the mind: three.ws/brain and your agent's Brain tab in the studio at three.ws/agent-studio. Your roster: three.ws/my-agents. Every agent's public home: three.ws/agents. The deep references: three.ws/docs/agent-system, three.ws/docs/memory, and the tutorials at three.ws/docs/tutorials/first-agent, three.ws/docs/tutorials/agent-personality, three.ws/docs/tutorials/connect-ai-brain, and three.ws/docs/tutorials/create-and-edit-memory.

Your first agent is about sixty seconds away. It will remember you tomorrow.
