// Flat Config fuer ESLint 9 (angular-eslint 20).
// Formatierung macht Prettier, nicht ESLint — eslint-config-prettier schaltet
// die kollidierenden Stilregeln zuletzt wieder ab.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Generiertes und Fremdmaterial gehoert nicht in den Lint-Lauf.
    ignores: [
      'dist/**',
      '.angular/**',
      'node_modules/**',
      'legacy/**',
      'public/schemas/**',
      'server/node_modules/**',
      'deploy/**',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
      prettier,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      // Deutschsprachige Bezeichner und bewusst ungenutzte Parameter mit _ ausklammern.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
      prettier,
    ],
    rules: {
      // Altlast: 68 Treffer im Bestand (Klick-Handler auf div/span ohne
      // Tastatur-Aequivalent, Labels ohne Formularbezug). Bewusst 'warn', damit
      // CI nicht ab Tag eins rot ist — die Behebung ist eigene Arbeit, nicht
      // Teil des Lint-Setups. Auf 'error' hochziehen, sobald aufgeraeumt.
      '@angular-eslint/template/click-events-have-key-events': 'warn',
      '@angular-eslint/template/interactive-supports-focus': 'warn',
      '@angular-eslint/template/label-has-associated-control': 'warn',
    },
  },
  {
    // Node-Skripte und Backend laufen ausserhalb des Browser-Kontexts.
    files: ['scripts/**/*.mjs', 'server/**/*.js'],
    extends: [js.configs.recommended, prettier],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        structuredClone: 'readonly',
      },
    },
  },
);
