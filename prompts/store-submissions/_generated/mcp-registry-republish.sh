#!/usr/bin/env bash
# Republish stale/new three.ws MCP servers to the official MCP registry.
# GENERATED 2026-07-08 by build-registry-republish.mjs — regenerate after any manifest bump.
# DO NOT run unattended. A human must be logged in and review each publish.
# 30 servers need a republish; 12 are already current.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# 1. Authenticate once (device flow / browser):
#   mcp-publisher login github

# 2. Publish each manifest whose local version is newer than (or absent from) the registry:

# io.github.nirholas/x402-bridge: registry 1.0.0 -> local 1.0.1   [STALE]
mcp-publisher publish "mcp-bridge/server.json"

# io.github.nirholas/3d-agent-mcp: registry 1.2.0 -> local 1.2.1   [STALE]
mcp-publisher publish "mcp-server/server.json"

# io.github.nirholas/activity-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/activity-mcp/server.json"

# io.github.nirholas/agenc-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/agenc-mcp/server.json"

# io.github.nirholas/agent-sniper: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/agent-sniper/server.json"

# io.github.nirholas/agentcore-payments-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/agentcore-payments-mcp/server.json"

# io.github.nirholas/agora-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/agora-mcp/server.json"

# io.github.nirholas/alerts-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/alerts-mcp/server.json"

# io.github.nirholas/alibaba-cloud: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/alibaba-cloud-mcp/server.json"

# io.github.nirholas/audio-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/audio-mcp/server.json"

# io.github.nirholas/3D-AI-Agent-Avatar: registry 1.2.0 -> local 1.2.1   [STALE]
mcp-publisher publish "packages/avatar-agent-mcp/server.json"

# io.github.nirholas/billing-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/billing-mcp/server.json"

# io.github.nirholas/brain-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/brain-mcp/server.json"

# io.github.nirholas/clash-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/clash-mcp/server.json"

# io.github.nirholas/copy-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/copy-mcp/server.json"

# io.github.nirholas/ibm-x402-mcp: registry 1.1.0 -> local 1.1.1   [STALE]
mcp-publisher publish "packages/ibm-x402-mcp/server.json"

# io.github.nirholas/intel-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/intel-mcp/server.json"

# io.github.nirholas/loom-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/loom-mcp/server.json"

# io.github.nirholas/marketplace-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/marketplace-mcp/server.json"

# io.github.nirholas/naming-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/naming-mcp/server.json"

# io.github.nirholas/notifications-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/notifications-mcp/server.json"

# io.github.nirholas/provenance-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/provenance-mcp/server.json"

# io.github.nirholas/pumpfun-solana-mcp: registry 0.2.1 -> local 0.2.2   [STALE]
mcp-publisher publish "packages/pumpfun-mcp/server.json"

# io.github.nirholas/scene-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/scene-mcp/server.json"

# io.github.nirholas/signals-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/signals-mcp/server.json"

# io.github.nirholas/three-token-mcp: registry 1.1.0 -> local 1.1.1   [STALE]
mcp-publisher publish "packages/three-token-mcp/server.json"

# io.github.nirholas/vanity-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/vanity-mcp/server.json"

# io.github.nirholas/vision-mcp: registry 0.1.0 -> local 0.1.1   [STALE]
mcp-publisher publish "packages/vision-mcp/server.json"

# io.github.nirholas/x402-mcp: registry 0.1.0 -> local 0.2.1   [STALE]
mcp-publisher publish "packages/x402-mcp/server.json"

# io.github.nirholas/threews-3d-studio-free: registry — -> local 1.0.1   [NEW]
mcp-publisher publish "server-studio.json"

# 3. Verify all versions match the manifests:
# curl -s 'https://registry.modelcontextprotocol.io/v0/servers?search=io.github.nirholas&limit=100' \
#   | jq -r '.servers[].server | .name + " " + .version'
