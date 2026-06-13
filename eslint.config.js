// Flat ESLint config (ESLint 10 — eslintrc format is no longer supported).
// Scope: first-party vanilla-JS source at the repo root. Sub-projects that ship
// their own flat config (chat/, agent-payments-sdk/, character-studio/) and
// vendored/generated/build output are ignored here. TypeScript sources are left
// to each package's own tsc/typecheck pipeline, so we lint JS extensions only
// and avoid pulling in typescript-eslint at the root.
import js from '@eslint/js';
import globals from 'globals';

export default [
	{
		ignores: [
			'**/node_modules/**',
			'**/dist/**',
			'**/dist-lib/**',
			'**/dist-artifact/**',
			'**/build/**',
			'**/.vercel/**',
			'**/.svelte-kit/**',
			'**/coverage/**',
			// Vendored / external library code
			'contracts/lib/**',
			'character-studio/**',
			'docs/pumpfun-program/**',
			// Vendored third-party browser libs (Draco/Basis compression,
			// the scene-studio editor's bundled acorn/codemirror/esprima/etc.)
			'**/draco/**',
			'**/basis/**',
			'public/scene-studio/libs/**',
			'src/scene-studio/vendor/**',
			'**/*.bundle.js',
			'public/dashboard/avaturn-sdk.js',
			// Self-contained sub-projects with their own ESLint flat config
			'chat/**',
			'public/chat/**',
			'agent-payments-sdk/**',
			// Generated output
			'data/_generated/**',
			// Bundled/minified build artifacts
			'**/*.min.js',
			'public/embed-sdk.js',
			'public/embed.js',
			'public/wallet-login.js',
			'public/artifact.js',
			'public/bazaar.js',
			'public/paywall.js',
		],
	},
	js.configs.recommended,
	{
		files: ['**/*.{js,mjs,jsx}'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: {
			// This codebase predates linting, so the first pass is a warn-level
			// baseline: it surfaces issues without failing the gate, and the team
			// ratchets rules up to error as files are cleaned. High-value
			// structural rules that are already clean (no-dupe-keys, no-func-assign)
			// stay at error so regressions are caught immediately.
			'no-unused-vars': 'warn',
			'no-console': 'warn',
			'no-undef': 'warn',
			'no-empty': 'warn',
			'no-constant-condition': 'warn',
			'no-constant-binary-expression': 'warn',
			'no-prototype-builtins': 'warn',
			'no-useless-escape': 'warn',
			'no-useless-assignment': 'off',
			'no-cond-assign': 'warn',
			'no-fallthrough': 'warn',
			'no-irregular-whitespace': 'warn',
			'no-control-regex': 'off',
			'no-unreachable': 'warn',
			'no-unassigned-vars': 'warn',
			'no-async-promise-executor': 'warn',
			'no-misleading-character-class': 'warn',
			'no-unsafe-finally': 'warn',
			'no-unused-private-class-members': 'warn',
			'no-unused-labels': 'warn',
			'preserve-caught-error': 'warn',
		},
	},
	{
		files: ['**/*.cjs'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'commonjs',
			globals: { ...globals.node },
		},
		rules: {
			'no-unused-vars': 'warn',
			'no-console': 'warn',
			'no-undef': 'warn',
		},
	},
];
