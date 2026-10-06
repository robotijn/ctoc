'use strict';

module.exports = [
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly', __dirname: 'readonly' }
    },
    rules: { 'no-unused-vars': 'error', 'no-undef': 'error' }
  }
];
