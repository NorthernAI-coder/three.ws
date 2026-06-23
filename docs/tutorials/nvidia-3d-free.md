# Generate 3D Models Free, Powered by NVIDIA

Every free text-to-3D generation in the Forge runs on **NVIDIA NIM** with **Microsoft TRELLIS** — a GPU model that turns a description into real, textured geometry. No API key, no credits, no cost to you. This tutorial shows what the free lane is, when it kicks in, how to get the best out of it, and how to watch TRELLIS rebuild a mesh live.

**What you'll make:** a 3D model generated for free on the NVIDIA NIM lane, downloaded as a GLB.

**Prerequisites:** none. No account, no wallet, no code. Just a browser.

---

## What the free NVIDIA lane is

When you type a prompt into the Forge, the default path is:

1. Your words become a **reference image**.
2. That image is reconstructed into a textured 3D mesh by **TRELLIS**, served on **NVIDIA NIM** (NVIDIA's inference microservice for hosted models).
3. The mesh is packaged as a **GLB** — the standard 3D file the whole web understands.

NVIDIA NIM keeps the GPU warm, so there's no slow cold start, and the lane costs the platform nothing per call — which is why it's the free default at the **Draft** and **Standard** tiers. You don't select it; it's simply what runs when you generate without bringing your own engine key.

---

## Step 1 — Open the Forge

Go to [three.ws/forge](/forge). You'll land on the **Describe it** tab — text-to-3D mode.

Leave the **Engine** selector on its default. That's the free NVIDIA NIM lane. (Bringing your own geometry engine key is optional and covered in [Turn a Text Prompt into a 3D Model](/tutorials/text-to-3d) — skip it here.)

---

## Step 2 — Describe one object

Type a single subject and name its material:

```
a glazed ceramic teapot
```

Keep prompts short. TRELLIS reads roughly the first **77 characters**, so a tight description beats a paragraph. Three rules:

1. **One object per prompt.** "a teapot" works; "a teapot on a table by a window" confuses it.
2. **Name the material.** "brushed metal", "worn leather", "glazed ceramic".
3. **No scenery.** You're describing a thing, not a photo — drop backgrounds and lighting moods.

Want a cookbook? See [Prompt Recipes for 3D Generation](/tutorials/prompts-for-3d).

---

## Step 3 — Pick a tier (both free lanes)

| Tier | What you get | Speed |
|------|-------------|-------|
| **Draft** | Fast, low-poly (~12k triangles) | ~15 s — generate five, keep the best shape |
| **Standard** | Balanced detail (~30k triangles) | ~1 min — the everyday default |

Both Draft and Standard route to the free NVIDIA NIM lane for text prompts. Higher tiers and photo input use other engines — see [What's next](#whats-next).

The tier maps to TRELLIS **sampling steps**: more steps, more refinement, more time. Draft runs lean; Standard spends a little longer for cleaner geometry.

---

## Step 4 — Generate and inspect

Click **Generate**. The Forge narrates each step — *painting reference image → reconstructing textured mesh → finalizing GLB* — and the preview image appears early, so you'll know within seconds whether it's on track.

When it finishes, the model loads in a live viewer:

- **Drag** to rotate, **scroll** to zoom.
- Press **F** for a fullscreen turntable; **Esc** to exit.
- Check the **back and underside** — that's where reconstruction flaws hide.

Then rate it **👍 Keep** or **👎 Discard**. Your verdicts feed the engine picker, so honest ratings make your future generations better.

---

## Step 5 — Watch TRELLIS run live (the NIM demo)

To see the NVIDIA NIM contract end to end — no UI in the way — open the live demo at [three.ws/forge-nim](/forge-nim).

It talks **directly** to a TRELLIS NIM and returns the GLB **synchronously** in a single call. Type a prompt or drop a photo, and you'll watch the raw model come back as bytes and render in the browser. It's the clearest way to understand what "powered by NVIDIA NIM" actually means — the same TRELLIS reconstruction the Forge uses, with the wire contract visible.

> The hosted NVIDIA preview only generates from **text prompts**. To reconstruct from your own **photos** on a NIM, you need a self-hosted TRELLIS NIM — that's the next tutorial.

---

## Step 6 — Download or share

- **Download GLB** — opens in Blender, three.js, Unity, Unreal, Windows 3D Viewer, and macOS Quick Look.
- **Share** — a link with a proper preview card.
- Every generation is also saved to **Your creations** at the bottom of the page, tied to your browser.

---

## Didn't get what you wanted?

| What went wrong | What to change |
|-----------------|----------------|
| Right object, wrong style | Add a style word: "low-poly", "realistic", "stylized" |
| Surface looks flat | Name the material, or run the **High** tier for PBR textures |
| Extra junk attached | Your prompt described a scene — cut it to just the object |
| "Generation limit reached" | The free lane is rate-limited per visitor. Wait a minute |

---

## What's next

- **Generate from your photos** → [Turn Photos into a 3D Model](/tutorials/image-to-3d).
- **Run TRELLIS on your own GPU** → [Run Microsoft TRELLIS on your own NVIDIA NIM](/tutorials/nvidia-nim-self-host) — self-host the NIM and reconstruct from photos too.
- **Generate from code** → [Generate 3D Models from Code](/tutorials/generate-3d-api) — the same engine as a plain HTTP API.
- **Use it as an agent body** → [Build your first agent](/tutorials/first-agent).
