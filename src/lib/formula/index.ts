/**
 * DSL segura para fórmulas urbanísticas (recuos, outorga).
 *
 * Gramática (ver docs/adr/0006):
 *   expr    := term (("+" | "-") term)*
 *   term    := unary (("*" | "/") unary)*
 *   unary   := "-" unary | primary
 *   primary := NUMBER | VARIABLE | FUNC "(" expr ("," expr)* ")" | "(" expr ")"
 *
 * Números usam ponto decimal ("2.5"); a vírgula separa argumentos.
 * Só variáveis e funções da lista branca. Nada é executado como código.
 */

export const VARIABLES = {
  H: "altura da edificação (m)",
  P: "número de pavimentos",
  A: "área do terreno (m²)",
  T: "testada principal (m)",
} as const

export type Variable = keyof typeof VARIABLES

export const FUNCTIONS = {
  min: { minArgs: 2, description: "menor valor" },
  max: { minArgs: 2, description: "maior valor" },
  floor: { minArgs: 1, maxArgs: 1, description: "arredonda para baixo" },
  ceil: { minArgs: 1, maxArgs: 1, description: "arredonda para cima" },
  round: { minArgs: 1, maxArgs: 1, description: "arredonda para o inteiro mais próximo" },
} as const satisfies Record<string, { minArgs: number; maxArgs?: number; description: string }>

export type FunctionName = keyof typeof FUNCTIONS

export type Expr =
  | { type: "num"; value: number }
  | { type: "var"; name: Variable }
  | { type: "neg"; arg: Expr }
  | { type: "bin"; op: "+" | "-" | "*" | "/"; left: Expr; right: Expr }
  | { type: "call"; fn: FunctionName; args: Expr[] }

export const MAX_FORMULA_LENGTH = 200
const MAX_DEPTH = 32

export class FormulaError extends Error {
  readonly position: number | null

  constructor(message: string, position: number | null = null) {
    super(message)
    this.name = "FormulaError"
    this.position = position
  }
}

// Tokenizador ------------------------------------------------------------------

type Token =
  | { kind: "num"; value: number; pos: number }
  | { kind: "ident"; value: string; pos: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/"; pos: number }
  | { kind: "lparen" | "rparen" | "comma"; pos: number }
  | { kind: "end"; pos: number }

function isDigit(c: string) {
  return c >= "0" && c <= "9"
}

function isIdentStart(c: string) {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_"
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === " " || c === "\t") {
      i++
      continue
    }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
      const start = i
      while (i < src.length && isDigit(src[i]!)) i++
      if (src[i] === ".") {
        i++
        while (i < src.length && isDigit(src[i]!)) i++
      }
      // "2,5" logo após um número costuma ser vírgula decimal digitada por engano.
      if (src[i] === "," && isDigit(src[i + 1] ?? "") && !isInsideCall(tokens)) {
        throw new FormulaError(
          `Use ponto como separador decimal (ex.: ${src.slice(start, i)}.${src[i + 1]}).`,
          i,
        )
      }
      tokens.push({ kind: "num", value: Number(src.slice(start, i)), pos: start })
      continue
    }
    if (isIdentStart(c)) {
      const start = i
      while (i < src.length && (isIdentStart(src[i]!) || isDigit(src[i]!))) i++
      tokens.push({ kind: "ident", value: src.slice(start, i), pos: start })
      continue
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ kind: "op", value: c, pos: i++ })
      continue
    }
    if (c === "(") {
      tokens.push({ kind: "lparen", pos: i++ })
      continue
    }
    if (c === ")") {
      tokens.push({ kind: "rparen", pos: i++ })
      continue
    }
    if (c === ",") {
      tokens.push({ kind: "comma", pos: i++ })
      continue
    }
    throw new FormulaError(`Caractere não permitido: "${c}".`, i)
  }
  tokens.push({ kind: "end", pos: src.length })
  return tokens
}

