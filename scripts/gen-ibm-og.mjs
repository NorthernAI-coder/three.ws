#!/usr/bin/env node
// Generate the social share card for the three.ws × IBM partnership post.
//
// Produces public/ibm-og.png (1200×630) — the og:image / twitter:image for
// /blog/three-ws-ibm-collaboration. Mirrors the in-repo OG card convention
// (api/walk-og.js): a self-contained SVG on the post's dark gradient, with the
// three.ws accent, rasterized to a real PNG via sharp so every crawler (X,
// Slack, Discord, LinkedIn) caches a guaranteed-supported image.
//
// Text-only branding: "IBM" and the public IBM quote are named factually; no
// third-party logo asset is embedded.
//
// Usage: node scripts/gen-ibm-og.mjs

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'public/ibm-og.png');

// Single-quote multi-word family names — these are interpolated into
// double-quoted SVG attributes, so embedded double quotes would break parsing.
const FONT = "Inter, -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, monospace";

// 1200×630 OG card. Colours match blog/three-ws-ibm-collaboration.html:
// bg #060611, text #e7e7f5, accent #9ad4ff, muted #7a85a8 / #c8c8e0.
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"
     role="img" aria-label="three.ws times IBM — showcasing the partnership">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#070713"/>
      <stop offset="100%" stop-color="#05050d"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.18" cy="0.0" r="0.9">
      <stop offset="0%" stop-color="rgba(154,212,255,0.16)"/>
      <stop offset="55%" stop-color="rgba(154,212,255,0.0)"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- subtle grid lines -->
  <line x1="0" y1="158" x2="1200" y2="158" stroke="rgba(154,212,255,0.06)" stroke-width="1"/>
  <line x1="0" y1="472" x2="1200" y2="472" stroke="rgba(154,212,255,0.06)" stroke-width="1"/>

  <!-- top row: wordmark + tag -->
  <text x="80" y="92" fill="#e7e7f5" font-family="${FONT}" font-size="30" font-weight="700"
        letter-spacing="-0.5">three.ws</text>
  <rect x="262" y="68" width="124" height="32" rx="16" fill="rgba(154,212,255,0.10)"/>
  <text x="324" y="90" fill="#9ad4ff" font-family="${FONT}" font-size="15" font-weight="600"
        letter-spacing="1.5" text-anchor="middle">PARTNERSHIP</text>

  <!-- accent bar -->
  <rect x="80" y="214" width="5" height="150" rx="2.5" fill="#9ad4ff"/>

  <!-- headline -->
  <text x="112" y="278" fill="#e7e7f5" font-family="${FONT}" font-size="92" font-weight="700"
        letter-spacing="-2">three.ws <tspan fill="#9ad4ff">&#215; IBM</tspan></text>

  <!-- subhead -->
  <text x="112" y="338" fill="#c8c8e0" font-family="${FONT}" font-size="34" font-weight="500"
        letter-spacing="-0.4">Showcasing the partnership</text>

  <!-- body line -->
  <text x="112" y="392" fill="#7a85a8" font-family="${FONT}" font-size="25" font-weight="400">
    A persistent, on-chain 3D agent — embedded like a YouTube video,</text>
  <text x="112" y="426" fill="#7a85a8" font-family="${FONT}" font-size="25" font-weight="400">
    thinking on IBM watsonx.ai and Granite.</text>

  <!-- IBM quote -->
  <text x="80" y="556" fill="#9ad4ff" font-family="${MONO}" font-size="23" font-weight="400">
    “We’re super excited about this.”<tspan fill="#5a6486" font-size="20"> — @IBM</tspan></text>

  <!-- url -->
  <text x="1120" y="556" fill="rgba(231,231,245,0.45)" font-family="${FONT}" font-size="20"
        font-weight="500" letter-spacing="1" text-anchor="end">three.ws/blog</text>
</svg>`;

// Rasterize at 2× density for crisp text, then downscale to the exact
// 1200×630 OG dimensions declared in the post's meta.
await sharp(Buffer.from(svg), { density: 192 })
	.resize(1200, 630)
	.png({ compressionLevel: 9 })
	.toFile(OUT);

const meta = await sharp(OUT).metadata();
console.log(`Wrote ${OUT} (${meta.width}x${meta.height} ${meta.format})`);
