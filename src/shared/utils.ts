export function nowIso(): string {
  return new Date().toISOString()
}

export function nowTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

export function resolvePath(directory: string, relative: string): string {
  if (relative.startsWith("/") || /^[a-zA-Z]:/.test(relative)) {
    return relative
  }
  const sep = directory.endsWith("/") ? "" : "/"
  return `${directory}${sep}${relative}`
}

export function isSubPath(parent: string, child: string): boolean {
  const a = parent.replace(/\/+$/g, "")
  const b = child.replace(/\/+$/g, "")
  if (a === b) return true
  return b.startsWith(a + "/")
}

export function matchAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n))
}
