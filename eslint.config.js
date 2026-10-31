// Configurazione ESLint (flat config)
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    // Processo main, preload e script di build: CommonJS su Node/Electron
    files: ['src/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    // Pagine caricate nel browser (card, impostazioni, landing)
    files: ['src/renderer/**/*.js', 'src/settings/**/*.js', 'docs/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser },
    },
  },
  {
    rules: {
      // gli argomenti/catch non usati sono spesso voluti (es. _e negli handler IPC)
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },
];
