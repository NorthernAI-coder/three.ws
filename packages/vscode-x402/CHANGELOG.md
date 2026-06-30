# Changelog

## 0.1.0

Initial release.

- Bazaar sidebar with live discovery, filters, and full-text search against any
  configurable bazaar discovery API (`x402.bazaarUrl`). Empty by default;
  discovery is optional.
- Inspect command: decode any endpoint's 402 payment challenge — no bazaar or
  account required.
- Pay & call any paid x402 endpoint with USDC, with a spending cap, pre-payment
  confirmation, and inline settlement receipts. No bazaar or account required.
- Secure EVM wallet key storage in VS Code SecretStorage; wallet status bar.
- Scaffold a self-contained paid endpoint using the standard `x402-express`
  paywall middleware.
