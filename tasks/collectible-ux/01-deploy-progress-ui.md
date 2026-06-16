# Task: Cinematic Deploy Progress UI

## Goal
The on-chain deployment of a 3D AI Agent is a meaningful moment — it needs to feel like one. Right now `DeployButton._renderProgress` shows tiny monochrome text steps with arrow separators. This task replaces it with a dramatic, animated step-by-step UI that makes the recording worth watching.

## What to build

### Replace `_renderProgress` in `src/erc8004/deploy-button.js`

The existing method signature stays the same:
```js
_renderProgress(steps, activeIdx, extra)
```

New visual design for the progress container:
- Each step is a vertical card/tile, not an inline chip
- Done steps: filled accent color, checkmark icon, full opacity
- Active step: pulsing glow ring around it, animated spinner inside, full opacity
- Pending steps: dim, no icon
- Between each step: a vertical animated "flowing" line (CSS animation, not a static arrow)
- The active step label renders large below the tiles as status text
- Monospace detail text (`extra.text`) renders underneath in a dim terminal style

CSS goes inline in the method (no external file needed for this task) using a `<style>` tag injected once.

### After successful Solana deploy, redirect instead of showing the chip

In `_startSolanaDeploy`, after calling `_renderSuccessChip`, immediately redirect:

```js
// After this._renderSuccessChip(...) call:
const agentId = this._agent.id;
const txSig = result.txSignature;
const assetPubkey = result.assetPubkey;
const chain = this._chainId; // 'solana-mainnet' or 'solana-devnet'

setTimeout(() => {
  window.location.href = `/mint-success.html?id=${encodeURIComponent(agentId)}&tx=${encodeURIComponent(txSig)}&asset=${encodeURIComponent(assetPubkey || '')}&chain=${encodeURIComponent(chain)}`;
}, 800); // brief pause so user sees the success chip flash
```

Do the same for EVM deploys in `_startDeploy` — find the section that calls `_renderSuccessChip` and add the same redirect using `chainId` and `txHash` from the registry receipt.

### Cancel button on the vanity grind step

The grind can take minutes. The existing cancel button works but is visually hidden in the dense UI. In the new layout, render it as a proper ghost button below the active step tile, clearly labeled "Stop grinding".

## Files to edit
- `src/erc8004/deploy-button.js` — `_renderProgress` method + `_startSolanaDeploy` + `_startDeploy` redirect logic

## Files NOT to touch
- `src/agent-detail.js` — separate task
- Any CSS files — inline the new styles

## Definition of done
- Deployment progress looks dramatic and cinematic: animated, glowing active step, flowing connector lines
- After successful deploy (Solana and EVM), browser redirects to `/mint-success.html` with tx params in the URL
- Cancel on vanity grind is clearly visible
- No console errors
