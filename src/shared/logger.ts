import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

let minLevel: LogLevel = (typeof process !== "undefined" && process.env?.AION_DEBUG) ? "debug" : "warn"

export function setLogLevel(level: LogLevel): void {
  minLevel = level
}

export function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return
  const ts = new Date().toISOString()
  const tail = extra ? ` ${JSON.stringify(extra)}` : ""
  const line = `[aion][${ts}][${level}] ${message}${tail}`
  if (level === "error" || level === "warn") {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export function debug(msg: string, extra?: Record<string, unknown>): void {
  log("debug", msg, extra)
}
export function info(msg: string, extra?: Record<string, unknown>): void {
  log("info", msg, extra)
}
export function warn(msg: string, extra?: Record<string, unknown>): void {
  log("warn", msg, extra)
}
export function error(msg: string, extra?: Record<string, unknown>): void {
  log("error", msg, extra)
}

export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

export function ensureDirForFile(path: string): void {
  ensureDir(dirname(path))
}

export function readIfExists(path: string): string | undefined {
  if (!existsSync(path)) return undefined
  const { readFileSync } = require("node:fs") as typeof import("node:fs")
  return readFileSync(path, "utf-8")
}

export function writeFileEnsuringDir(path: string, content: string): void {
  ensureDirForFile(path)
  writeFileSync(path, content, "utf-8")
}

export function appendToFile(path: string, content: string): void {
  ensureDirForFile(path)
  appendFileSync(path, content, "utf-8")
}
