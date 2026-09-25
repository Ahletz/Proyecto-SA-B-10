// ESLint 8 (config clásica) para el frontend: `npm run lint`.
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:react-hooks/recommended'],
  rules: {
    // Convención del proyecto: respuestas del API sin tipar en varias páginas.
    '@typescript-eslint/no-explicit-any': 'off',
    // `catch {}` vacío a propósito (p. ej. respuesta que no es JSON en lib/api.ts).
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'vite.config.ts', 'tailwind.config.js', 'postcss.config.js'],
};
