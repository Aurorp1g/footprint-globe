export interface GlobeView {
  width: number;
  height: number;
  radius: number;
  cx: number;
  cy: number;
  mobile: boolean;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** A permanent right-hand card gutter keeps selection from moving the globe. */
export function footprintView(
  width: number,
  viewportWidth: number,
  cardHeight = 360,
  availableHeight = Infinity,
): GlobeView {
  const mobile = viewportWidth <= 1100 || width <= 1100;
  const immersive = Number.isFinite(availableHeight);
  if (mobile) {
    const top = width <= 520 ? 100 : 76;
    const fit = immersive ? Math.max(24, (availableHeight - top - 36) / (2 * 1.045)) : Infinity;
    const radius = Math.max(24, Math.min((width - 48) / (2 * 1.045), 280, fit));
    const cy = top + radius * 1.045;
    return {
      width,
      height: cy + radius * 1.045 + 32 + Math.max(cardHeight, 340) + 100,
      radius,
      cx: width / 2,
      cy,
      mobile,
    };
  }
  const visibleHeight = immersive ? Math.max(160, availableHeight) : clamp(viewportWidth * 0.55, 700, 900);
  const height = Math.max(visibleHeight, cardHeight > 0 ? cardHeight + 180 : 0);
  const cardWidth = clamp(width * 0.22, 276, 320),
    right = 32,
    gap = 48,
    left = 28;
  const globeWidth = width - cardWidth - right - gap - left;
  const radius = Math.max(24, Math.min(410, globeWidth / (2 * 1.045), (visibleHeight - 104) / (2 * 1.045)));
  return { width, height, radius, cx: left + globeWidth / 2, cy: 40 + radius * 1.045, mobile };
}

/** The detail panel has one stable reading position, independent of the selected point. */
export function footprintCard(
  view: GlobeView,
  cardWidth: number,
  _cardHeight: number,
  _point: number[] | null,
) {
  const { width, cy, radius, mobile } = view;
  if (mobile)
    return {
      left: (width - cardWidth) / 2,
      top: cy + radius * 1.045 + 32,
      side: "bottom",
      vertical: "bottom",
    };
  return { left: width - cardWidth - 32, top: 116, side: "right", vertical: "top" };
}
