//! WASM-backed Solana ed25519 vanity address grinder.
//!
//! Exposes a single `grind` function callable from JS. Each call tries up to
//! `batch` keypairs derived deterministically from `start_seed` by treating
//! the low 4 bytes of the seed as a little-endian counter; the JS caller is
//! expected to supply a fresh cryptographically-random 32-byte `start_seed`
//! for each batch so resulting keys are unpredictable.
//!
//! Returns `null` if no match is found in the batch, or a `{ secretKey,
//! publicKey }` object on match. The 64-byte `secretKey` matches Solana's
//! standard layout: `[32-byte seed][32-byte public key]`, compatible with
//! `Keypair.fromSecretKey()` in `@solana/web3.js`.
//!
//! The hot loop derives each pubkey via raw curve25519-dalek primitives
//! (`SHA-512(seed) → clamp → scalar * G → compress`) — exactly the ed25519
//! keypair derivation but without constructing the full `SigningKey` struct
//! that ed25519-dalek would normally hand back. The output pubkey is
//! bit-for-bit identical to `ed25519_dalek::SigningKey::from_bytes(seed)
//! .verifying_key().to_bytes()`.

use curve25519_dalek::edwards::EdwardsPoint;
use js_sys::{Object, Reflect, Uint8Array};
use sha2::{Digest, Sha512};
use wasm_bindgen::prelude::*;

#[inline(always)]
fn pubkey_from_seed(seed: &[u8; 32]) -> [u8; 32] {
    let mut h = Sha512::new();
    h.update(seed);
    let digest = h.finalize();

    let mut scalar_bytes = [0u8; 32];
    scalar_bytes.copy_from_slice(&digest[..32]);

    // mul_base_clamped internally applies the ed25519 clamp (clear 3 low bits,
    // clear high bit, set 254th bit) and multiplies by the basepoint — exactly
    // what `ed25519_dalek::SigningKey::from_bytes(seed).verifying_key()` does,
    // minus the SigningKey-struct overhead we don't need for grinding.
    EdwardsPoint::mul_base_clamped(scalar_bytes)
        .compress()
        .to_bytes()
}

#[wasm_bindgen]
pub fn grind(
    prefix: &str,
    suffix: &str,
    ignore_case: bool,
    batch: u32,
    start_seed: &[u8],
) -> JsValue {
    if start_seed.len() != 32 {
        return JsValue::NULL;
    }

    let want_prefix: Vec<u8> = if ignore_case {
        prefix.to_lowercase().into_bytes()
    } else {
        prefix.as_bytes().to_vec()
    };
    let want_suffix: Vec<u8> = if ignore_case {
        suffix.to_lowercase().into_bytes()
    } else {
        suffix.as_bytes().to_vec()
    };
    let p_len = want_prefix.len();
    let s_len = want_suffix.len();

    let mut seed = [0u8; 32];
    seed.copy_from_slice(start_seed);
    let base_counter = u32::from_le_bytes([seed[0], seed[1], seed[2], seed[3]]);

    for i in 0..batch {
        let counter = base_counter.wrapping_add(i);
        let bytes = counter.to_le_bytes();
        seed[0] = bytes[0];
        seed[1] = bytes[1];
        seed[2] = bytes[2];
        seed[3] = bytes[3];

        let pub_bytes = pubkey_from_seed(&seed);

        let addr_string = bs58::encode(&pub_bytes).into_string();
        let addr = addr_string.as_bytes();

        let prefix_ok = if p_len == 0 {
            true
        } else if addr.len() < p_len {
            false
        } else if ignore_case {
            eq_ignore_ascii_case(&addr[..p_len], &want_prefix)
        } else {
            &addr[..p_len] == want_prefix.as_slice()
        };
        if !prefix_ok {
            continue;
        }

        let suffix_ok = if s_len == 0 {
            true
        } else if addr.len() < s_len {
            false
        } else if ignore_case {
            eq_ignore_ascii_case(&addr[addr.len() - s_len..], &want_suffix)
        } else {
            &addr[addr.len() - s_len..] == want_suffix.as_slice()
        };
        if !suffix_ok {
            continue;
        }

        let mut secret_key = [0u8; 64];
        secret_key[..32].copy_from_slice(&seed);
        secret_key[32..].copy_from_slice(&pub_bytes);

        let secret_array = Uint8Array::new_with_length(64);
        secret_array.copy_from(&secret_key);

        let result = Object::new();
        Reflect::set(&result, &JsValue::from_str("secretKey"), &secret_array.into())
            .expect("set secretKey");
        Reflect::set(
            &result,
            &JsValue::from_str("publicKey"),
            &JsValue::from_str(&addr_string),
        )
        .expect("set publicKey");
        return result.into();
    }

    JsValue::NULL
}

fn eq_ignore_ascii_case(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter()
        .zip(b.iter())
        .all(|(x, y)| x.eq_ignore_ascii_case(y))
}
