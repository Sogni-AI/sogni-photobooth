import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import pluginTs from "@typescript-eslint/eslint-plugin";
import parserTs from "@typescript-eslint/parser";

// Helper to trim whitespace from global names
const cleanGlobals = (g) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k.trim(), v]));

/**
 * ESLint Flat Config for Sogni Photobooth
 * - Supports JS, TS, React
 * - Uses recommended rules for all
 */

export default [
  // JavaScript & JSX (js.configs.recommended)
  {
    ...js.configs.recommended,
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: cleanGlobals(globals.browser),
    },
  },
  // TypeScript & TSX
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: parserTs,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: cleanGlobals(globals.browser),
    },
    plugins: { "@typescript-eslint": pluginTs },
    rules: {
      ...pluginTs.configs.recommended.rules,
      ...pluginTs.configs["recommended-type-checked"].rules,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  // React (JSX/TSX)
  {
    files: ["**/*.{jsx,tsx}"],
    ...pluginReact.configs.flat.recommended,
    plugins: {
      ...pluginReact.configs.flat.recommended.plugins,
      '@typescript-eslint': pluginTs,
      'react-hooks': reactHooks,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...pluginReact.configs.flat.recommended.rules,
      // 🚨 CRITICAL: Enforce strict useEffect dependency rules
      'react-hooks/exhaustive-deps': ['error', {
        'additionalHooks': '',
        'enableDangerousAutofixThisMayCauseInfiniteLoops': false
      }],
      // Warn on too many dependencies (likely doing too much)
      'max-lines-per-function': ['warn', {
        max: 50,
        skipBlankLines: true,
        skipComments: true
      }],
    },
  },
  // 🚨 CUSTOM RULE: Catch common useEffect violations
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      // Ban common context functions in dependencies
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="useEffect"] > ArrayExpression[elements.length>3]',
          message: '❌ useEffect has too many dependencies (>3). Split into multiple effects with single responsibilities.'
        }
      ]
    }
  }
];