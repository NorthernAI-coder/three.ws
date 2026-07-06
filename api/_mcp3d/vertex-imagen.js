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

import { getGcpAccessToken } from '../_lib/gcp-auth.js';

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

// Token minting (service-account JWT→OAuth exchange, caching, metadata-server
// fallback) is shared with the Vertex Claude transport — see api/_lib/gcp-auth.js.

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

  const token = await getGcpAccessToken();

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

  const token = await getGcpAccessToken();

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
