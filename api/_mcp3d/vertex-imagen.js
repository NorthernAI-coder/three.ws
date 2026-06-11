// Vertex AI Imagen text-to-image client.
//
// Calls Google's Imagen API (imagegeneration@006 or imagen-3.0-generate-001)
// with a text prompt and returns an image URL suitable for downstream
// image-to-3D reconstruction.
//
// Why prefer this over Replicate flux-schnell when GCP credits are set:
//   - Costs ~$0.02–0.04 per image versus ~$0.003 on Replicate, BUT the
//     $100k GCP credit pool makes it effectively free for the operator.
//   - Imagen 3 output quality is noticeably higher and reconstructs better.
//   - Single dependency (GCP) instead of two API keys.
//
// Required env vars (at least one auth path must be present):
//   GOOGLE_CLOUD_PROJECT          — GCP project id
//   GOOGLE_CLOUD_LOCATION         — region (default: us-central1)
//   GCP_SERVICE_ACCOUNT_JSON      — service account key JSON as a string
//                                   (set in Vercel secrets; alternative to
//                                   GOOGLE_APPLICATION_CREDENTIALS file path)
//
// Model selection (first match wins):
//   VERTEX_IMAGEN_MODEL           — explicit override, e.g. "imagen-3.0-fast-generate-001"
//   defaults to "imagen-3.0-generate-001" (best quality, ~8s)
//   fast fallback: "imagen-3.0-fast-generate-001" (~3s, slightly lower quality)
//
// Output: base64 PNG returned inline in the API response, uploaded to R2/S3
// by the caller (same pattern as the Replicate path in text-to-image.js).

const DEFAULT_MODEL = 'imagen-3.0-generate-001';
const DEFAULT_LOCATION = 'us-central1';

// Aspect ratio mappings: our internal format → Imagen's enum.
const ASPECT_MAP = {
  '1:1':  '1:1',
  '4:3':  '4:3',
  '3:4':  '3:4',
  '16:9': '16:9',
  '9:16': '9:16',
};

function readEnv(name) {
  if (typeof process !== 'undefined' && process.env?.[name]) return process.env[name];
  return null;
}

// Obtain a Google OAuth 2.0 access token.
//
// Two auth paths, in priority order:
//   1. GCP_SERVICE_ACCOUNT_JSON  — service account JSON string (Vercel-friendly)
//   2. Metadata server           — works on Cloud Run / GCE with attached SA
//
// Tokens are cached in-process for (expiry - 60s) to avoid hammering the
// token endpoint on every request.
const _tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (_tokenCache.token && now < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  const saJson = readEnv('GCP_SERVICE_ACCOUNT_JSON');
  if (saJson && saJson.trim() && saJson.trim() !== '""') {
    return _tokenFromServiceAccount(parseServiceAccount(saJson));
  }

  // Fall back to the metadata server (Cloud Run / GCE)
  const metaRes = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  ).catch(() => null);

  if (metaRes?.ok) {
    const data = await metaRes.json();
    _tokenCache.token = data.access_token;
    _tokenCache.expiresAt = now + (data.expires_in - 60) * 1000;
    return _tokenCache.token;
  }

  throw Object.assign(
    new Error(
      'No GCP credentials found. Set GCP_SERVICE_ACCOUNT_JSON or run on GCE/Cloud Run.',
    ),
    { code: 'unconfigured' },
  );
}

