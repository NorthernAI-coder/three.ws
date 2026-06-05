const typography = require('@tailwindcss/typography');
const palette = require('tailwindcss/colors');

// ---------------------------------------------------------------------------
// Dark theme by default.
//
// The chat UI was authored against a light "paper/ink" palette, using the full
// Tailwind neutral + accent scales (slate-800 text on white, slate-200 rules,
// etc.). Rather than annotate every one of the ~700 utility classes with a
// `dark:` variant, we flip the palette itself: each numeric scale is mirrored
// (50 <-> 950, 100 <-> 900, ... 500 stays) so that every light-mode colour
// relationship inverts into its dark-mode counterpart. A dark `slate-800`
// heading becomes a light one; a `bg-white` surface becomes near-black; a
// `bg-indigo-50` tint becomes a deep indigo. The design intent is preserved;
// only the luminance axis is reflected.
//
// `white` and `black` are remapped to act as surface/accent anchors so the
// canvas reads as true black with subtly-raised panels.
// ---------------------------------------------------------------------------

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

function invertScale(scale) {
	if (!scale || typeof scale !== 'object') return scale;
	const out = {};
	for (const shade of SHADES) {
		if (scale[shade] === undefined) continue;
		const mirror = 1000 - shade; // 50<->950, 100<->900, ... 500<->500
		out[shade] = scale[mirror] !== undefined ? scale[mirror] : scale[shade];
	}
	// preserve any non-numeric keys (e.g. DEFAULT) untouched
	for (const key of Object.keys(scale)) {
		if (!SHADES.includes(Number(key))) out[key] = scale[key];
	}
	return out;
}

const NEUTRAL_HUES = ['slate', 'gray', 'zinc', 'neutral', 'stone'];
const ACCENT_HUES = [
	'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
	'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

const invertedScales = {};
for (const hue of [...NEUTRAL_HUES, ...ACCENT_HUES]) {
	if (palette[hue]) invertedScales[hue] = invertScale(palette[hue]);
}

// Dark surface/text anchors. `white` is used throughout for raised surfaces
// (cards, panels, the composer) so it maps to a slightly-lifted near-black;
// `black` is used for the primary accent (solid buttons) so it maps to a warm
// near-white that reads as an inverted accent on the dark canvas.
const SURFACE_RAISED = '#141414';
const ACCENT_INVERTED = '#F0EEE7';

function scrollbarsPlugin({ addUtilities }) {
	const track = '#0A0A0A';
	const thumb = 'rgba(255,255,255,0.18)';
	addUtilities({
		'.scrollbar-invisible': {
			'scrollbar-color': `${track} ${track}`,
			'&::-webkit-scrollbar-track': { background: track },
			'&::-webkit-scrollbar-thumb': { background: track },
		},
		'.scrollbar-white': {
			'scrollbar-color': `${thumb} ${track}`,
			'&::-webkit-scrollbar-track': { background: track },
			'&::-webkit-scrollbar-thumb': { background: thumb },
		},
		'.scrollbar-slim': {
			'scrollbar-width': 'thin',
			'&::-webkit-scrollbar': { width: '6px', height: '6px' },
			'&::-webkit-scrollbar-track': {
				background: track,
				'-webkit-border-radius': '10px',
				'border-radius': '10px',
			},
			'&::-webkit-scrollbar-thumb': {
				background: thumb,
				'-webkit-border-radius': '10px',
				'border-radius': '10px',
			},
		},
		'.scrollbar-ultraslim': {
			'scrollbar-width': 'thin',
			'&::-webkit-scrollbar': { width: '3px', height: '3px' },
			'&::-webkit-scrollbar-track': {
				background: track,
				'-webkit-border-radius': '10px',
				'border-radius': '10px',
			},
			'&::-webkit-scrollbar-thumb': {
				background: thumb,
				'-webkit-border-radius': '10px',
				'border-radius': '10px',
			},
		},
		'.scrollbar-none': {
			'-ms-overflow-style': 'none',
			'scrollbar-width': 'none',
			'&::-webkit-scrollbar': { display: 'none' },
		},
		'.scrollbar-default': {
			'-ms-overflow-style': 'auto',
			'scrollbar-width': 'auto',
			'&::-webkit-scrollbar': { display: 'block' },
		},
	});
}

/** @type {import('tailwindcss').Config}*/
const config = {
	content: ['./src/**/*.{html,js,svelte,ts}'],

	theme: {
		extend: {
			screens: {
				md: '880px',
				ld: '1215px',
				xl: '1432px',
			},
			transitionTimingFunction: {
				'in-out':
					'linear(0, 0.005, 0.02 2.2%, 0.045, 0.081 4.9%, 0.16 7.3%, 0.465 16.2%, 0.561, 0.642,0.713 25.8%, 0.773, 0.825 32.7%, 0.868 36.5%, 0.905 40.9%, 0.935 45.7%,0.958 51.1%, 0.975 57.4%, 0.986 64.4%, 0.993 73.1%, 0.997 84.1%, 0.999)',
			},
			fontFamily: {
				sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
				serif: ['Lora', 'ui-serif', 'Georgia', 'serif'],
			},
			colors: {
				...invertedScales,
				white: SURFACE_RAISED,
				black: ACCENT_INVERTED,
				// Semantic design tokens, flipped to a true-black dark theme.
				paper: '#0A0A0A',        // app canvas
				'paper-deep': '#1C1C1C', // raised / hover surface
				ink: '#ECEAE3',          // primary text
				'ink-soft': '#9A988F',   // secondary text
				'ink-faint': '#6B6B6B',  // tertiary text / timestamps
				rule: '#2A2A2A',         // hairline borders
				'three-ui': {
					blue: '#60A5FA',
					'blue-soft': '#172554',
					'blue-border': '#1E40AF',
				},
			},
			boxShadow: {
				pop: '0 8px 24px -8px rgba(0,0,0,0.55), 0 2px 6px -2px rgba(0,0,0,0.40)',
				composer: '0 1px 2px rgba(0,0,0,0.40), 0 8px 32px -16px rgba(0,0,0,0.55)',
			},
			borderRadius: {
				composer: '20px',
			},
		},
	},

	plugins: [typography, scrollbarsPlugin],
};

module.exports = config;
