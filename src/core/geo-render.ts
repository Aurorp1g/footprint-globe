// Rendering only. Storage, provenance and geographic hit tests retain raw geometry.
// Retained vertices are original coordinates; extrema and tiny rings are kept.
export const renderToleranceDegrees = 0.035;
type Point = number[];

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t =
      dx || dy
        ? Math.max(
            0,
            Math.min(
              1,
              ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy),
            ),
          )
        : 0;
  return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
}

function ringDetail(ring: Point[], epsilon: number): Point[] {
  if (ring.length < 8) return ring;
  const unwrapped: Point[] = [];
  for (const [sourceLon, lat] of ring) {
    let lon = sourceLon,
      last = unwrapped.at(-1)?.[0] ?? lon;
    while (lon - last > 180) lon -= 360;
    while (lon - last < -180) lon += 360;
    unwrapped.push([lon, lat]);
  }
  const anchors = new Set([0, ring.length - 1]);
  for (const axis of [0, 1]) {
    let min = 0,
      max = 0;
    for (let i = 1; i < ring.length; i++) {
      if (unwrapped[i][axis] < unwrapped[min][axis]) min = i;
      if (unwrapped[i][axis] > unwrapped[max][axis]) max = i;
    }
    anchors.add(min);
    anchors.add(max);
  }
  const keep = new Set(anchors),
    ordered = [...anchors].sort((a, b) => a - b),
    pending: number[][] = [];
  for (let i = 1; i < ordered.length; i++)
    pending.push([ordered[i - 1], ordered[i]]);
  while (pending.length) {
    const [start, end] = pending.pop()!;
    let max = epsilon * epsilon,
      chosen = -1;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(unwrapped[i], unwrapped[start], unwrapped[end]);
      if (d > max) {
        max = d;
        chosen = i;
      }
    }
    if (chosen !== -1) {
      keep.add(chosen);
      pending.push([start, chosen], [chosen, end]);
    }
  }
  const indices = [...keep].sort((a, b) => a - b);
  return indices.length >= 4 ? indices.map((i) => ring[i]) : ring;
}

export function renderingGeometry(
  geometry: any,
  epsilon = renderToleranceDegrees,
): any {
  if (!geometry) return geometry;
  if (geometry.type === "Polygon")
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((r: Point[]) =>
        ringDetail(r, epsilon),
      ),
    };
  if (geometry.type === "MultiPolygon")
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((p: Point[][]) =>
        p.map((r) => ringDetail(r, epsilon)),
      ),
    };
  return geometry;
}
