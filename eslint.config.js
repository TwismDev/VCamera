const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'supabase/functions/*'],
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
