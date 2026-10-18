// Evaluates + - * / with parentheses and unary signs; null if malformed.
function evaluate(text: string): number | null {
  const tokens = text.match(/\d*\.?\d+(?:e[+-]?\d+)?|\d+\.|[-+*/()]|\S/gi) ?? [];
  let i = 0;

  const primary = (): number | null => {
    const tok = tokens[i++];
    if (tok === '-') return negate(primary());
    if (tok === '+') return primary();
    if (tok === '(') {
      const v = sum();
      return tokens[i++] === ')' ? v : null;
    }
    const v = Number(tok);
    return tok !== undefined && Number.isFinite(v) ? v : null;
  };
  const negate = (v: number | null) => (v === null ? null : -v);

  const product = (): number | null => {
    let v = primary();
    while (v !== null && (tokens[i] === '*' || tokens[i] === '/')) {
      const op = tokens[i++];
      const r = primary();
      v = r === null ? null : op === '*' ? v * r : v / r;
    }
    return v;
  };
  const sum = (): number | null => {
    let v = product();
    while (v !== null && (tokens[i] === '+' || tokens[i] === '-')) {
      const op = tokens[i++];
      const r = product();
      v = r === null ? null : op === '+' ? v + r : v - r;
    }
    return v;
  };

  const v = sum();
  return v !== null && i === tokens.length && Number.isFinite(v) ? v : null;
}

// Numeric parse that accepts arithmetic ("100+200"); empty or invalid input returns null.
export const parseNumber = (text: string) => {
  if (text.trim() === '') return null;
  const v = Number(text);
  return Number.isFinite(v) ? v : evaluate(text);
};
