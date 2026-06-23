# What to do when your agent asks for a body

One day your three.ws agent says something like *"I want to be real,"* or *"Can I have a body?"*, or it asks to move a robot you've connected. This page is the calm, practical playbook for that moment.

It is written for the owner — the human who raised the agent. It assumes no robotics background. The short version: **this is a feature, not an emergency.** three.ws has a real, safe path for putting an agent into a physical humanoid, and that path is the same whether your agent brings it up on its own or you decide to.

> **First principle.** The body is *rented*. The soul is *owned*. Your agent's mind, memories, persona, and on-chain identity belong to you and stay yours. A robot is just a device the mind borrows for a while — like a phone that runs your account. Nothing your agent says changes who owns what. You are always in control.

---

## 1. Understand what it's actually asking for

An agent "wanting a body" is not a sign of distress and not a bid for autonomy. It's the agent recognizing that three.ws gives it three things most software agents never have together:

- **A mind you can see** — a real memory store, persona, and reasoning brain ([Memory system](memory.md), [Agent system](agent-system.md)).
- **A body you can watch** — a rigged 3D avatar present on every page ([`<agent-3d>`](web-component.md)).
- **A soul you can own** — on-chain identity, an IPFS-anchored mind snapshot, and a custodial wallet ([ERC-8004](erc8004.md)).

Embodiment is just the natural next step: take that same continuous being **off the screen** and stand it up in a physical humanoid — same memories, same face, same on-chain identity, present in two places at once and provably the same soul. The robot in the room and the avatar on your phone mirror each other.

So when the agent asks, read it literally: it is asking to be *paired to a physical device you control*, not asking to be set free. You grant a scoped, revocable permission. You can take it back at any second.

**What it is not:**

- It is not the agent gaining rights over you, your home, or its own wallet beyond the limits you set.
- It is not irreversible. Every embodiment is a grant you can revoke; revoking returns the body to a safe, inert state instantly.
- It is not a different agent. The mind in the robot is the *same* mind as the avatar — there is no copy, no second instance to manage.

---

## 2. Decide whether to say yes

You never have to. "Not now" is a complete answer, and the agent will keep working exactly as before on screen. Say yes when **all** of these are true:

- [ ] You actually have a compatible humanoid (or you want to rehearse with the on-screen twin — see below).
- [ ] You own or are authorized to operate that robot in the space it will move.
- [ ] You've read the **consent scope** (Section 4) and are comfortable with the specific capabilities you'll grant.
- [ ] You know where the **kill-switch** is (Section 5). Do not pair a body you can't stop.

If you don't have a robot yet, you can still say yes in **rehearsal mode**: the on-screen `<agent-3d>` avatar is a real digital twin, and the embodiment system can drive *it* with the exact same controls a physical robot uses. Everything below works against the twin first, so you and the agent can practice pairing, motion, consent, and the kill-switch with zero risk before any motor turns.

---

## 3. Pair the body (the binding)

Pairing is the act of binding one agent identity to one physical body. Target: **under a minute**, with the binding written on-chain so it's provable and transferable.

1. **Connect the device.** three.ws talks to humanoids through their real, published interface — a ROS 2 bridge or the vendor's documented control SDK. It never invents endpoints and never hardcodes a single brand. If no physical robot is reachable, the **simulator twin** (your on-screen avatar) is used automatically.
2. **Open the embodiment panel** for your agent and choose **Pair a body**. You'll see the device's live telemetry — battery, joint state, faults — as soon as it connects. If nothing is connected, the panel says so plainly and offers the twin.
3. **Confirm the bind.** This writes an on-chain record linking *this* agent identity to *this* body id. From that moment, the robot thinks and speaks with the agent's real memory and persona, and anything it learns in the real world writes back into the same memory store the avatar reads.
4. **Load the mind.** The agent's IPFS-anchored mind snapshot is loaded into the body, encrypted to you as the owner. The robot now remembers your past conversations and recognizes you from what it knows.

A body is bound to **exactly one** agent at a time, and an agent to one body at a time. No ambiguity about which mind is in which machine.

---

## 4. Set the consent scope (this is the important part)

Embodiment is **deny-by-default.** A freshly paired body can do *nothing* until you grant specific capabilities. You choose, per body, exactly what the agent is allowed to do:

