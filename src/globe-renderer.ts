/*!
 * Footprint Globe · Globe Renderer & Lifecycle Bridge
 * Copyright (c) 2026 曾威长/Over9rowth. Released under the MIT License.
 */
import { mountFootprint } from "./core/globe.js";
import { buildTravelDataset, type SimpleVisitInput, type FootprintConfigInput } from "./core/travel";

export interface Trip {
  id?: string;
  title?: string;
  regionId?: string;
  regionKey?: string;
  countryCode?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  coords?: [number, number] | null;
  coordinate?: [number, number] | null;
  remark?: string;
  locationLevel?: string;
  photoUrl?: string | null;
  photoAlt?: string;
  demo?: boolean;
  [key: string]: any;
}

export async function ensureChinaDetail(): Promise<void> {
  // Pre-compiled Natural Earth package already contains detailed provincial boundaries.
  return Promise.resolve();
}

export async function bootFootprintGlobe(
  tripsInput: Trip[] | FootprintConfigInput | any,
  assetBase = ".",
  rootContainer?: HTMLElement,
): Promise<() => void> {
  const section = rootContainer
    ? ((rootContainer.querySelector(".footprint") ||
        rootContainer.querySelector(".footprint-stage") ||
        rootContainer.querySelector("#footprint") ||
        rootContainer) as HTMLElement)
    : document.getElementById("footprint");

  if (!section) {
    return () => {};
  }

  const byId = <T extends HTMLElement | SVGElement = HTMLElement>(id: string): T | null => {
    return (
      (section ? section.querySelector<T>(`#${id}`) : null) ||
      (rootContainer ? rootContainer.querySelector<T>(`#${id}`) : null) ||
      (document.getElementById(id) as T | null)
    );
  };

  const rawBase = assetBase || document.documentElement.dataset.previewPrefix || "./";
  const prefix = rawBase === "/" ? "" : rawBase.replace(/\/$/, "");

  // 1. Ensure D3 is loaded
  if (!(window as any).d3) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${prefix}/maps/d3-7.9.0.min.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("D3 绘图库加载失败"));
      document.head.append(script);
    });
  }

  // 2. Ensure GeoJSON is loaded
  if (!(window as any).__footprintGeometry) {
    const res = await fetch(`${prefix}/maps/footprint-ne-v1.json`);
    if (!res.ok) throw new Error("地图数据暂不可用");
    (window as any).__footprintGeometry = await res.json();
  }

  // 3. Normalize tripsInput into travel dataset records
  if (tripsInput) {
    let normalizedVisits: SimpleVisitInput[] = [];
    let residenceId = "CN-44";
    let settingsTitle = "";

    if (Array.isArray(tripsInput)) {
      normalizedVisits = tripsInput.map((t, idx) => ({
        id: t.id || `trip-${idx + 1}`,
        regionId: t.regionKey || t.regionId || t.countryCode || "CN-44",
        name: t.name,
        title: t.title || t.name || "旅行记录",
        startDate: t.startDate || new Date().toISOString().slice(0, 10),
        endDate: t.endDate || t.startDate || new Date().toISOString().slice(0, 10),
        coordinate: t.coords || t.coordinate || null,
        remark: t.remark || "",
        locationLevel: t.locationLevel,
        photoUrl: t.photoUrl || null,
        photoAlt: t.photoAlt || t.title,
        demo: Boolean(t.demo),
      }));
    } else if (typeof tripsInput === "object") {
      if (Array.isArray(tripsInput.visits)) {
        normalizedVisits = tripsInput.visits.map((t: any, idx: number) => ({
          id: t.id || `visit-${idx + 1}`,
          regionId: t.regionKey || t.regionId || t.countryCode || "CN-44",
          name: t.name,
          title: t.title || t.name || "",
          startDate: t.startDate || "",
          endDate: t.endDate || t.startDate || "",
          coordinate: t.coords || t.coordinate || null,
          remark: t.remark || "",
          locationLevel: t.locationLevel,
          photoUrl: t.photoUrl || null,
          photoAlt: t.photoAlt || t.title,
          demo: Boolean(t.demo),
        }));
      }
      if (tripsInput.residenceId) residenceId = tripsInput.residenceId;
      if (tripsInput.settingsTitle) settingsTitle = tripsInput.settingsTitle;
    }

    const dataset = buildTravelDataset({ residenceId, settingsTitle, visits: normalizedVisits });
    section.dataset.records = JSON.stringify(dataset);
  }

  // 4. Mount globe and get cleanup
  const cleanup = mountFootprint(section, prefix);
  return typeof cleanup === "function" ? cleanup : () => {};
}
