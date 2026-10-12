// Type declarations for Bun's text import attribute
// `import x from "./file.md" with { type: "text" }`
declare module "*.md" {
  const content: string
  export default content
}