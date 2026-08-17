module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'dist_old_blocked', 'src/components/ui', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // shadcn-style components ship with explicit empty stubs (default
    // noop methods on context defaults). The stubs are intentional and
    // noise-only; suppress them so a real bug stands out.
    '@typescript-eslint/no-empty-function': 'off',
    'no-empty': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    // shadcn-style components use empty object types for default props.
    '@typescript-eslint/no-empty-object-type': 'off',
    'no-empty-object-type': 'off',
    '@typescript-eslint/ban-types': 'off',
    'no-useless-escape': 'off',
  },
}