/** Há parêntese de função aberto? (vírgula ali é separador de argumentos). */
function isInsideCall(tokens: Token[]) {
  let depth = 0
  for (const t of tokens) {
    if (t.kind === "lparen") depth++
    else if (t.kind === "rparen") depth--
  }
  return depth > 0
}

// Parser (descida recursiva) --------------------------------------------------

class Parser {
  private i = 0
  private depth = 0

  constructor(private readonly tokens: Token[]) {}

  parse(): Expr {
    const expr = this.expr()
    const t = this.peek()
    if (t.kind !== "end") {
      throw new FormulaError("Trecho inesperado depois do fim da fórmula.", t.pos)
    }
    return expr
  }

  private peek(): Token {
    return this.tokens[this.i]!
  }

  private next(): Token {
    return this.tokens[this.i++]!
  }

  private enter(pos: number) {
    if (++this.depth > MAX_DEPTH) {
      throw new FormulaError("Fórmula aninhada demais.", pos)
    }
  }

  private expr(): Expr {
    let left = this.term()
    for (
      let t = this.peek();
      t.kind === "op" && (t.value === "+" || t.value === "-");
      t = this.peek()
    ) {
      this.next()
      left = { type: "bin", op: t.value, left, right: this.term() }
    }
    return left
  }

  private term(): Expr {
    let left = this.unary()
    for (
      let t = this.peek();
      t.kind === "op" && (t.value === "*" || t.value === "/");
      t = this.peek()
    ) {
      this.next()
      left = { type: "bin", op: t.value, left, right: this.unary() }
    }
    return left
  }

  private unary(): Expr {
    const t = this.peek()
    if (t.kind === "op" && t.value === "-") {
      this.next()
      this.enter(t.pos)
      const arg = this.unary()
      this.depth--
      return { type: "neg", arg }
    }
    return this.primary()
  }

  private primary(): Expr {
    const t = this.next()
    switch (t.kind) {
      case "num":
        return { type: "num", value: t.value }
      case "lparen": {
        this.enter(t.pos)
        const inner = this.expr()
        this.expect("rparen", "Falta fechar parêntese.")
        this.depth--
        return inner
      }
      case "ident":
        return this.identifier(t.value, t.pos)
      case "end":
        throw new FormulaError("A fórmula terminou antes do esperado.", t.pos)
      default:
        throw new FormulaError("Trecho inesperado na fórmula.", t.pos)
    }
  }

  private identifier(name: string, pos: number): Expr {
    if (this.peek().kind === "lparen") {
      if (!Object.hasOwn(FUNCTIONS, name)) {
        throw new FormulaError(
          `Função desconhecida: "${name}". Use: ${Object.keys(FUNCTIONS).join(", ")}.`,
          pos,
        )
      }
      const fn = name as FunctionName
      this.next()
      this.enter(pos)
      const args = [this.expr()]
      while (this.peek().kind === "comma") {
        this.next()
        args.push(this.expr())
      }
      this.expect("rparen", `Falta fechar o parêntese de ${fn}(…).`)
      this.depth--
      const spec: { minArgs: number; maxArgs?: number } = FUNCTIONS[fn]
      if (
        args.length < spec.minArgs ||
        (spec.maxArgs !== undefined && args.length > spec.maxArgs)
      ) {
        const expected =
          spec.maxArgs === spec.minArgs ? `${spec.minArgs}` : `pelo menos ${spec.minArgs}`
        throw new FormulaError(`${fn}(…) espera ${expected} argumento(s).`, pos)
      }
      return { type: "call", fn, args }
    }
    if (!Object.hasOwn(VARIABLES, name)) {
      throw new FormulaError(
        `Variável desconhecida: "${name}". Use: ${Object.keys(VARIABLES).join(", ")}.`,
        pos,
      )
    }
    return { type: "var", name: name as Variable }
  }

  private expect(kind: Token["kind"], message: string) {
    const t = this.next()
    if (t.kind !== kind) throw new FormulaError(message, t.pos)
  }
}

