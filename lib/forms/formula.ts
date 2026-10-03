/**
 * Safe formula evaluation for computed number questions (`{q_price} * {q_qty}`).
 * No eval: references are substituted, then a tiny recursive-descent parser
 * handles + - * / ( ) and decimal numbers. Anything else fails closed.
 */

const REF_PATTERN = /\{([A-Za-z0-9_-]+)\}/g;
/** Magnitudes beyond this fail instead of storing infinities. */
const MAX_MAGNITUDE = 1e12;

export function extractFormulaRefs(formula: string): string[] {
  const refs: string[] = [];
  for (const m of formula.matchAll(REF_PATTERN)) {
    if (m[1] && !refs.includes(m[1])) refs.push(m[1]);
  }
  return refs;
}

export function evaluateFormula(
  formula: string,
  values: Record<string, number>,
): { ok: true; value: number } | { ok: false; error: string } {
  const refs = extractFormulaRefs(formula);
  if (refs.length === 0) return { ok: false, error: "The formula needs a {question} reference." };
  let expr = formula;
  for (const ref of refs) {
    const v = values[ref];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return { ok: false, error: "A referenced answer isn't available yet." };
    }
    expr = expr.split(`{${ref}}`).join(`(${v})`);
  }
  // After substitution only arithmetic may remain.
  if (!/^[0-9+\-*/().\s]+$/.test(expr) || expr.trim() === "") {
    return { ok: false, error: "The formula has unsupported characters." };
  }
  try {
    const value = parseExpression(expr);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, error: "The formula doesn't compute to a number." };
    }
    if (Math.abs(value) > MAX_MAGNITUDE) {
      return { ok: false, error: "The computed value is too large." };
    }
    // Tidy float dust (0.1 + 0.2) without rounding real decimals away.
    return { ok: true, value: Math.round(value * 1e9) / 1e9 };
  } catch {
    return { ok: false, error: "The formula couldn't be computed." };
  }
}

function tokenize(src: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if ("+-*/()".includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j] as string)) j++;
      tokens.push(src.slice(i, j));
      i = j;
      continue;
    }
    throw new Error(`bad char ${c}`);
  }
  return tokens;
}

/** expr := term (("+" | "-") term)* — throws on malformed input. */
function parseExpression(src: string): number {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = (): string | undefined => tokens[pos];
  const next = (): string => {
    const t = tokens[pos];
    pos++;
    if (t === undefined) throw new Error("unexpected end");
    return t;
  };
  function parseExpr(): number {
    let v = parseTerm();
    for (;;) {
      const op = peek();
      if (op !== "+" && op !== "-") return v;
      next();
      const rhs = parseTerm();
      v = op === "+" ? v + rhs : v - rhs;
    }
  }
  function parseTerm(): number {
    let v = parseFactor();
    for (;;) {
      const op = peek();
      if (op !== "*" && op !== "/") return v;
      next();
      const rhs = parseFactor();
      if (op === "/") {
        if (rhs === 0) throw new Error("division by zero");
        v = v / rhs;
      } else {
        v = v * rhs;
      }
    }
  }
  function parseFactor(): number {
    const t = next();
    if (t === "(") {
      const v = parseExpr();
      if (next() !== ")") throw new Error("unbalanced paren");
      return v;
    }
    if (t === "-") return -parseFactor();
    if (/^[0-9]*\.?[0-9]+$/.test(t) && t !== "." && t !== "") return Number(t);
    throw new Error(`bad token ${t}`);
  }
  const value = parseExpr();
  if (pos !== tokens.length) throw new Error("trailing input");
  return value;
}
