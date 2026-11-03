/*!
 * Footprint Globe (足迹数字地球)
 * Copyright (c) 2026 曾威长/Over9rowth
 * Released under the MIT License.
 */
import "./styles/footprint.css";
import { buildTravelDataset, type FootprintConfigInput } from "./core/travel";
import { mountFootprint } from "./core/globe.js";

export type { FootprintConfigInput, SimpleVisitInput } from "./core/travel";
export { buildTravelDataset, mountFootprint };

export interface MountFootprintOptions {
  /** Container element or selector; defaults to `#footprint` */
  container?: HTMLElement | string;
  /** Travel configuration (residenceId + visits list) */
  data?: FootprintConfigInput;
  /** Optional asset base path for `/maps/...` (defaults to `""`) */
  assetBase?: string;
}

export async function initFootprintGlobe(options: MountFootprintOptions = {}) {
  const stage =
    typeof options.container === "string"
      ? document.querySelector<HTMLElement>(options.container)
      : options.container || document.getElementById("footprint");
  if (!stage) throw new Error("Footprint stage element (#footprint) not found.");

  const rawBase =
    options.assetBase ??
    document.documentElement.dataset.previewPrefix ??
    ((import.meta as any).env?.BASE_URL || "./");
  const prefix = rawBase === "/" ? "" : rawBase.replace(/\/$/, "");
  if (options.data) {
    stage.dataset.records = JSON.stringify(buildTravelDataset(options.data));
  }

  const loading = stage.querySelector<HTMLElement>("#loading-state");
  if (loading) {
    loading.hidden = false;
    loading.textContent = "正在展开地球…";
  }

  try {
    if (!(window as any).__footprintGeometry) {
      const response = await fetch(prefix + "/maps/footprint-ne-v1.json");
      if (!response.ok) throw new Error("地图数据暂不可用");
      (window as any).__footprintGeometry = await response.json();
    }
    if (!(window as any).d3) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = prefix + "/maps/d3-7.9.0.min.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("D3 绘图库加载失败"));
        document.head.append(script);
      });
    }
    mountFootprint();
  } catch (error: any) {
    if (loading) {
      loading.hidden = false;
      loading.textContent = `足迹暂时无法载入：${error?.message || "请刷新重试"}`;
    }
    throw error;
  }
}
