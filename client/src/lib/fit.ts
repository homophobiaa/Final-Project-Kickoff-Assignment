/** Same rule as SizeCalculator.Fit on the server, used for the live preview in the setup panel. */
export function fit(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  keepAspectRatio: boolean,
  allowUpscale: boolean,
): [number, number] {
  if (!keepAspectRatio) return [targetWidth, targetHeight]
  let scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
  if (!allowUpscale) scale = Math.min(scale, 1)
  return [Math.max(1, Math.round(sourceWidth * scale)), Math.max(1, Math.round(sourceHeight * scale))]
}
