// ESLint（Expo の推奨＋Prettier）。https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    // schema.d.ts は openapi.yaml から生成する（手で直さない）
    ignores: ['dist/*', 'src/api/schema.d.ts'],
  },
]);
