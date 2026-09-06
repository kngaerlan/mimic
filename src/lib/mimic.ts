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
  skinWarmth: number
  skinBrightness: number
  skinSaturation: number
  skinCoverage: number
  sampleCount: number
}

export type EditControls = {
  strength: number
  warmer: number
  softer: number
  film: number
  color: number
  flash: number
  clean: number
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
  skinWarmth: number
  skinBrightness: number
  skinSaturation: number
  skinCoverage: number
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

export type FingerprintDefinition = {
  label: string
  description: string
  value: number
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

const isSkinPixel = (red: number, green: number, blue: number) => {
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const saturation = max === 0 ? 0 : (max - min) / max
  return red > 0.22 && green > 0.12 && blue > 0.08 && red > green * 1.04 && green > blue * 1.03 && red - blue > 0.08 && saturation > 0.12 && saturation < 0.78
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
  let skinWarmthSum = 0
  let skinBrightnessSum = 0
  let skinSaturationSum = 0
  let skinCount = 0
  let count = 0

  for (let index = 0; index < data.length; index += 16) {
    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const luma = toLuma(r, g, b)
    const max = Math.max(r, g, b) / 255
    const min = Math.min(r, g, b) / 255
    const saturation = max === 0 ? 0 : (max - min) / max
    lumaSum += luma
    squaredLumaSum += luma * luma
    saturationSum += saturation
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
    if (isSkinPixel(r / 255, g / 255, b / 255)) {
      skinWarmthSum += (r - b) / 255
      skinBrightnessSum += luma
      skinSaturationSum += saturation
      skinCount += 1
    }
    count += 1
  }

  const meanLuma = lumaSum / count
  const skinWarmth = skinCount ? skinWarmthSum / skinCount : warmthSum / count
  const skinBrightness = skinCount ? skinBrightnessSum / skinCount : meanLuma
  const skinSaturation = skinCount ? skinSaturationSum / skinCount : saturationSum / count
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
    skinWarmth,
    skinBrightness,
    skinSaturation,
    skinCoverage: skinCount / Math.max(1, count),
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
    skinWarmth: average('skinWarmth'),
    skinBrightness: average('skinBrightness'),
    skinSaturation: average('skinSaturation'),
    skinCoverage: average('skinCoverage'),
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
  const matchedSkinWarmth = blend(target.skinWarmth, fingerprint.skinWarmth, strength * 0.76) + controls.warmer * 0.0022
  const matchedSkinBrightness = blend(target.skinBrightness, fingerprint.skinBrightness, strength * 0.68) + controls.flash * 0.0008
  const matchedSkinSaturation = blend(target.skinSaturation, fingerprint.skinSaturation, strength * 0.5)
  const skinWarmthMatch = clamp(1 - Math.abs(matchedSkinWarmth - fingerprint.skinWarmth) * 5.4)
  const skinBrightnessMatch = clamp(1 - Math.abs(matchedSkinBrightness - fingerprint.skinBrightness) * 2.8)
  const skinSaturationMatch = clamp(1 - Math.abs(matchedSkinSaturation - fingerprint.skinSaturation) * 3.4)
  const skin = clamp(skinWarmthMatch * 0.48 + skinBrightnessMatch * 0.3 + skinSaturationMatch * 0.22)
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
    referenceSkinColor: skinColorString(fingerprint.skinWarmth, fingerprint.skinBrightness, fingerprint.skinSaturation),
    originalSkinColor: skinColorString(target.skinWarmth, target.skinBrightness, target.skinSaturation),
    matchedSkinColor: skinColorString(matchedSkinWarmth, matchedSkinBrightness, matchedSkinSaturation),
  }
}

const resizeForOutput = (image: HTMLImageElement) => {
  const maxDimension = 1800
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  return { width: Math.max(1, Math.round(image.naturalWidth * scale)), height: Math.max(1, Math.round(image.naturalHeight * scale)) }
}

export const applyMimic = async (image: HTMLImageElement, fingerprint: StyleFingerprint, controls: EditControls) => {
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
  const warmthDelta = fingerprint.warmth - sourceStats.warmth
  const redDelta = fingerprint.red - sourceStats.meanRed
  const greenDelta = fingerprint.green - sourceStats.meanGreen
  const blueDelta = fingerprint.blue - sourceStats.meanBlue
  const contrastDelta = (fingerprint.contrast - sourceStats.contrast) * 0.72 + controls.softer * -0.0014
  const saturationDelta = (fingerprint.saturation - sourceStats.meanSaturation) * 0.42 + controls.color * 0.003
  const brightnessDelta = (fingerprint.brightness - sourceStats.meanLuma) * 0.45
  const shadowTarget = fingerprint.shadowLift * 0.16 + controls.softer * 0.0009
  const cleanAmount = controls.clean / 100
  const filmAmount = (controls.film / 100) * (1 - cleanAmount * 0.92)
  const softness = clamp(fingerprint.highlightSoftness * 0.16 + Math.max(0, controls.softer) * 0.0016)
  const flashAmount = controls.flash / 100
  const skinToneAmount = strength * (fingerprint.skinCoverage > 0.015 && sourceStats.skinCoverage > 0.015 ? 0.58 : 0)
  const skinWarmthDelta = fingerprint.skinWarmth - sourceStats.skinWarmth
  const skinBrightnessDelta = fingerprint.skinBrightness - sourceStats.skinBrightness
  const skinSaturationDelta = fingerprint.skinSaturation - sourceStats.skinSaturation

  const yieldToBrowser = () => new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })

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
      const centerX = x / Math.max(1, width - 1) - 0.5
      const centerY = y / Math.max(1, height - 1) - 0.5
      const centerBias = clamp(1 - Math.sqrt(centerX * centerX + centerY * centerY) * 1.35)
      if (flashAmount) {
        luma = clamp((luma - 0.46) * (1 + flashAmount * 0.42) + 0.46)
        luma = clamp(luma + (1 - luma) * flashAmount * (0.08 + centerBias * 0.18))
      }

      const colorScale = originalLuma > 0.001 ? luma / originalLuma : 1
      let r = originalR * colorScale
      let g = originalG * colorScale
      let b = originalB * colorScale
      r += (redDelta * 0.52 + warmthDelta * 0.16 + controls.warmer * 0.0028) * strength
      g += (greenDelta * 0.52 + warmthDelta * 0.035) * strength
      b += (blueDelta * 0.52 - warmthDelta * 0.14) * strength
      const mean = (r + g + b) / 3
      const saturationScale = 1 + saturationDelta * strength * 2.3 * (1 - cleanAmount * 0.18)
      r = mean + (r - mean) * saturationScale
      g = mean + (g - mean) * saturationScale
      b = mean + (b - mean) * saturationScale

      if (skinToneAmount && isSkinPixel(originalR, originalG, originalB)) {
        r += (skinWarmthDelta * 0.7 + skinBrightnessDelta * 0.18) * skinToneAmount
        g += (skinWarmthDelta * 0.16 + skinBrightnessDelta * 0.12) * skinToneAmount
        b -= (skinWarmthDelta * 0.52 - skinBrightnessDelta * 0.08) * skinToneAmount
        const skinMean = (r + g + b) / 3
        const skinSaturationScale = 1 + skinSaturationDelta * skinToneAmount * 1.8
        r = skinMean + (r - skinMean) * skinSaturationScale
        g = skinMean + (g - skinMean) * skinSaturationScale
        b = skinMean + (b - skinMean) * skinSaturationScale
      }

      const edgeX = x / Math.max(1, width - 1) - 0.5
      const edgeY = y / Math.max(1, height - 1) - 0.5
      const vignette = 1 - Math.max(0, Math.sqrt(edgeX * edgeX + edgeY * edgeY) - 0.25) * 0.18 * filmAmount * strength
      const grain = (hashNoise(x, y, width + height) - 0.5) * 0.055 * filmAmount * strength
      data[index] = clamp((r * vignette + grain) * 255, 0, 255)
      data[index + 1] = clamp((g * vignette + grain) * 255, 0, 255)
      data[index + 2] = clamp((b * vignette + grain) * 255, 0, 255)
    }
    if (y > 0 && y % 24 === 0) await yieldToBrowser()
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
  if (fingerprint.skinCoverage > 0.015) tags.push('Skin tone balance')
  return tags.length ? tags.slice(0, 4) : ['Balanced color', 'Natural contrast']
}

