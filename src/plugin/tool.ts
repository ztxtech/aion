/**
 * V1-compatible `tool()` shim backed by the V2 adapter.
 *
 * Existing AION tool modules import `tool` from here instead of
 * `@opencode/plugin`, keeping the V1 call signature:
 *   tool({ description, args: { zod }, execute })
 * The adapter converts the result to the V2 plugin shape at export time.
 */
import { z } from "zod"
import { v2Tool } from "./tool-adapter"

type V1ToolInput = {
  description: string
  args?: Record<string, z.ZodTypeAny>
  execute: (args: Record<string, unknown>, context?: unknown) => Promise<string> | string
}

export type ShimTool = { __v1: true; input: V1ToolInput }
export type ShimToolRecord = Record<string, ShimTool>

export function tool(input: V1ToolInput) {
  return { __v1: true, input }
}

tool.schema = z

export { v2Tool }
