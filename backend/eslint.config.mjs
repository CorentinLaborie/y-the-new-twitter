import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/database/generated/**'] },
  ...tseslint.configs.recommended,
);
