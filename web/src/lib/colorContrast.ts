export function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbaFromHex(hex: string, alpha: number): string | null {
  const rgb = parseHexRgb(hex)
  if (!rgb) return null
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`
}

/** Returns #fff or a dark text color for readable text on a #RRGGBB background. */
export function pickContrastingForeground(hex: string): '#ffffff' | '#1c2840' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#1c2840'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  // Relative luminance (sRGB)
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return l > 0.55 ? '#1c2840' : '#ffffff'
}
