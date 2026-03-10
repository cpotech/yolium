import { describe, it, expect } from 'vitest'
import { normalizeSvgToDataUri } from '@main/docker/svg-normalize'

describe('normalizeSvgToDataUri', () => {
  it('should convert a single inline <svg> block to a markdown image with base64 data URI', () => {
    const svg = '<svg width="100" height="100"><rect width="100" height="100" fill="red"/></svg>'
    const result = normalizeSvgToDataUri(svg)
    const expected = Buffer.from(svg).toString('base64')
    expect(result).toBe(`![SVG](data:image/svg+xml;base64,${expected})`)
  })

  it('should convert multiple inline <svg> blocks in the same text', () => {
    const svg1 = '<svg width="50" height="50"><circle r="25"/></svg>'
    const svg2 = '<svg width="80" height="80"><rect width="80" height="80"/></svg>'
    const input = `First: ${svg1} Second: ${svg2}`
    const result = normalizeSvgToDataUri(input)
    const b64_1 = Buffer.from(svg1).toString('base64')
    const b64_2 = Buffer.from(svg2).toString('base64')
    expect(result).toBe(`First: ![SVG](data:image/svg+xml;base64,${b64_1}) Second: ![SVG](data:image/svg+xml;base64,${b64_2})`)
  })

  it('should preserve text before, between, and after SVG blocks', () => {
    const svg = '<svg><rect/></svg>'
    const input = `Before text\n\n${svg}\n\nAfter text`
    const result = normalizeSvgToDataUri(input)
    const b64 = Buffer.from(svg).toString('base64')
    expect(result).toBe(`Before text\n\n![SVG](data:image/svg+xml;base64,${b64})\n\nAfter text`)
  })

  it('should handle SVG with nested elements (rect, text, circle)', () => {
    const svg = '<svg width="200" height="200"><rect x="10" y="10" width="80" height="80" fill="blue"/><text x="50" y="50">Hello</text><circle cx="150" cy="150" r="40" fill="green"/></svg>'
    const result = normalizeSvgToDataUri(svg)
    const b64 = Buffer.from(svg).toString('base64')
    expect(result).toBe(`![SVG](data:image/svg+xml;base64,${b64})`)
  })

  it('should handle SVG with single-quoted attributes', () => {
    const svg = "<svg width='100' height='100'><rect fill='red'/></svg>"
    const result = normalizeSvgToDataUri(svg)
    const b64 = Buffer.from(svg).toString('base64')
    expect(result).toBe(`![SVG](data:image/svg+xml;base64,${b64})`)
  })

  it('should handle SVG with no attributes', () => {
    const svg = '<svg><rect/></svg>'
    const result = normalizeSvgToDataUri(svg)
    const b64 = Buffer.from(svg).toString('base64')
    expect(result).toBe(`![SVG](data:image/svg+xml;base64,${b64})`)
  })

  it('should handle multiline SVG blocks', () => {
    const svg = `<svg width="100" height="100">
  <rect
    x="0" y="0"
    width="100" height="100"
    fill="blue"
  />
</svg>`
    const result = normalizeSvgToDataUri(svg)
    const b64 = Buffer.from(svg).toString('base64')
    expect(result).toBe(`![SVG](data:image/svg+xml;base64,${b64})`)
  })

  it('should not modify text that contains no SVG', () => {
    const input = 'This is just regular markdown text with **bold** and *italic*.'
    expect(normalizeSvgToDataUri(input)).toBe(input)
  })

  it('should not modify markdown image syntax that already uses data:image/svg+xml', () => {
    const b64 = Buffer.from('<svg><rect/></svg>').toString('base64')
    const input = `![SVG](data:image/svg+xml;base64,${b64})`
    expect(normalizeSvgToDataUri(input)).toBe(input)
  })

  it('should handle SVG with XML namespace declaration', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>'
    const result = normalizeSvgToDataUri(svg)
    const b64 = Buffer.from(svg).toString('base64')
    expect(result).toBe(`![SVG](data:image/svg+xml;base64,${b64})`)
  })

  it('should handle SVG with CDATA sections', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA[rect { fill: red; }]]></style><rect width="100" height="100"/></svg>'
    const result = normalizeSvgToDataUri(svg)
    const b64 = Buffer.from(svg).toString('base64')
    expect(result).toBe(`![SVG](data:image/svg+xml;base64,${b64})`)
  })

  it('should return the original string unchanged when SVG is malformed (unclosed tag)', () => {
    const input = 'Here is a broken SVG: <svg width="100"><rect fill="red"/>'
    expect(normalizeSvgToDataUri(input)).toBe(input)
  })
})
