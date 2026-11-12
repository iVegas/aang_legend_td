import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-server', 'dev-dist', 'node_modules'] },
  ...tseslint.configs.recommended,
  {
    // Determinism guard: the simulation may only depend on itself and content data.
    files: ['src/core/**/*.ts', 'src/content/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pixi.js', 'preact', 'preact/*', '**/render/**', '**/ui/**', '**/platform/**', '**/game/**'],
              message: 'core/content must stay free of browser, rendering and UI code.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in core/rng.ts.' },
        { object: 'Date', property: 'now', message: 'No wall-clock time inside the simulation.' },
      ],
    },
  },
);
