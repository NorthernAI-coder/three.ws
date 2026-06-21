import { PublicKey, type Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

/**
 * Resolve which SPL token program owns a mint — classic SPL Token vs Token-2022.
 *
 * Any helper hardcoded to TOKEN_PROGRAM_ID derives the wrong associated-token
 * address and builds against the wrong program for a Token-2022 mint, so the
 * transfer fails (or a balance lookup misses) for tokens that genuinely exist in
 * the wallet — including $THREE, which is a Token-2022 mint. The mint account's
 * owner is the canonical, on-chain way to tell the two programs apart.
 *
 * @throws if the mint account doesn't exist or isn't owned by either SPL program.
 */
export async function resolveTokenProgramId(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) throw new Error(`Mint not found: ${mint.toBase58()}`);
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  throw new Error(
    `Not an SPL token mint (owner ${info.owner.toBase58()}): ${mint.toBase58()}`,
  );
}
