import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const banThree = {
  group: ['three', 'three/*'],
  message: 'Only the render adapter may import Three.js.',
};

const banRapier = {
  group: ['@dimforge/rapier3d-compat', '@dimforge/rapier3d-compat/*'],
  message: 'Only the physics adapter may import Rapier.',
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'eslint.config.js', 'scripts/**', 'server/**/*.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintConfigPrettier,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },
  {
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ ...banThree, message: 'Game code uses engine interfaces.' }, banRapier] },
      ],
    },
  },
  {
    files: [
      'src/engine/core/**/*.ts',
      'src/engine/input/**/*.ts',
      'src/engine/audio/**/*.ts',
      'src/engine/assets/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: [banThree, banRapier] }],
    },
  },
  {
    files: ['src/engine/render/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [banRapier] }],
    },
  },
  {
    files: ['src/engine/physics/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [banThree] }],
    },
  },
);
