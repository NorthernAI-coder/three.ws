# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: club.spec.js >> /club >> venue loads + tip settles + dancer performs
- Location: tests/e2e/club.spec.js:8:2

# Error details

```
Test timeout of 60000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - generic [ref=e4]:
      - link "three.ws" [ref=e5] [cursor=pointer]:
        - /url: /
      - generic [ref=e6]: /
      - generic [ref=e8]: Pole Club
    - generic [ref=e10]: tip in USDC · she dances
    - generic [ref=e11]: $0.001 / dance
    - generic [ref=e12]: x402 · Base & Solana
    - button "🔊 Audio on" [ref=e13] [cursor=pointer]
  - main [ref=e14]:
    - status: Dancer 1 → Rumba
  - complementary [ref=e16]:
    - generic [ref=e17]:
      - heading "How it works" [level=2] [ref=e18]
      - paragraph [ref=e19]: Four poles, four dancers backstage. Pick a pole, pick a style, hit Tip. Your wallet signs a $0.001 USDC x402 payment, the server settles it on-chain, the dancer walks out and performs her routine. No tip, no dance.
    - generic [ref=e20]:
      - heading "Poles" [level=2] [ref=e21]
      - generic [ref=e22]:
        - generic [ref=e23]:
          - generic [ref=e24]:
            - generic [ref=e25]: Pole 1
            - generic [ref=e26]:
              - generic [ref=e27]: $0.001 USDC
              - button "🎬" [ref=e28] [cursor=pointer]
          - generic [ref=e29]:
            - text: Style
            - combobox "Style" [ref=e30] [cursor=pointer]:
              - option "Rumba" [selected]
              - option "Silly"
              - option "Thriller"
              - option "Capoeira"
              - option "Hip Hop"
          - button "Tip 1 — make her dance" [active] [ref=e31] [cursor=pointer]
        - generic [ref=e32]:
          - generic [ref=e33]:
            - generic [ref=e34]: Pole 2
            - generic [ref=e35]:
              - generic [ref=e36]: $0.001 USDC
              - button "🎬" [ref=e37] [cursor=pointer]
          - generic [ref=e38]:
            - text: Style
            - combobox "Style" [ref=e39] [cursor=pointer]:
              - option "Rumba" [selected]
              - option "Silly"
              - option "Thriller"
              - option "Capoeira"
              - option "Hip Hop"
          - button "Tip 2 — make her dance" [ref=e40] [cursor=pointer]
        - generic [ref=e41]:
          - generic [ref=e42]:
            - generic [ref=e43]: Pole 3
            - generic [ref=e44]:
              - generic [ref=e45]: $0.001 USDC
              - button "🎬" [ref=e46] [cursor=pointer]
          - generic [ref=e47]:
            - text: Style
            - combobox "Style" [ref=e48] [cursor=pointer]:
              - option "Rumba" [selected]
              - option "Silly"
              - option "Thriller"
              - option "Capoeira"
              - option "Hip Hop"
          - button "Tip 3 — make her dance" [ref=e49] [cursor=pointer]
        - generic [ref=e50]:
          - generic [ref=e51]:
            - generic [ref=e52]: Pole 4
            - generic [ref=e53]:
              - generic [ref=e54]: $0.001 USDC
              - button "🎬" [ref=e55] [cursor=pointer]
          - generic [ref=e56]:
            - text: Style
            - combobox "Style" [ref=e57] [cursor=pointer]:
              - option "Rumba" [selected]
              - option "Silly"
              - option "Thriller"
              - option "Capoeira"
              - option "Hip Hop"
          - button "Tip 4 — make her dance" [ref=e58] [cursor=pointer]
      - generic [ref=e59] [cursor=pointer]:
        - checkbox "Auto-follow tips (VIP cam during dance)" [ref=e60]
        - generic [ref=e61]: Auto-follow tips (VIP cam during dance)
      - paragraph [ref=e62]: "Shortcuts: 1–4 VIP · 0 overhead · Esc free"
    - group [ref=e64]:
      - heading "Leaderboard" [level=2] [ref=e65]
      - tablist [ref=e66]:
        - tab "24h" [ref=e67] [cursor=pointer]
        - tab "1h" [ref=e68] [cursor=pointer]
        - tab "All" [ref=e69] [cursor=pointer]
      - generic [ref=e71]: No dancers registered yet.
    - generic [ref=e72]:
      - heading "Live tips" [level=2] [ref=e74]
      - generic [ref=e76]:
        - generic [ref=e77]: e2e-…ayer
        - generic [ref=e78]: tipped dancer 1 → Rumba
        - generic [ref=e79]: $0.001 · solana
```