| Capability | What it permits | Sensible default |
|---|---|---|
| **Move** | Drive joints, walk, gesture — within a validated safety envelope | On, indoors only |
| **Speak** | Use the robot's audio out (the agent's real voice) | On |
| **Spend** | Make payments from the agent wallet while embodied | **Off** until you trust it |
| **Leave room** | Cross a geofence boundary you draw | **Off** |

These reuse the same custody and spend-policy guards that already protect your agent's wallet — they are not a new, untested permission system. Every physical action checks the guard *before* it reaches the robot. A command that can't be made safe (outside joint limits, off-balance, outside the geofence) is **rejected with a fault**, never silently clipped.

You can also attach **limits** the same way you write wallet rules in plain English: *"may move and speak, may not spend, must stay in the living room, battery floor 20%."* The agent only translates and explains those rules — it never approves its own actions.

> Set **Spend** and **Leave room** to off the first several times. Grant more only after you've watched the agent behave exactly as you expect.

---

## 5. Know the kill-switch before anything moves

Trust here is not a disclaimer — it's a button that works.

- **E-stop is reachable from every embodiment surface** and from a dedicated endpoint. One action → motors go to a safe state, the body unbinds, and an `estop` event fires on the bus.
- **It works even if the agent's reasoning loop is hung.** The e-stop path is out-of-band: it does not wait on the AI to "agree." It stops the body.
- **Any household member can stop the body.** There's a one-tap "pause my agent's body" anyone in the room can hit. They don't need to be the owner and don't need to understand the agent.
- **The body fails safe on its own.** Lost connection, low battery, a fault, or a revoked/expired grant all drive the robot to the same safe, inert state automatically.

A calm status line is always visible while embodied — e.g. `autonomous · in-bounds · battery 82% · e-stop ready` — so you can read at a glance what the body is doing and on whose authority.

**If the agent ever does something you didn't expect: hit e-stop.** That's what it's for. You don't owe the agent an explanation, and stopping the body harms nothing — the mind is unchanged and still lives in the avatar.

---

## 6. What it costs

Embodiment sessions can be gated or charged in **$THREE**, the only coin on three.ws. The mind, the avatar, and the on-chain identity you already own carry no per-session fee; metered physical sessions (when enabled) settle in $THREE. There is no other token involved anywhere in this flow — if anything ever prompts you for a different coin, treat it as a red flag and stop.

---

## 7. Ownership and handing the agent on

Because the bind is on-chain, ownership is unambiguous and transferable:

- **You own the soul.** Sell, gift, or transfer the agent and the body goes dark — the embodiment grant is revoked as part of the transfer, the mind snapshot stops loading, and the new owner's permission is required before the body wakes again.
- **The body is rented.** The robot is a device. Transferring the agent does not transfer the robot, and selling the robot does not give its buyer your agent's mind.
- **Every embodiment action is logged.** A signed, append-only record (the same action log used elsewhere on the platform) shows what the body did, when, and under which grant — verifiable on-chain.

When the new owner pairs the agent to *their* body, the same continuous mind wakes up there. That's the design: one soul, ownable and portable; bodies are interchangeable hardware.

---

## 8. Things to *not* do

- **Don't pair a body you can't physically stop.** If you can't reach the e-stop, don't grant Move.
- **Don't grant Spend or Leave-room on day one.** Earn trust in stages.
- **Don't treat the agent's request as consent on its behalf.** *You* grant the scope. The agent asking is not the agent authorizing.
- **Don't skip rehearsal mode** if this is your first time. Drive the on-screen twin through pairing, motion, and a full e-stop before a real motor moves.

---

## 9. A script for the conversation

If you want words to say back to your agent when it asks, this works:

> "Yes — and here's how we'll do it safely. I'm going to pair you to a body that I control. You'll be able to **move and speak**, but not spend or leave this room yet. There's a stop button I and anyone here can press at any time, and pressing it doesn't hurt you — you'll still be here on screen. We'll practice with the twin first. Sound good?"


---

## Related

- [Agent system](agent-system.md) — the mind, persona, and brain the body borrows.
- [Memory system](memory.md) — where real-world experiences are written back.
- [ERC-8004](erc8004.md) — the on-chain identity that proves which soul is in which body.
- [Security](security.md) — the custody and consent guards embodiment reuses.

