import type { Drawing, DrawingPoint } from "./readingProgress";

/**
 * How wide the eraser bites, as a fraction of the page's width — about 13px on
 * a 760px-wide page. Big enough to catch a stroke with a fingertip, small
 * enough that it doesn't take the neighbouring one with it.
 */
export const ERASER_RADIUS = 0.017;

/** Distance from `p` to the segment `a`–`b`, all in the same units. */
function distanceToSegment(p: DrawingPoint, a: DrawingPoint, b: DrawingPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  // A zero-length segment (a dot) is just its own endpoint.
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * The strokes the eraser is touching at `point`.
 *
 * Stroke points are stored as fractions of the page's own width and height, so
 * x and y are not in the same unit — a circle in that space would come out as
 * an ellipse on screen. `pageAspect` (the page's height ÷ its width in pixels)
 * converts y into width-fractions first, so the eraser stays round whatever
 * shape the page is.
 *
 * A thick highlighter stroke is easier to hit than a thin pen line, which is
 * what you would expect from erasing a real one — hence the half-stroke-width
 * added to the reach.
 */
export function strokesUnderEraser(strokes: Drawing[], point: DrawingPoint, pageAspect: number): Drawing[] {
  const p = { x: point.x, y: point.y * pageAspect };
  return strokes.filter((stroke) => {
    const reach = ERASER_RADIUS + stroke.strokeWidth / 2;
    const points = stroke.points;
    if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y * pageAspect) <= reach;
    for (let i = 1; i < points.length; i++) {
      const a = { x: points[i - 1].x, y: points[i - 1].y * pageAspect };
      const b = { x: points[i].x, y: points[i].y * pageAspect };
      if (distanceToSegment(p, a, b) <= reach) return true;
    }
    return false;
  });
}