// API pública ---------------------------------------------------------------------

export function parseFormula(src: string): Expr {
  const trimmed = src.trim()
  if (trimmed.length === 0) throw new FormulaError("Fórmula vazia.", 0)
  if (trimmed.length > MAX_FORMULA_LENGTH) {
    throw new FormulaError(`Fórmula longa demais (máx. ${MAX_FORMULA_LENGTH} caracteres).`, null)
  }
  return new Parser(tokenize(trimmed)).parse()
}

export type ParseResult = { ok: true; expr: Expr } | { ok: false; error: FormulaError }

export function tryParseFormula(src: string): ParseResult {
  try {
    return { ok: true, expr: parseFormula(src) }
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error }
    throw error
  }
}

export type FormulaVariables = Partial<Record<Variable, number>>

export function evaluateFormula(expr: Expr, vars: FormulaVariables = {}): number {
  const value = evaluate(expr, vars)
  if (!Number.isFinite(value)) {
    throw new FormulaError("O resultado da fórmula não é um número finito.")
  }
  return value
}

function evaluate(expr: Expr, vars: FormulaVariables): number {
  switch (expr.type) {
    case "num":
      return expr.value
    case "var": {
      const v = vars[expr.name]
      if (v === undefined || !Number.isFinite(v)) {
        throw new FormulaError(
          `A fórmula precisa de ${expr.name} (${VARIABLES[expr.name]}), que não foi informado.`,
        )
      }
      return v
    }
    case "neg":
      return -evaluate(expr.arg, vars)
    case "bin":
      return applyOperator(expr.op, evaluate(expr.left, vars), evaluate(expr.right, vars))
    case "call":
      return applyFunction(
        expr.fn,
        expr.args.map((a) => evaluate(a, vars)),
      )
  }
}

function applyOperator(op: "+" | "-" | "*" | "/", l: number, r: number): number {
  switch (op) {
    case "+":
      return l + r
    case "-":
      return l - r
    case "*":
      return l * r
    case "/":
      if (r === 0) throw new FormulaError("Divisão por zero na fórmula.")
      return l / r
  }
}

function applyFunction(fn: FunctionName, args: number[]): number {
  switch (fn) {
    case "min":
      return Math.min(...args)
    case "max":
      return Math.max(...args)
    case "floor":
      return Math.floor(args[0]!)
    case "ceil":
      return Math.ceil(args[0]!)
    case "round":
      return Math.round(args[0]!)
  }
}

/** Variáveis usadas pela fórmula (ex.: recuo que depende da altura H). */
export function formulaVariables(expr: Expr): Set<Variable> {
  const out = new Set<Variable>()
  const walk = (e: Expr) => {
    switch (e.type) {
      case "var":
        out.add(e.name)
        break
      case "neg":
        walk(e.arg)
        break
      case "bin":
        walk(e.left)
        walk(e.right)
        break
      case "call":
        e.args.forEach(walk)
        break
    }
  }
  walk(expr)
  return out
}

/** Forma canônica da fórmula (para exibir e comparar). */
export function formatFormula(expr: Expr): string {
  return format(expr, 0)
}

const PRECEDENCE = { "+": 1, "-": 1, "*": 2, "/": 2 } as const

function format(expr: Expr, parentPrec: number): string {
  switch (expr.type) {
    case "num":
      return String(expr.value)
    case "var":
      return expr.name
    case "neg":
      return `-${format(expr.arg, 3)}`
    case "call":
      return `${expr.fn}(${expr.args.map((a) => format(a, 0)).join(", ")})`
    case "bin": {
      const prec = PRECEDENCE[expr.op]
      // O lado direito de "-" e "/" precisa de parênteses com a mesma precedência.
      const right = format(expr.right, expr.op === "-" || expr.op === "/" ? prec + 1 : prec)
      const s = `${format(expr.left, prec)} ${expr.op} ${right}`
      return prec < parentPrec ? `(${s})` : s
    }
  }
}
