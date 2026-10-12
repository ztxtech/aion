/**
 * V1 → V2 tool adapter.
 *
 * OpenCode V2 dropped the `tool()` helper and switched tool definitions
 * from zod parameters to plain JSON-schema input objects. This adapter
 * converts the V1 `tool()` output (with zod args) into the V2 shape so
 * the existing AION tool modules do not need a full rewrite.
 */
import { z } from "zod"

type V1ToolDef = {
  description: string
  args?: Record<string, z.ZodTypeAny>
  execute: (args: Record<string, unknown>, context?: unknown) => Promise<string> | string
}

type JsonSchemaProperty = Record<string, unknown>

export type V2ToolDefinition = {
  name: string
  description: string
  input: JsonSchemaProperty
  options: { codemode: boolean }
  execute: (args: Record<string, unknown>, context?: unknown) => Promise<{ content: string }>
}

function zodToJsonSchema(zodType: z.ZodTypeAny): JsonSchemaProperty {
  if (zodType instanceof z.ZodString) {
    const schema: JsonSchemaProperty = { type: "string" }
    const desc = (zodType as unknown as { description?: string }).description
    if (desc) schema.description = desc
    return schema
  }
  if (zodType instanceof z.ZodNumber) {
    const schema: JsonSchemaProperty = { type: "number" }
    const desc = (zodType as unknown as { description?: string }).description
    if (desc) schema.description = desc
    return schema
  }
  if (zodType instanceof z.ZodBoolean) {
    const schema: JsonSchemaProperty = { type: "boolean" }
    const desc = (zodType as unknown as { description?: string }).description
    if (desc) schema.description = desc
    return schema
  }
  if (zodType instanceof z.ZodEnum) {
    const values = (zodType as unknown as { values: readonly string[] }).values
    const schema: JsonSchemaProperty = { type: "string", enum: [...values] }
    const desc = (zodType as unknown as { description?: string }).description
    if (desc) schema.description = desc
    return schema
  }
  if (zodType instanceof z.ZodArray) {
    const inner = (zodType as unknown as { element: z.ZodTypeAny }).element
    const schema: JsonSchemaProperty = { type: "array", items: zodToJsonSchema(inner) }
    const desc = (zodType as unknown as { description?: string }).description
    if (desc) schema.description = desc
    return schema
  }
  if (zodType instanceof z.ZodOptional || zodType instanceof z.ZodNullable) {
    const inner = (zodType as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType
    return zodToJsonSchema(inner)
  }
  if (zodType instanceof z.ZodDefault) {
    const inner = (zodType as unknown as { _def: { innerType: z.ZodTypeAny; defaultValue: () => unknown } })._def
    const schema = zodToJsonSchema(inner.innerType)
    schema.default = inner.defaultValue()
    return schema
  }
  if (zodType instanceof z.ZodObject) {
    const shape = zodType.shape as Record<string, z.ZodTypeAny>
    const props: Record<string, JsonSchemaProperty> = {}
    const required: string[] = []
    for (const [key, value] of Object.entries(shape)) {
      props[key] = zodToJsonSchema(value)
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key)
      }
    }
    return { type: "object", properties: props, ...(required.length ? { required } : {}) }
  }
  return { type: "string" }
}

export function v2Tool(name: string, def: V1ToolDef) {
  const input = zodToJsonSchema(z.object(def.args ?? {}))
  return {
    name,
    description: def.description,
    input,
    options: { codemode: false },
    execute: async (args: Record<string, unknown>, context?: unknown) => {
      const result = await def.execute(args ?? {}, context)
      return { content: typeof result === "string" ? result : JSON.stringify(result) }
    },
  }
}
