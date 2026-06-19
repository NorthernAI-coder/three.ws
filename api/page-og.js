// api/page-og.js — generic Open Graph / social-share image for every static
// page in data/pages.json. One endpoint renders a branded, per-page,
// per-section 1200×630 PNG card so each shared link previews with its own
// title, description, and section identity instead of a single shared image.
//
// Driven entirely by query params (no DB / filesystem read at request time):
//   ?t=<title>  ?d=<description>  ?s=<section id>  ?p=<route path>
// The SEO injector (scripts/inject-seo-meta.mjs) stamps these straight from the
// page catalog, so the card a crawler sees always matches the sitemap copy.
//
// Rendered as a real PNG via @vercel/og's ImageResponse on the NODE runtime
// (not Edge — Edge returns FUNCTION_INVOCATION_FAILED in this deployment), the
// same pattern proven in api/play-og.js. PNG (not SVG) so X, Facebook,
// LinkedIn, and iMessage — none of which render image/svg+xml OG cards — all
// show the preview.
import { ImageResponse } from '@vercel/og';

const WIDTH = 1200;
const HEIGHT = 630;

// Per-section identity. Each catalog section gets a distinct accent so a page's
// share card reads as part of its family at a glance. Falls back to the brand
// violet for anything unmapped.
const SECTIONS = {
  main: { label: 'Platform', accent: '#8b5cf6' },
  build: { label: 'Build', accent: '#06b6d4' },
  labs: { label: 'Labs', accent: '#ec4899' },
  crypto: { label: 'Crypto', accent: '#4ade80' },
  'agent-tools': { label: 'Agent Tools', accent: '#14b8a6' },
  account: { label: 'Account', accent: '#60a5fa' },
  learn: { label: 'Learn', accent: '#fb923c' },
  blog: { label: 'Blog', accent: '#a78bfa' },
  legal: { label: 'Legal', accent: '#94a3b8' },
  machine: { label: 'Reference', accent: '#9ca3af' },
};
const DEFAULT_SECTION = { label: 'three.ws', accent: '#8b5cf6' };

function sectionFor(id) {
  return SECTIONS[String(id || '').toLowerCase()] || DEFAULT_SECTION;
}

function clamp(s, n) {
  s = String(s || '').trim();
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

function card({ title, desc, section, route, accent }) {
  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '70px 76px',
        background: `radial-gradient(115% 115% at 82% 8%, ${accent}26 0%, #0a0a0f 46%, #050507 100%)`,
        color: 'white',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      },
      children: [
        // faint engineering grid overlay
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
              backgroundSize: '52px 52px',
            },
          },
        },
        // top row: brand wordmark + section pill
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'baseline' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: 30, fontWeight: 800, letterSpacing: -1, color: '#f5f5f7' },
                        children: 'three.ws',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: 30, fontWeight: 800, letterSpacing: -1, color: accent, marginLeft: 4 },
                        children: '.',
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    color: accent,
                    padding: '10px 22px',
                    borderRadius: 999,
                    background: `${accent}1f`,
                    border: `1px solid ${accent}59`,
                  },
                  children: section.label,
                },
              },
            ],
          },
        },
        // middle: title + description
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column' },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: title.length > 22 ? 76 : 92,
                    fontWeight: 900,
                    letterSpacing: -3,
                    lineHeight: 1.02,
                    color: '#ffffff',
                  },
                  children: title,
                },
              },
              desc
                ? {
                    type: 'div',
                    props: {
                      style: {
                        fontSize: 32,
                        fontWeight: 400,
                        lineHeight: 1.3,
                        marginTop: 26,
                        maxWidth: 980,
                        color: 'rgba(235,235,245,0.62)',
                      },
                      children: desc,
                    },
                  }
                : { type: 'div', props: { children: '' } },
            ],
          },
        },
        // bottom: route + tagline
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 24,
                    fontWeight: 600,
                    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                    color: 'rgba(235,235,245,0.5)',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { width: 10, height: 10, borderRadius: 10, background: accent, marginRight: 14 },
                      },
                    },
                    { type: 'div', props: { children: `three.ws${route}` } },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: { fontSize: 24, fontWeight: 500, color: 'rgba(235,235,245,0.4)' },
                  children: 'Give your AI a body.',
                },
              },
            ],
          },
        },
      ],
    },
  };
}

function imageResponse(node) {
  return new ImageResponse(node, {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      'cache-control': 'public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400',
    },
  });
}

// Web Response (from @vercel/og) → Node ServerResponse. Headers first, then body.
async function sendImage(res, response) {
  for (const [key, value] of response.headers.entries()) res.setHeader(key, value);
  const ab = await response.arrayBuffer();
  res.statusCode = response.status;
  res.end(Buffer.from(ab));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET,OPTIONS');
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://x');
  const section = sectionFor(url.searchParams.get('s'));
  const accent = section.accent;
  const title = clamp(url.searchParams.get('t') || 'three.ws', 60);
  const desc = clamp(url.searchParams.get('d') || '', 140);
  let route = (url.searchParams.get('p') || '/').trim();
  if (!route.startsWith('/')) route = `/${route}`;
  route = clamp(route, 42);

  try {
    await sendImage(res, imageResponse(card({ title, desc, section, route, accent })));
  } catch (err) {
    // Never fail open to a broken-image box — render the coin-agnostic brand
    // card so the preview still looks intentional.
    console.error('[page-og] render failed:', err?.message || err);
    res.statusCode = 200;
    await sendImage(
      res,
      imageResponse(
        card({
          title: 'three.ws',
          desc: 'Give your AI a body. Build, embed, monetize, and trade autonomous 3D agents.',
          section: DEFAULT_SECTION,
          route: '/',
          accent: DEFAULT_SECTION.accent,
        }),
      ),
    );
  }
}
