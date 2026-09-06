export type SubjectMask = {
  width: number
  height: number
  data: Uint8ClampedArray
}

type Segmenter = {
  segmentPeople: (image: HTMLImageElement) => Promise<Array<{ mask: { toImageData: () => Promise<ImageData> } }>>
}

let segmenterPromise: Promise<Segmenter | undefined> | undefined

const loadSegmenter = async (): Promise<Segmenter | undefined> => {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      try {
        const [bodySegmentation, tf] = await Promise.all([
          import('@tensorflow-models/body-segmentation'),
          import('@tensorflow/tfjs-core'),
          import('@tensorflow/tfjs-backend-webgl'),
          import('@tensorflow/tfjs-backend-cpu'),
        ]).then(([bodySegmentationModule, tfModule]) => [bodySegmentationModule, tfModule] as const)

        try {
          await tf.setBackend('webgl')
        } catch {
          await tf.setBackend('cpu')
        }
        await tf.ready()

        return await bodySegmentation.createSegmenter(bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation, {
          runtime: 'tfjs',
          modelType: 'landscape',
        }) as unknown as Segmenter
      } catch {
        return undefined
      }
    })()
  }
  return segmenterPromise
}

export const findSubjectMask = async (image: HTMLImageElement): Promise<SubjectMask | undefined> => {
  const segmenter = await loadSegmenter()
  if (!segmenter) return undefined

  try {
    const segmentations = await segmenter.segmentPeople(image)
    const mask = segmentations[0]?.mask
    if (!mask) return undefined
    const imageData = await mask.toImageData()
    let foregroundPixels = 0
    for (let index = 3; index < imageData.data.length; index += 4) {
      if (imageData.data[index] > 90) foregroundPixels += 1
    }
    const coverage = foregroundPixels / Math.max(1, imageData.width * imageData.height)
    if (coverage < 0.01 || coverage > 0.98) return undefined
    return { width: imageData.width, height: imageData.height, data: imageData.data }
  } catch {
    return undefined
  }
}
