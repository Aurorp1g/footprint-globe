/** A viewport-fixed local artwork with a deterministic, lightweight fallback. */
let skyImage: HTMLImageElement | null = null;
let skyRequest: Promise<HTMLImageElement | null> | null = null;
let skyFailed = false;
const pending = new WeakMap<HTMLCanvasElement, { width: number; height: number }>();

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
) {
  if (width <= 0 || height <= 0) return;
  const state = skyImage ? "image" : skyFailed ? "fallback" : "loading";
  const dpr = Math.min(devicePixelRatio || 1, 2),
    key = `${width}:${height}:${dpr}:${state}`;
  canvas.style.height = `${height}px`;
  const queued = pending.get(canvas);
  if (queued) {
    queued.width = width;
    queued.height = height;
  }
  if (canvas.dataset.sceneSize === key) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.dataset.sceneSize = key;
  canvas.dataset.skySource = state;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#03080e";
  ctx.fillRect(0, 0, width, height);
  if (skyImage) {
    const scale = Math.max(width / skyImage.naturalWidth, height / skyImage.naturalHeight);
    const w = skyImage.naturalWidth * scale,
      h = skyImage.naturalHeight * scale;
    ctx.globalAlpha = 0.78;
    ctx.drawImage(skyImage, (width - w) * (width <= 700 ? 0.18 : 0.5), (height - h) * 0.5, w, h);
    ctx.globalAlpha = 1;
    const quiet = ctx.createRadialGradient(
      width * 0.48,
      height * 0.4,
      width * 0.07,
      width * 0.48,
      height * 0.4,
      width * 0.68,
    );
    quiet.addColorStop(0, "#02081000");
    quiet.addColorStop(0.55, "#02081018");
    quiet.addColorStop(1, "#02081062");
    ctx.fillStyle = quiet;
    ctx.fillRect(0, 0, width, height);
    const veil = ctx.createLinearGradient(0, 0, 0, height);
    veil.addColorStop(0, "#02081032");
    veil.addColorStop(0.38, "#0208100a");
    veil.addColorStop(1, "#02081042");
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, width, height);
  } else {
    let seed = 761803;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < Math.min(4200, (width * height) / 380); i++) {
      const x = rand() * width,
        y = rand() * height,
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
    const dimensions = { width, height };
    pending.set(canvas, dimensions);
    void loadSky(assetBase).then(() => {
      pending.delete(canvas);
      if (canvas.isConnected) drawFootprintStars(canvas, dimensions.width, dimensions.height, assetBase);
    });
  }
}
