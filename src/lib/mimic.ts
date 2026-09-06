export type StyleFingerprint = {
  warmth: number
  saturation: number
  brightness: number
  contrast: number
  shadowLift: number
  highlightSoftness: number
  grain: number
  red: number
  green: number
  blue: number
  sampleCount: number
}

export type EditControls = {
  strength: number
  warmer: number
  softer: number
  film: number
  color: number
}

export type ImageStats = {
  meanLuma: number
  contrast: number
  meanSaturation: number
  warmth: number
  meanRed: number
  meanGreen: number
  meanBlue: number
  shadowMean: number
  highlightMean: number
}

export type MatchMetrics = {
  color: number
  skin: number
  contrast: number
  overall: number
  referenceColor: string
  originalColor: string
  matchedColor: string
  referenceSkinColor: string
  originalSkinColor: string
  matchedSkinColor: string
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

const srgbToLinear = (value: number) => {
  const normalized = value / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

const toLuma = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

const hashNoise = (x: number, y: number, seed: number) => {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453
  return value - Math.floor(value)
}

export const loadImage = (source: string | File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('This image could not be read.'))
    image.src = typeof source === 'string' ? source : URL.createObjectURL(source)
  })

const drawForAnalysis = (image: HTMLImageElement) => {
  const maxDimension = 96
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return { canvas, data: context.getImageData(0, 0, canvas.width, canvas.height).data }
}

export const analyzeImage = (image: HTMLImageElement): ImageStats => {
  const { data } = drawForAnalysis(image)
  let lumaSum = 0
  let squaredLumaSum = 0
  let saturationSum = 0
  let warmthSum = 0
  let redSum = 0
  let greenSum = 0
  let blueSum = 0
  let shadowSum = 0
  let shadowCount = 0
  let highlightSum = 0
  let highlightCount = 0
  let count = 0

  for (let index = 0; index < data.length; index += 16) {
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const luma = toLuma(r, g, b)
    const max = Math.max(r, g, b) / 255
    const min = Math.min(r, g, b) / 255
    lumaSum += luma
    squaredLumaSum += luma * luma
    saturationSum += max === 0 ? 0 : (max - min) / max
    warmthSum += (r - b) / 255
    redSum += r / 255
    greenSum += g / 255
    blueSum += b / 255
    if (luma < 0.35) {
      shadowSum += luma
      shadowCount += 1
    }
    if (luma > 0.68) {
      highlightSum += luma
      highlightCount += 1
    }
    count += 1
  }

  const meanLuma = lumaSum / count
  return {
    meanLuma,
    contrast: Math.sqrt(Math.max(0, squaredLumaSum / count - meanLuma ** 2)),
    meanSaturation: saturationSum / count,
    warmth: warmthSum / count,
    meanRed: redSum / count,
    meanGreen: greenSum / count,
    meanBlue: blueSum / count,
    shadowMean: shadowCount ? shadowSum / shadowCount : meanLuma,
    highlightMean: highlightCount ? highlightSum / highlightCount : meanLuma,
  }
}

export const fingerprintFromStats = (stats: ImageStats[]): StyleFingerprint => {
  const average = (key: keyof ImageStats) => stats.reduce((sum, item) => sum + item[key], 0) / Math.max(1, stats.length)
  const shadowLift = clamp((average('shadowMean') - 0.18) / 0.28, 0, 1)
  const highlightSoftness = clamp(1 - (average('highlightMean') - 0.68) / 0.32, 0, 1)
  const grain = clamp(0.12 + average('contrast') * 0.8 + average('meanSaturation') * 0.25, 0, 1)
  return {
    warmth: average('warmth'),
    saturation: average('meanSaturation'),
    brightness: average('meanLuma'),
    contrast: average('contrast'),
    shadowLift,
    highlightSoftness,
    grain,
    red: average('meanRed'),
    green: average('meanGreen'),
    blue: average('meanBlue'),
    sampleCount: stats.length,
  }
}

const colorString = (red: number, green: number, blue: number) => `rgb(${Math.round(clamp(red) * 255)}, ${Math.round(clamp(green) * 255)}, ${Math.round(clamp(blue) * 255)})`
const skinColorString = (warmth: number, brightness: number, saturation: number) => {
  const base = clamp(0.46 + brightness * 0.32)
  return colorString(base + warmth * 0.62 + saturation * 0.07, base * 0.72 + saturation * 0.04, base * 0.56 - warmth * 0.14)
}

const blend = (from: number, to: number, amount: number) => from + (to - from) * clamp(amount)

