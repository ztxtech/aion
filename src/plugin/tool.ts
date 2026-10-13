/**
 * V2-native AION tool definition helper.
 *
 * AION tools are authored with Zod for input validation, but the object
 * returned here is already an OpenCode V2 Tool.Info body. The aggregator
 * supplies the registry key as `name` when calling editor.add().
 */
import { z } from "zod"
import type { Tool } from "@opencode/schema/tool"

type ToolDefinitionInput<Args extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>> = {
  description: string
  args?: Args
  schema?: z.ZodType<z.output<z.ZodObject<Args>>>
  execute: (args: z.output<z.ZodObject<Args>>, context: unknown) => Promise<string> | string
}

export type AionToolBody = {
  description: string
  input: z.ZodTypeAny
  options: Tool.Options
  execute: (input: unknown, context: unknown) => Promise<Tool.Result<undefined>>
}
export type AionTool = AionToolBody & { name: string }

export function tool<Args extends Record<string, z.ZodTypeAny>>(
  definition: ToolDefinitionInput<Args>,
): AionToolBody {
  return {
    description: definition.description,
    input: definition.schema ?? z.object(definition.args ?? {}),
    options: { permission: "aion", codemode: false },
    async execute(input, context) {
      const result = await definition.execute(input as z.output<z.ZodObject<Args>>, context)
      return { content: result }
    },
  }
}

tool.schema = z
