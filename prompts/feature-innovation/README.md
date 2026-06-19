# Feature Innovation Briefs

This directory holds **one self-contained task brief per three.ws feature**. Each brief is designed to be handed to a single agent chat with a mandate: take that feature from "works" to **genuinely gamechanging** — invented, not copied — while obeying every hard rule in `CLAUDE.md` (real APIs, no mocks, 100% wiring, $THREE only).

## How to use

1. Pick a brief file (`NN_*.md`). Open a fresh agent chat.
2. Give the agent that file as its task (e.g. "Execute `prompts/feature-innovation/05_forge-text-to-3d.md` in full.").
3. The agent reads the brief + the referenced source, builds the world-class version, runs the self-improvement loop, and on completion **deletes its own brief file**.
4. Run as many chats in parallel as you like — every brief stages explicit paths only and re-checks `git status` before committing, so they coexist on `main`.

A brief disappearing from this directory means that feature's innovation pass is **done**.

## Conventions

- `_TEMPLATE.md` — the shared structure every brief follows. Not a task; do not delete.
- `NN_<slug>.md` — a feature task. `NN` is `<cluster><index>`; clusters mirror `docs/ux-flows/`.
- Each brief references its UX atlas section in `docs/ux-flows/` for verified current-state ground truth.

## Index

The full feature inventory and current UX (step-by-step, traced from source) lives in `docs/ux-flows/`. Each brief below maps to one or more routes documented there.

_(Index of generated briefs is appended below.)_
