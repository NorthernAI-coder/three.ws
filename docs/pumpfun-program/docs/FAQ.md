# Frequently Asked Questions

## How to optimize buy / sell CU limit?

Each buy / sell instruction used CUs depend on all the inputs of the instruction:

- `user` pubkey, through the `associated_user` PDA bump seed derivation.
- `mint` pubkey, through the `bonding_curve`, `associated_bonding_curve`, `associated_user` PDA bump seed derivation.
- `creator` pubkey, through the `creator_vault` PDA bump seed derivation.
- for buy, the `amount` and `max_sol_cost` inputs are logged as part of instruction execution, so bigger values consume
  more CUs to log than smaller values.
- for sell inputs, it's similar.

The `bonding_curve` (and the other) PDA bump seed is derived from the mint pubkey, so it differs for every mint:

```Rust
    // `mint` is the SPL mint of the token being traded.
    let bump = Pubkey::find_program_address(&[b"bonding-curve", mint.as_ref()], &pump::ID).1;
```

Different mints yield different bump seeds (commonly `255`, but `254`, `253`, … occur),
and the number of search iterations `find_program_address` performs to land on a valid
bump is itself part of the instruction's CU cost — so two trades of identical size can
consume different CUs solely because their mint/user/creator PDAs derive at different bumps.

So it is not possible to compute the used CUs without first simulating the buy / sell tx before submission and adding a
buffer of 1% to the simulated CUs, because buy instruction executes a bit more code when the bonding curve completes on
that buy.

But since tx simulation before buy / sell slows down tx submission and can increase the chances for slippage errors, it
is recommended to use a static big enough CU limit like `100_000`.
