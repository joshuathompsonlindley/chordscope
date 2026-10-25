// Lint rules. The app's own standards (braces, function declarations, no shorthand names, TSDoc and types everywhere)
// apply to `src`; tests keep only the rules that catch mistakes.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import jsdoc from "eslint-plugin-jsdoc";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "test/core/__snapshots__", "test/ui/__snapshots__"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      curly: ["error", "all"],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { jsdoc, "react-hooks": reactHooks },
    rules: {
      "func-style": ["error", "declaration"],
      "id-length": ["error", { min: 2, exceptions: ["x", "y", "_"] }],
      "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
      "@typescript-eslint/typedef": [
        "error",
        {
          variableDeclaration: true,
          parameter: true,
          arrowParameter: true,
          propertyDeclaration: true,
          memberVariableDeclaration: true,
        },
      ],
      "jsdoc/require-jsdoc": ["error", { require: { FunctionDeclaration: true } }],
      "jsdoc/require-param": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/require-returns": "error",
      "jsdoc/require-returns-description": "error",
      "jsdoc/no-types": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "test/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^\\.{1,2}/", message: "Import through the @core, @ui or @test alias, not a relative path." },
          ],
        },
      ],
    },
  },
  {
    files: ["test/**/*.{ts,tsx}", "*.config.{js,ts}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
);
