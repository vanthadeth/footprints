import { SELFIE_JPEG_QUALITY, SELFIE_MAX_DIMENSION_PX } from './config'

/** Downscale + re-encode a captured frame so selfie uploads stay small on slow mobile networks. */
export async function compressImageBlob(
  blob: Blob,
  maxDimension = SELFIE_MAX_DIMENSION_PX,
  quality = SELFIE_JPEG_QUALITY
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return blob
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result ?? blob), 'image/jpeg', quality)
  })
}
