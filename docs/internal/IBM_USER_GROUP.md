# IBM User Group — listing brief

three.ws was offered to list the **Three.ws User Group** in the **IBM User Group Directory**.
IBM offered assistance with hosting
options and next steps. This doc captures the program, our decision, the action
checklist, and a paste-ready reply.

This pairs with our existing IBM work — see [the watsonx/Granite integration](../ibm.md)
(three.ws is an [IBM Business Partner](../ibm.md#partnership--affiliation)) and the
public showcase at [three.ws/ibm](https://three.ws/ibm). The user-group listing is a
**community/directory** track, separate from the technical partnership; keep the
[affiliation framing](../ibm.md#partnership--affiliation) intact when you reference it.

---

## What the program is

The IBM User Group Directory lists community-run user groups so members can find
and join them. As of this contact the program is **platform-agnostic**: IBM does
not require you to host on their stack. You point them at a public URL for your
group, and they add it to the directory with a link.

---

## The offer (hosting options)

IBM gave two routes:

| # | Option | What it is | Who maintains it |
|---|--------|------------|------------------|
| 1 | **Self-hosted** | Host the group page on any platform you choose — IBM suggested Luma, Meetup, or LinkedIn — and send them the URL. The program is platform-agnostic, so **any** public URL works. | us |
| 2 | **IBM Community page** | IBM stands up a dedicated page for the group on IBM Community and gives us the URL. Comes with an onboarding call, and runs "for as long as IBM supports it." | IBM |

IBM also flagged three resources, independent of the hosting choice:

- **User Group Benefits Application** — apply for benefits/support for group events and activities.
- **Add Event to Event Listings** — submit upcoming events to be featured in IBM's user-group event listings.
- **Leaders & Liaisons Call** — a recurring call for group leaders to share tips.

---

## Decision: self-host on three.ws

**Pick Option 1 and use our own platform as the canonical home.** Reasoning:

- **We own the audience.** three.ws already has a live community surface at
  [three.ws/community](https://three.ws/community), plus $THREE holders on
  Telegram, X ([@trythreews](https://x.com/trythreews)), and the public
  [changelog](https://three.ws/changelog). Routing the group through Meetup/Luma/
  LinkedIn would hand our community and its traffic to a third party. Self-hosting
  keeps the hub on-brand and one click from the product.
- **It showcases the platform.** three.ws is a platform that builds community and
  agent surfaces. Sending IBM a polished page on our own domain *is* the pitch.
- **Zero lock-in, zero wait.** Option 2 lives "for as long as IBM supports it" and
  requires a setup call. Our page is live today and fully under our control.
- **Events still get the right tool.** Use **Luma** purely for event RSVPs/ops and
  link it from our hub — keep the canonical group page on three.ws. Submit those
  same events to IBM's event listings (resource above).

**Canonical URL to give IBM:** `https://three.ws/community`

Optional upgrade (recommended, not blocking): add a dedicated, directory-facing
landing at `https://three.ws/community/ibm` (or `/user-group`) framed for IBM's
audience — what the group is, who it's for, how to join, upcoming events, and the
IBM-Business-Partner context. Give IBM that URL instead once it's live. Register
any new page in [`data/pages.json`](../../data/pages.json) so it flows into the
sitemap and changelog automatically.

---

## Action checklist

- [ ] Confirm the canonical URL is presentable for an external directory:
      visit [three.ws/community](https://three.ws/community), check it loads, has a
      clear "what this is / how to join" header, and links out to Telegram + X.
- [ ] (Recommended) Build the dedicated `/community/ibm` landing and register it in
      [`data/pages.json`](../../data/pages.json); run `npm run build:pages`.
- [ ] Submit the next event(s) to IBM's event listings (link in Ben's email).
- [ ] File the User Group Benefits Application (link in Ben's email).
- [ ] Add a recurring reminder for the Leaders & Liaisons call if we want to attend.
- [ ] Once IBM confirms the directory entry is live, add a row to
      [`docs/listings.md`](../listings.md) and a holder-readable
      [changelog](../../data/changelog.json) entry (tag: `docs`).
---

