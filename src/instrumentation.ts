// Runs once at server startup, before any routes/chunks are instantiated.
// Polyfills DOM globals required by pdfjs (loaded transitively via unpdf).
export function register() {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = class {};
  if (typeof g.Path2D === "undefined") g.Path2D = class {};
  if (typeof g.ImageData === "undefined") g.ImageData = class {};
}
