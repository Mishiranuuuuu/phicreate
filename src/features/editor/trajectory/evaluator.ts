// Safe and fast mathematical expression evaluator for curve trajectory generation.

const ALLOWED_MATH = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'sqrt', 'cbrt', 'abs', 'min',
  'max', 'round', 'floor', 'ceil', 'exp', 'log', 'pow', 'hypot',
]);

const FORBIDDEN_WORDS = new Set([
  'window', 'document', 'globalThis', 'global', 'process', 'console',
  'eval', 'function', 'import', 'export', 'constructor', 'prototype',
  'var', 'let', 'const', 'return', 'class', 'delete', 'void', 'typeof',
]);

export function compileExpression(
  expression: string,
): (scope: Record<string, number>) => number {
  const trimmed = expression.trim();
  if (!trimmed) return () => 0;

  // Reject dangerous tokens
  const identifiers = trimmed.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) ?? [];
  for (const id of identifiers) {
    if (FORBIDDEN_WORDS.has(id)) {
      throw new Error(`Forbidden identifier in expression: "${id}"`);
    }
  }

  // Replace ^ with ** for exponentiation
  let transformed = trimmed.replace(/\^/g, '**');

  // Replace constants case-insensitively
  transformed = transformed
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/\btau\b/gi, '(Math.PI * 2)')
    .replace(/\be\b/gi, 'Math.E');

  // Prefix allowed Math functions
  for (const fn of ALLOWED_MATH) {
    const re = new RegExp(`\\b${fn}\\b(?=\\s*\\()`, 'g');
    transformed = transformed.replace(re, `Math.${fn}`);
  }

  const scopeVars = Array.from(
    new Set(
      identifiers.filter(
        (id) =>
          !ALLOWED_MATH.has(id) &&
          id.toLowerCase() !== 'pi' &&
          id.toLowerCase() !== 'tau' &&
          id.toLowerCase() !== 'e' &&
          id !== 'Math',
      ),
    ),
  );

  const destructuring =
    scopeVars.length > 0
      ? `const { ${scopeVars.map((v) => `${v} = 0`).join(', ')} } = scope;\n`
      : '';

  try {
    // Compile to an isolated evaluator without with()
    const compiled = new Function(
      'Math',
      'scope',
      `"use strict";\n${destructuring}return (${transformed});`,
    );

    return (scope: Record<string, number>) => {
      try {
        const result = Number(compiled(Math, scope));
        return Number.isFinite(result) ? result : 0;
      } catch {
        return 0;
      }
    };
  } catch (err) {
    throw new Error(`Invalid mathematical expression: ${(err as Error).message}`);
  }
}
