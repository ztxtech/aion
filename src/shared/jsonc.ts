import { readFileSync } from "node:fs"

export type JsoncParseResult<T = unknown> = {
  ok: boolean
  value?: T
  error?: string
}

export function parseJsonc(input: string): JsoncParseResult {
  try {
    const stripped = stripJsonc(input)
    const value = JSON.parse(stripped)
    return { ok: true, value }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function parseJsoncFile<T = unknown>(path: string): JsoncParseResult<T> {
  let raw: string
  try {
    raw = readFileSync(path, "utf-8")
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
  return parseJsonc(raw) as JsoncParseResult<T>
}

export function stripJsonc(input: string): string {
  let out = ""
  let inString = false
  let stringChar = ""
  let i = 0

  while (i < input.length) {
    const ch = input[i]
    const next = input[i + 1] ?? ""

    if (inString) {
      out += ch
      if (ch === "\\" && i + 1 < input.length) {
        out += next
        i += 2
        continue
      }
      if (ch === stringChar) {
        inString = false
      }
      i++
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = true
      stringChar = ch
      out += ch
      i++
      continue
    }

    if (ch === "/" && next === "/") {
      while (i < input.length && input[i] !== "\n") i++
      continue
    }

    if (ch === "/" && next === "*") {
      i += 2
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i++
      i += 2
      continue
    }

    out += ch
    i++
  }

  return removeTrailingCommas(out)
}

function removeTrailingCommas(input: string): string {
  return input
    .replace(/,(\s*[}\]])/g, "$1")
}
