/** A viewport-fixed local artwork with seamless celestial parallax and lightweight fallback. */
let skyImage: HTMLImageElement | null = null;
let skyRequest: Promise<HTMLImageElement | null> | null = null;
let skyFailed = false;
const pending = new WeakMap<HTMLCanvasElement, { width: number; height: number; rotation?: number[] }>();

function loadSky(assetBase = "") {
  if (!skyRequest)
    skyRequest = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        skyImage = img;
        resolve(img);
      };
      img.onerror = () => {
        skyFailed = true;
        resolve(null);
      };
      const rawBase =
        assetBase ||
        document.documentElement.dataset.previewPrefix ||
        (import.meta as any).env?.BASE_URL ||
        "./";
      const prefix = rawBase === "/" ? "" : String(rawBase).replace(/\/$/, "");
      img.src = prefix + "/maps/sky/footprint-starfield-v1.webp";
    });
  return skyRequest;
}

export function drawFootprintStars(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  assetBase = "",
  rotation?: number[],
) {
  if (width <= 0 || height <= 0) return;
  const state = skyImage ? "image" : skyFailed ? "fallback" : "loading";
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const dLon = !reduced && rotation ? (rotation[0] ?? -105) - -105 : 0;
  const dLat = !reduced && rotation ? (rotation[1] ?? -23) - -23 : 0;
  const rotKey = `${dLon.toFixed(2)},${dLat.toFixed(2)}`;
  const dpr = Math.min(devicePixelRatio || 1, 2),
    key = `${width}:${height}:${dpr}:${state}:${rotKey}`;
  canvas.style.height = `${height}px`;
  const queued = pending.get(canvas);
  if (queued) {
    queued.width = width;
    queued.height = height;
    queued.rotation = rotation;
  }
  if (canvas.dataset.sceneSize === key) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.dataset.sceneSize = key;
  canvas.dataset.skySource = state;
  const cw = Math.round(width * dpr),
    ch = Math.round(height * dpr);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#020408";
  ctx.fillRect(0, 0, width, height);
  if (skyImage) {
    const scale = Math.max(width / skyImage.naturalWidth, height / skyImage.naturalHeight) * 1.12;
    const w = skyImage.naturalWidth * scale,
      h = skyImage.naturalHeight * scale;
    const baseOffsetX = (width - w) * 0.5;
    const rawShiftX = baseOffsetX - (dLon / 360) * w * 0.42;
    const shiftX = ((rawShiftX % w) + w) % w;
    const maxShiftY = Math.max(0, (h - height) * 0.5);
    const shiftY = Math.max(-maxShiftY, Math.min(maxShiftY, -(dLat / 90) * maxShiftY * 0.85));
    const drawY = (height - h) * 0.5 + shiftY;
    ctx.globalAlpha = 0.96;
    ctx.drawImage(skyImage, shiftX - w, drawY, w, h);
    ctx.drawImage(skyImage, shiftX, drawY, w, h);
    if (shiftX + w < width) {
      ctx.drawImage(skyImage, shiftX + w, drawY, w, h);
    }
    ctx.globalAlpha = 1;
  } else {
    let seed = 761803;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const shiftX = -(dLon / 360) * width * 0.35;
    const shiftY = -(dLat / 90) * height * 0.12;
    for (let i = 0; i < Math.min(4200, (width * height) / 380); i++) {
      const x = (((rand() * width + shiftX) % width) + width) % width,
        y = (((rand() * height + shiftY) % height) + height) % height,
        r = 0.2 + rand() * 0.5;
      ctx.globalAlpha = 0.15 + rand() * 0.5;
      ctx.fillStyle = i % 7 ? "#8ba5bf" : "#d8e6f1";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (state === "loading" && !queued) {
    const dimensions = { width, height, rotation };
    pending.set(canvas, dimensions);
    void loadSky(assetBase).then(() => {
      pending.delete(canvas);
      if (canvas.isConnected)
        drawFootprintStars(canvas, dimensions.width, dimensions.height, assetBase, dimensions.rotation);
    });
  }
}