export const getFingerprintDefinitions = (fingerprint: StyleFingerprint): FingerprintDefinition[] => {
  const warmthLabel = fingerprint.warmth > 0.045 ? 'Warm highlights' : fingerprint.warmth < -0.04 ? 'Cool highlights' : 'Neutral highlights'
  const warmthDescription = fingerprint.warmth > 0.045 ? 'Brighter parts of the photo lean softly golden.' : fingerprint.warmth < -0.04 ? 'Brighter parts of the photo keep a cooler, cleaner feel.' : 'Bright areas stay close to the original white balance.'
  const contrastLabel = fingerprint.contrast < 0.19 ? 'Soft contrast' : 'Defined contrast'
  const contrastDescription = fingerprint.contrast < 0.19 ? 'Light and dark areas meet with a gentle rolloff.' : 'Light and dark areas have a little more separation.'
  const shadowLabel = fingerprint.shadowLift > 0.48 ? 'Lifted blacks' : 'Deep shadows'
  const shadowDescription = fingerprint.shadowLift > 0.48 ? 'Dark areas stay open so detail is easier to see.' : 'Dark areas stay rich and grounded.'
  const textureLabel = fingerprint.grain > 0.34 ? 'Film texture' : 'Clean texture'
  const textureDescription = fingerprint.grain > 0.34 ? 'A small amount of grain and color variation gives the look character.' : 'The look stays smooth and polished with very little grain.'
  const skinLabel = fingerprint.skinCoverage > 0.015 ? 'Skin tone' : 'Skin tone fallback'
  const skinDescription = fingerprint.skinCoverage > 0.015 ? 'Skin-colored areas are matched separately so faces stay natural while the look changes.' : 'No strong skin region was detected, so Mimic uses the overall color balance gently.'
  return [
    { label: warmthLabel, description: warmthDescription, value: Math.round(clamp(0.5 + Math.abs(fingerprint.warmth) * 3.2) * 100) },
    { label: skinLabel, description: skinDescription, value: Math.round(clamp(fingerprint.skinCoverage > 0.015 ? 0.58 + fingerprint.skinCoverage * 1.6 : 0.28) * 100) },
    { label: contrastLabel, description: contrastDescription, value: Math.round(clamp(fingerprint.contrast * 2.8) * 100) },
    { label: shadowLabel, description: shadowDescription, value: Math.round(clamp(fingerprint.shadowLift) * 100) },
    { label: textureLabel, description: textureDescription, value: Math.round(clamp(fingerprint.grain) * 100) },
  ]
}
