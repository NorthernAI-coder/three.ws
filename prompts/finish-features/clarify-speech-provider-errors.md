# Task: Clarify speech-provider error wording in `src/runtime/speech.js`

## Repo context

Working tree: `/workspaces/three.ws`. The speech runtime is in
`src/runtime/speech.js`. Around lines 500-513:

```js
export function createTTS(config = {}) {
  const provider = config.provider || 'browser';
  if (provider === 'none') return null;
  if (provider === 'browser') return new BrowserTTS(config);
  if (provider === 'elevenlabs') return new ElevenLabsTTS(config);
  throw new Error(`TTS provider "${provider}" not implemented yet`);
}

export function createSTT(config = {}) {
  const provider = config.provider || 'browser';
  if (provider === 'none') return null;
  if (provider === 'browser') return new BrowserSTT(config);
  throw new Error(`STT provider "${provider}" not implemented yet`);
}
```

The message `"not implemented yet"` is misleading. It triggers on **any
unknown provider name** — typos, copy-pasted configs from another
project, future provider names. The user thinks the system is
incomplete; in reality their config is wrong.

## Rails (CLAUDE.md — non-negotiable)

- No mocks, no fake data, no placeholders, no TODOs, no stubs.
- Real APIs only.
- Errors handled at boundaries only.
- Done = error messages are honest, `npm test` green.
- Push to both remotes only when the user says push.

## What to implement

### Step 1 — read the current file

```
src/runtime/speech.js
```

Confirm the supported providers for TTS and STT. As of today: TTS
supports `browser`, `elevenlabs`, `none`; STT supports `browser`,
`none`.

### Step 2 — rewrite the rejection branches

Replace the two trailing `throw new Error(...)` lines with:

```js
const supportedTTS = ['none', 'browser', 'elevenlabs'];
const supportedSTT = ['none', 'browser'];

// inside createTTS:
throw new Error(
  `Unknown TTS provider "${provider}". Supported: ${supportedTTS.join(', ')}.`
);

// inside createSTT:
throw new Error(
  `Unknown STT provider "${provider}". Supported: ${supportedSTT.join(', ')}.`
);
```

Two upgrades over the current wording:

1. "Unknown provider" is honest — these branches fire on typos.
2. The list of supported providers is shown, so the user can fix
   their config without grepping the source.

Keep the `supportedTTS` / `supportedSTT` arrays as module-scoped
constants near the top of the factory functions so they are the single
source of truth (currently they are encoded twice — once in the `if`
chain, once implicitly in the error). Refactor the `if` chain to
iterate the constant if it stays readable:

```js
const TTS_FACTORIES = {
  none: () => null,
  browser: (cfg) => new BrowserTTS(cfg),
  elevenlabs: (cfg) => new ElevenLabsTTS(cfg),
};

export function createTTS(config = {}) {
  const provider = config.provider || 'browser';
  const factory = TTS_FACTORIES[provider];
  if (!factory) {
    throw new Error(
      `Unknown TTS provider "${provider}". Supported: ${Object.keys(TTS_FACTORIES).join(', ')}.`
    );
  }
  return factory(config);
}
```

Apply the same shape to `createSTT`.

### Step 3 — add a test

Either extend an existing `tests/speech*.test.js` or create a small
one. Cases:

1. `createTTS({ provider: 'browser' })` returns a `BrowserTTS`
   instance.
2. `createTTS({ provider: 'elevenlabs' })` returns an
   `ElevenLabsTTS` instance.
3. `createTTS({ provider: 'none' })` returns `null`.
4. `createTTS({ provider: 'azure' })` throws an error whose message
   contains "Unknown TTS provider" and "browser, elevenlabs".
5. Symmetric for `createSTT`.

Do not stub `BrowserTTS` / `ElevenLabsTTS` — just assert
`instanceof`. They have constructors that should run in jsdom; if not,
read the file and adjust accordingly (the simpler way is to check
constructor name).

### Step 4 — run the suite

```bash
npm test
```

### Step 5 — verify in dev

```bash
npm run dev
```

If the user's app has a TTS / STT config UI, ensure it still works.
Specifically: change the provider to `browser` and confirm voice
synthesis still happens. Then deliberately set it to `azure` and
confirm the new error is shown to the user (if there is user-facing
error surfacing — otherwise check the console).

## Definition of done

- `src/runtime/speech.js` no longer says "not implemented yet" for
  unknown providers.
- Error messages now say "Unknown ... provider" and list supported
  values.
- The supported-provider list is encoded in a single place per
  factory.
- A test covers both the success and the unknown-provider branches.
- `npm test` is green.
- Manual smoke in dev confirms no regression.

## Constraints

- Do not add new providers in this task. Adding OpenAI TTS, PlayHT,
  Deepgram STT, etc. is out of scope — file a follow-up if you want
  to add them later.
- Do not change the public function signatures (`createTTS`,
  `createSTT`).
- Do not silently swallow unknown providers (returning `null`) — keep
  the throw so a misconfigured runtime fails loudly.
