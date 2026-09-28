/** Reapply after resizing: assigning canvas dimensions resets context settings. */
export function rasterContext(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}
