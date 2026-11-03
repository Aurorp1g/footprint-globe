/*!
 * Footprint Globe · Starfield Controller
 * Copyright (c) 2026 曾威长/Over9rowth. Released under the MIT License.
 */
import { drawFootprintStars } from "./core/starfield";

export function initStarfield(assetBase = ".", rootEl?: HTMLElement): () => void {
  const canvas =
    (rootEl ? (rootEl.querySelector("#starfield") as HTMLCanvasElement) : null) ||
    (document.querySelector("#starfield") as HTMLCanvasElement);

  if (!canvas) {
    return () => {};
  }

  let animFrame = 0;
  const render = () => {
    const parent = canvas.parentElement || document.body;
    const width = canvas.clientWidth || parent.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || parent.clientHeight || window.innerHeight;
    drawFootprintStars(canvas, width, height, assetBase);
  };

  render();

  const onResize = () => {
    cancelAnimationFrame(animFrame);
    animFrame = requestAnimationFrame(render);
  };

  window.addEventListener("resize", onResize);

  return () => {
    cancelAnimationFrame(animFrame);
    window.removeEventListener("resize", onResize);
  };
}

export { drawFootprintStars };
