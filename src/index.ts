/*!
 * Footprint Globe (足迹数字地球)
 * Copyright (c) 2026 曾威长/Over9rowth
 * Released under the MIT License.
 */
import "./styles/footprint.css";
import { buildTravelDataset, type FootprintConfigInput, type SimpleVisitInput } from "./core/travel";
import { mountFootprint } from "./core/globe.js";
import { initStarfield } from "./starfield";
import { bootFootprintGlobe, type Trip, ensureChinaDetail } from "./globe-renderer";

export type { FootprintConfigInput, SimpleVisitInput, Trip };
export { buildTravelDataset, mountFootprint, initStarfield, bootFootprintGlobe, ensureChinaDetail };

export interface FootprintGlobeInstance {
  dispose: () => void;
}

export interface MountFootprintOptions {
  /** Target container element or selector; defaults to `#footprint` or `#footprint-app` */
  container?: HTMLElement | string;
  /** Alias for container */
  root?: HTMLElement | string;
  /** Travel configuration (residenceId + visits list) or array of Trip objects */
  data?: FootprintConfigInput | Trip[];
  /** Alias for data trips */
  trips?: Trip[];
  /** Optional asset base path for `/maps/...` (defaults to `"."`) */
  assetBase?: string;
}

const TEMPLATE_HTML = `
  <section class="footprint footprint-stage" id="footprint" aria-label="可拖动的足迹数字地球">
    <canvas id="starfield" aria-hidden="true"></canvas>
    <div class="nebula" aria-hidden="true"></div>
    <svg id="globe" role="img" tabindex="0" aria-label="数字地球：拖动旋转，方向键旋转，Home 键回到中国。可使用地区定位选择任意地区。"></svg>
    <div class="quiet-heading" aria-hidden="true"><span class="signal-dot"></span><span>让足迹，慢慢点亮世界</span></div>
    <div class="map-actions">
      <button id="reset-view" type="button" title="回到中国 · Home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7"/></svg><span>回到中国</span></button>
      <button id="open-locator" type="button" aria-expanded="false" aria-controls="locator"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg><span>地区定位</span></button>
    </div>
    <section id="locator" class="locator" hidden aria-label="选择地区">
      <label for="region-select">选择一个省份、国家或地区</label>
      <select id="region-select"></select>
      <p>选择后转到该地区；悬停不会移动地球。</p>
    </section>
    <aside id="visit-card" class="visit-card" hidden aria-label="足迹详情">
      <div class="card-heading">
        <svg class="card-pin" viewBox="0 0 24 28" aria-hidden="true"><path d="M12 27S2 15.8 2 10a10 10 0 0 1 20 0c0 5.8-10 17-10 17Z"/><circle cx="12" cy="10" r="3.7"/></svg>
        <div class="card-heading-copy">
          <div class="card-title-row"><h2 id="card-title">中国</h2><span id="card-role">常居地</span></div>
          <p id="card-coordinates" class="card-coordinates"></p>
        </div>
        <svg id="card-region-shape" viewBox="0 0 100 80" aria-hidden="true"></svg>
      </div>
      <div class="photo-empty"><svg viewBox="0 0 54 46" aria-hidden="true"><rect x="4" y="4" width="46" height="37" rx="3"/><circle cx="16" cy="14" r="3"/><path d="m7 36 13-13 9 9 7-7 11 11"/></svg><span>尚未上传照片</span></div>
      <dl class="visit-stats">
        <div><dt><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11c-2 0-3 2-3 5s1 6 3 6 4-4 4-7-2-4-4-4Z"/><ellipse cx="7" cy="6" rx="2" ry="3"/><circle cx="13" cy="5" r="1.5"/><circle cx="17" cy="7" r="1.4"/><circle cx="19" cy="11" r="1.2"/></svg>到访次数</dt><dd id="visit-count">—</dd></div>
        <div><dt><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="17" rx="2"/><path d="M7 2v6m10-6v6M3 11h18m-13 4h2m4 0h2m-8 4h2"/></svg>最近到访</dt><dd id="visit-date">—</dd></div>
      </dl>
      <p class="location-note"><span class="location-icon" aria-hidden="true">⌖</span><span id="location-note">省级定位</span></p>
    </aside>
    <div id="region-label" class="region-label" hidden></div>
    <div class="bottom-hint"><svg class="drag-icon" viewBox="0 0 56 40" aria-hidden="true"><rect x="20" y="2" width="16" height="34" rx="8"/><path d="M28 8v7M3 20h11m-7-4-4 4 4 4m35-4h11m-4-4 4 4-4 4"/></svg><span id="gesture-hint">拖动旋转 · 悬停高亮 · 点击查看</span></div>
    <div class="footprint-legend"><span class="legend-dot" aria-hidden="true"></span><span>已到访地区</span><strong id="visited-region-count">0</strong></div>
    <details id="source-notes" class="source-notes">
      <summary>地图与记录说明</summary>
      <div class="source-content">
        <p>公开到访记录 · 常居地本身不计作一次到访。</p>
        <p>省份与海外分离地区独立记录。悬停高亮仅为选择反馈，不代表已经到访。</p>
        <p>地球地表影像：<a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/" target="_blank" rel="noopener noreferrer">NASA Blue Marble Next Generation</a>。夜间灯光来自 <a href="https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/" target="_blank" rel="noopener noreferrer">NASA Black Marble 2016</a>。</p>
        <div id="source-list"></div>
        <p id="data-notes"></p>
        <p>Designed &amp; Built by <strong>曾威长/Over9rowth</strong> · Copyright &copy; 2026 曾威长/Over9rowth.</p>
      </div>
    </details>
    <div id="loading-state" role="status">正在展开地球…</div>
    <p id="live-region" class="sr-only" role="status" aria-live="polite"></p>
  </section>
`;

export async function initFootprintGlobe(
  options: MountFootprintOptions = {},
): Promise<FootprintGlobeInstance> {
  const target = options.root || options.container;
  const root =
    typeof target === "string"
      ? document.querySelector<HTMLElement>(target)
      : target || document.getElementById("footprint-app") || document.getElementById("footprint");

  if (!root) {
    throw new Error("Footprint root container element not found.");
  }

  // Template injection: If container does not already have #globe or .footprint, inject template
  let stage = root.querySelector<HTMLElement>(".footprint, .footprint-stage, #footprint");
  if (!stage) {
    if (root.id === "footprint" || root.classList.contains("footprint-stage") || root.classList.contains("footprint")) {
      stage = root;
    } else {
      root.innerHTML = TEMPLATE_HTML;
      stage = root.querySelector<HTMLElement>(".footprint, #footprint");
    }
  }

  const assetBase =
    options.assetBase ??
    document.documentElement.dataset.previewPrefix ??
    ((import.meta as any).env?.BASE_URL || ".");

  const normalized = options.trips || options.data;

  // Initialize starfield with root and assetBase
  const starfieldCleanup = initStarfield(assetBase, root);

  // Initialize globe renderer with root and assetBase
  const globeCleanup = await bootFootprintGlobe(normalized, assetBase, root);

  return {
    dispose: () => {
      try {
        starfieldCleanup?.();
      } catch (err) {
        console.warn("Error disposing starfield:", err);
      }
      try {
        globeCleanup?.();
      } catch (err) {
        console.warn("Error disposing globe:", err);
      }
    },
  };
}

// Default auto-boot compatibility for #footprint-app
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const autoApp = document.getElementById("footprint-app");
  if (autoApp && !autoApp.querySelector("#globe")) {
    void initFootprintGlobe({ container: autoApp });
  }
}