export const getMatchMetrics = (fingerprint: StyleFingerprint, target: ImageStats, controls: EditControls): MatchMetrics => {
  const strength = clamp(controls.strength / 100)
  const matched = {
    brightness: blend(target.meanLuma, fingerprint.brightness, strength * 0.72),
    saturation: blend(target.meanSaturation, fingerprint.saturation, strength * 0.55),
    warmth: blend(target.warmth, fingerprint.warmth, strength * 0.62) + controls.warmer * 0.0028,
    contrast: blend(target.contrast, fingerprint.contrast, strength * 0.58) - controls.softer * 0.0014,
    red: blend(target.meanRed, fingerprint.red, strength * 0.62),
    green: blend(target.meanGreen, fingerprint.green, strength * 0.62),
    blue: blend(target.meanBlue, fingerprint.blue, strength * 0.62),
  }
  const colorDistance = Math.sqrt((matched.red - fingerprint.red) ** 2 + (matched.green - fingerprint.green) ** 2 + (matched.blue - fingerprint.blue) ** 2)
  const originalDistance = Math.sqrt((target.meanRed - fingerprint.red) ** 2 + (target.meanGreen - fingerprint.green) ** 2 + (target.meanBlue - fingerprint.blue) ** 2)
  const color = clamp(1 - colorDistance * 2.4)
  const warmthMatch = clamp(1 - Math.abs(matched.warmth - fingerprint.warmth) * 4.2)
  const skin = clamp(warmthMatch * 0.58 + clamp(1 - Math.abs(matched.brightness - fingerprint.brightness) * 1.8) * 0.42)
  const contrast = clamp(1 - Math.abs(matched.contrast - fingerprint.contrast) * 4.2)
  const overall = clamp(color * 0.48 + skin * 0.32 + contrast * 0.2)
  return {
    color,
    skin,
    contrast,
    overall,
    referenceColor: colorString(fingerprint.red, fingerprint.green, fingerprint.blue),
    originalColor: colorString(target.meanRed, target.meanGreen, target.meanBlue),
    matchedColor: colorString(matched.red, matched.green, matched.blue),
    referenceSkinColor: skinColorString(fingerprint.warmth, fingerprint.brightness, fingerprint.saturation),
    originalSkinColor: skinColorString(target.warmth, target.meanLuma, target.meanSaturation),
    matchedSkinColor: skinColorString(matched.warmth, matched.brightness, matched.saturation),
  }
}

const resizeForOutput = (image: HTMLImageElement) => {
  const maxDimension = 2400
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  return { width: Math.max(1, Math.round(image.naturalWidth * scale)), height: Math.max(1, Math.round(image.naturalHeight * scale)) }
}

export const applyMimic = (image: HTMLImageElement, fingerprint: StyleFingerprint, controls: EditControls) => {
  const { width, height } = resizeForOutput(image)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, 0, 0, width, height)
  const frame = context.getImageData(0, 0, width, height)
  const data = frame.data
  const sourceStats = analyzeImage(image)
  const strength = clamp(controls.strength / 100)
  const warmth = fingerprint.warmth * 0.42 + controls.warmer * 0.0028
  const contrastDelta = (fingerprint.contrast - sourceStats.contrast) * 0.72 + controls.softer * -0.0014
  const saturationDelta = (fingerprint.saturation - sourceStats.meanSaturation) * 0.42 + controls.color * 0.003
  const brightnessDelta = (fingerprint.brightness - sourceStats.meanLuma) * 0.45
  const shadowTarget = fingerprint.shadowLift * 0.16 + controls.softer * 0.0009
  const filmAmount = controls.film / 100
  const softness = clamp(fingerprint.highlightSoftness * 0.16 + Math.max(0, controls.softer) * 0.0016)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const originalR = data[index] / 255
      const originalG = data[index + 1] / 255
      const originalB = data[index + 2] / 255
      const originalLuma = 0.2126 * originalR + 0.7152 * originalG + 0.0722 * originalB
      let luma = clamp(originalLuma + brightnessDelta * strength)
      const adaptedContrast = 1 + contrastDelta * strength * 2.2
      luma = clamp((luma - 0.5) * adaptedContrast + 0.5)
      luma = clamp(luma + (1 - luma) * shadowTarget * strength)
      luma = clamp(luma - Math.max(0, luma - 0.78) * softness * strength)

      const colorScale = originalLuma > 0.001 ? luma / originalLuma : 1
      let r = originalR * colorScale
      let g = originalG * colorScale
      let b = originalB * colorScale
      r += warmth * strength
      g += warmth * strength * 0.08
      b -= warmth * strength * 0.8
      const mean = (r + g + b) / 3
      const saturationScale = 1 + saturationDelta * strength * 2.3
      r = mean + (r - mean) * saturationScale
      g = mean + (g - mean) * saturationScale
      b = mean + (b - mean) * saturationScale

      const edgeX = x / Math.max(1, width - 1) - 0.5
      const edgeY = y / Math.max(1, height - 1) - 0.5
      const vignette = 1 - Math.max(0, Math.sqrt(edgeX * edgeX + edgeY * edgeY) - 0.25) * 0.18 * filmAmount * strength
      const grain = (hashNoise(x, y, width + height) - 0.5) * 0.055 * filmAmount * strength
      data[index] = clamp((r * vignette + grain) * 255, 0, 255)
      data[index + 1] = clamp((g * vignette + grain) * 255, 0, 255)
      data[index + 2] = clamp((b * vignette + grain) * 255, 0, 255)
    }
  }

  context.putImageData(frame, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.92)
}

export const formatStyleTags = (fingerprint: StyleFingerprint) => {
  const tags: string[] = []
  if (fingerprint.warmth > 0.045) tags.push('Warm highlights')
  if (fingerprint.warmth < -0.04) tags.push('Cool shadows')
  if (fingerprint.contrast < 0.19) tags.push('Soft contrast')
  if (fingerprint.contrast > 0.29) tags.push('Defined contrast')
  if (fingerprint.shadowLift > 0.48) tags.push('Lifted blacks')
  if (fingerprint.saturation < 0.2) tags.push('Muted color')
  if (fingerprint.saturation > 0.32) tags.push('Rich color')
  if (fingerprint.grain > 0.34) tags.push('Film texture')
  return tags.length ? tags.slice(0, 4) : ['Balanced color', 'Natural contrast']
}