// Service-account JSON pasted into a secrets UI routinely arrives mangled:
// wrapped in an extra layer of quotes, with escaped inner quotes (`{\"type\"…}`),
// or base64-encoded. Accept every common mangling; reject with a designed
// `unconfigured` error (instead of a raw JSON.parse crash) so callers can
// branch to a fallback provider.
function parseServiceAccount(raw) {
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  const candidates = [v, v.replace(/\\"/g, '"')];
  if (/^[A-Za-z0-9+/=\s]+$/.test(v)) {
    try {
      candidates.push(Buffer.from(v, 'base64').toString('utf8'));
    } catch {
      // not base64 — fall through to the error below
    }
  }
  for (const candidate of candidates) {
    try {
      const sa = JSON.parse(candidate);
      if (sa && typeof sa === 'object' && sa.client_email && sa.private_key) return sa;
    } catch {
      // try the next decoding
    }
  }
  throw Object.assign(
    new Error(
      'GCP_SERVICE_ACCOUNT_JSON is set but is not a valid service-account JSON object (expected client_email + private_key). Re-paste the raw key file contents.',
    ),
    { code: 'unconfigured' },
  );
}

async function _tokenFromServiceAccount(sa) {
  // Build a JWT for the service account and exchange it for an access token.
  // Uses the Web Crypto API (available in Node 18+ and Vercel edge runtime).
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const b64url = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  // Import the RSA private key
  const keyData = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyBuffer = Buffer.from(keyData, 'base64');

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sigBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    Buffer.from(signingInput),
  );
  const sig = Buffer.from(sigBuffer).toString('base64url');
  const jwt = `${signingInput}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text().catch(() => tokenRes.status);
    throw new Error(`GCP token exchange failed: ${err}`);
  }

  const data = await tokenRes.json();
  _tokenCache.token = data.access_token;
  _tokenCache.expiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return _tokenCache.token;
}

// Return true if Vertex AI Imagen is configured (GCP project present).
export function isConfigured() {
  return Boolean(readEnv('GOOGLE_CLOUD_PROJECT'));
}

// Generate an image from a text prompt using Vertex AI Imagen.
//
// Returns { imageUrl, model } where imageUrl is a data: URI containing
// the base64-encoded PNG. The caller is responsible for uploading it to
// permanent storage if needed (the forge pipeline does this).
export async function generateImage(prompt, { aspectRatio = '1:1' } = {}) {
  const project = readEnv('GOOGLE_CLOUD_PROJECT');
  if (!project) {
    throw Object.assign(
      new Error('Vertex AI Imagen is not configured (GOOGLE_CLOUD_PROJECT missing)'),
      { code: 'unconfigured' },
    );
  }

  const location = readEnv('GOOGLE_CLOUD_LOCATION') || DEFAULT_LOCATION;
  const model = readEnv('VERTEX_IMAGEN_MODEL') || DEFAULT_MODEL;
  const aspectEnum = ASPECT_MAP[aspectRatio] || '1:1';

  const token = await getAccessToken();

  const endpoint =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:predict`;

  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: aspectEnum,
      // Enhance the prompt for 3D reconstruction: clean background,
      // single subject, even lighting. This dramatically improves the
      // quality of the downstream image-to-3D step.
      addWatermark: false,
      safetySetting: 'block_some',
      personGeneration: 'allow_adult',
    },
  };

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw Object.assign(
      new Error(`Vertex AI Imagen unreachable: ${err?.message}`),
      { code: 'provider_unreachable' },
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      data?.error?.message || data?.message || `Vertex AI returned ${res.status}`;
    if (res.status === 429) {
      throw Object.assign(new Error(message), {
        code: 'rate_limited',
        retryAfter: 10,
      });
    }
    throw Object.assign(new Error(message), { providerStatus: res.status });
  }

  const prediction = data?.predictions?.[0];
  const b64 = prediction?.bytesBase64Encoded;
  if (!b64) {
    throw new Error('Vertex AI returned no image data');
  }

  // Return as a data URI so the caller can either use it directly or
  // upload it to object storage. The data URI is also accepted by
  // TRELLIS, Hunyuan3D, and TripoSR as an image source.
  const imageUrl = `data:image/png;base64,${b64}`;
  return { imageUrl, model: `vertex-ai/${model}` };
}

// Edit an existing image using Imagen's inpainting / editing capability.
// Works with Imagen 3 Edit models.
//
// Returns { imageUrl, model }.
export async function editImage(imageUrl, prompt, { maskUrl = null } = {}) {
  const project = readEnv('GOOGLE_CLOUD_PROJECT');
  if (!project) {
    throw Object.assign(
      new Error('Vertex AI Imagen is not configured (GOOGLE_CLOUD_PROJECT missing)'),
      { code: 'unconfigured' },
    );
  }

  const location = readEnv('GOOGLE_CLOUD_LOCATION') || DEFAULT_LOCATION;
  // Use the edit-specific model; fall back to base if not set.
  const model =
    readEnv('VERTEX_IMAGEN_EDIT_MODEL') || 'imagen-3.0-capability-001';

  const token = await getAccessToken();

  const endpoint =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:predict`;

  // Fetch source image as base64 if it's a URL
  let sourceB64;
  if (imageUrl.startsWith('data:')) {
    sourceB64 = imageUrl.split(',')[1];
  } else {
    const { fetch_remote_bytes } = await import('../_lib/fetch-bytes.js').catch(() => ({}));
    if (!fetch_remote_bytes) throw new Error('cannot fetch image for editing');
    const bytes = await fetch_remote_bytes(imageUrl);
    sourceB64 = Buffer.from(bytes).toString('base64');
  }

  const instance = {
    prompt,
    image: { bytesBase64Encoded: sourceB64 },
    editConfig: { editMode: maskUrl ? 'inpainting-insert' : 'product-image' },
  };
  if (maskUrl) {
    // maskUrl is expected to be a data URI or https URL of a grayscale mask
    const maskB64 = maskUrl.startsWith('data:')
      ? maskUrl.split(',')[1]
      : Buffer.from(
          await fetch(maskUrl).then((r) => r.arrayBuffer()),
        ).toString('base64');
    instance.mask = { image: { bytesBase64Encoded: maskB64 } };
  }

  const body = {
    instances: [instance],
    parameters: { sampleCount: 1, safetySetting: 'block_some' },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Vertex AI edit returned ${res.status}`;
    throw Object.assign(new Error(msg), { providerStatus: res.status });
  }

  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Vertex AI edit returned no image data');
  return { imageUrl: `data:image/png;base64,${b64}`, model: `vertex-ai/${model}` };
}
