/*!
 * Footprint Globe Core
 * Copyright (c) 2026 曾威长/Over9rowth. Released under the MIT License.
 * Real geographic geometry; no fabricated visits or network requests.
 */
import { renderingGeometry } from "./geo-render";
import { createEarthSurface } from "./surface-webgl";
import { drawFootprintStars } from "./starfield";
import { footprintView, footprintCard } from "./layout";
export function mountFootprint(container, assetBase) {
  "use strict";
  const section = container
    ? (container.querySelector(".footprint, .footprint-stage, #footprint") || container)
    : document.getElementById("footprint");
  const byId = (id) =>
    (section ? section.querySelector("#" + id) : null) ||
    (container ? container.querySelector("#" + id) : null) ||
    document.getElementById(id);
  const $ = byId;
  const d3 = window.d3;
  const stage = section;
  const loading = $("loading-state");
  const listeners = [];
  const on = (target, event, fn) => {
    target.addEventListener(event, fn);
    listeners.push(() => target.removeEventListener(event, fn));
  };
  const records = JSON.parse(
    stage.dataset.records || '{"regions":[],"residenceId":"CN-44"}',
  );
  const summaries = new Map(records.regions.map((r) => [r.regionId, r]));
  const active = () =>
    !document.hidden && !stage.closest("[data-about-panel]")?.hidden;
  let disposed = false,
    moveFrame = 0;
  try {
    if (!window.d3) throw new Error("本地地图绘图库缺失，请重新构建样片。");
    const raw = window.__footprintGeometry;
    const TAU = Math.PI * 2;
    // D3 uses the opposite spherical ring convention to RFC 7946 for small polygons.
    // Normalize each polygon independently: islands remain islands, never a whole hemisphere.
    function orientGeometry(geometry) {
      if (!geometry) return geometry;
      const orientPolygon = (coordinates) => {
        const polygon = { type: "Polygon", coordinates };
        return d3.geoArea(polygon) > TAU
          ? coordinates.map((ring) => ring.slice().reverse())
          : coordinates;
      };
      if (geometry.type === "Polygon")
        return {
          ...geometry,
          coordinates: orientPolygon(geometry.coordinates),
        };
      if (geometry.type === "MultiPolygon")
        return {
          ...geometry,
          coordinates: geometry.coordinates.map(orientPolygon),
        };
      if (geometry.type === "GeometryCollection")
        return {
          ...geometry,
          geometries: geometry.geometries.map(orientGeometry),
        };
      return geometry;
    }
    const orientFeature = (feature) => ({
      ...feature,
      geometry: orientGeometry(feature.geometry),
    });
    const features = raw.features
      .map(orientFeature)
      .filter((feature) => feature.geometry);
    features.forEach((feature, index) => {
      feature.properties = { ...feature.properties };
      feature.properties.id ||= `feature-${index}`;
      feature.properties.nameZh ||=
        feature.properties.name || feature.properties.id;
      if (!Array.isArray(feature.properties.center))
        feature.properties.center = d3.geoCentroid(feature);
    });
    const home = features.find(
      (feature) => feature.properties.id === records.residenceId,
    );
    if (!home) throw new Error("地图数据缺少广东省，请检查数据文件。");
    const chinaOutline = raw.chinaOutline
      ? orientFeature(raw.chinaOutline)
      : null;
    const countries = features.filter(
      (feature) => feature.properties.kind !== "province",
    );
    const provinces = features.filter(
      (feature) => feature.properties.kind === "province",
    );
    const priority = [
      ...provinces,
      ...countries.filter((f) => f.properties.kind === "region"),
      ...countries.filter((f) => f.properties.kind !== "region"),
    ];
    const featureById = new Map(
      features.map((feature) => [feature.properties.id, feature]),
    );

    function backfillMissingCoords() {
      const provinceIsoMap = {
        "CN-BJ": "CN-11", "CN-TJ": "CN-12", "CN-HE": "CN-13", "CN-SX": "CN-14", "CN-NM": "CN-15",
        "CN-LN": "CN-21", "CN-JL": "CN-22", "CN-HL": "CN-23", "CN-SH": "CN-31", "CN-JS": "CN-32",
        "CN-ZJ": "CN-33", "CN-AH": "CN-34", "CN-FJ": "CN-35", "CN-JX": "CN-36", "CN-SD": "CN-37",
        "CN-HA": "CN-41", "CN-HB": "CN-42", "CN-HN": "CN-43", "CN-GD": "CN-44", "CN-GX": "CN-45",
        "CN-HI": "CN-46", "CN-CQ": "CN-50", "CN-SC": "CN-51", "CN-GZ": "CN-52", "CN-YN": "CN-53",
        "CN-XZ": "CN-54", "CN-SN": "CN-61", "CN-GS": "CN-62", "CN-QH": "CN-63", "CN-NX": "CN-64",
        "CN-XJ": "CN-65", "CN-TW": "CN-71", "CN-HK": "CN-91", "CN-MO": "CN-92"
      };
      summaries.forEach((summary, regionId) => {
        if (!summary.location) summary.location = { coordinate: null, level: "地区定位" };
        if (!summary.location.coordinate || !summary.location.coordinate.every(Number.isFinite)) {
          const mappedId = provinceIsoMap[regionId] || regionId;
          const matched = featureById.get(mappedId) || featureById.get(regionId) || features.find((f) =>
            f.properties.id === mappedId ||
            f.properties.id === regionId ||
            f.properties.isoA2 === regionId ||
            f.properties.countryCode === regionId ||
            f.properties.nameZh === summary.name ||
            f.properties.name === summary.name
          );
          if (matched) {
            const centroid = Array.isArray(matched.properties.center)
              ? matched.properties.center
              : d3.geoCentroid(matched);
            if (centroid && centroid.every(Number.isFinite)) {
              summary.location.coordinate = centroid;
              if (matched.properties.kind === "province") {
                summary.location.level = "省级定位";
              }
            }
          }
        }
      });
    }
    backfillMissingCoords();

    const sphere = { type: "Sphere" };
    const displayById = new Map(
      features.map((f) => [
        f.properties.id,
        { ...f, geometry: renderingGeometry(f.geometry) },
      ]),
    );
    const displayChina = chinaOutline
      ? { ...chinaOutline, geometry: renderingGeometry(chinaOutline.geometry) }
      : null;
    const projection = d3
      .geoOrthographic()
      .rotate([-105, -23, 0])
      .clipAngle(90)
      .precision(0.18);
    const path = d3.geoPath(projection).digits(1);
    const graticule = d3.geoGraticule().step([15, 15])();
    const svg = d3.select(byId("globe"));
    const earthSurface = createEarthSurface(stage, assetBase);
    const defs = svg.append("defs");
    const ocean = defs
      .append("radialGradient")
      .attr("id", "ocean-fill")
      .attr("cx", "36%")
      .attr("cy", "29%")
      .attr("r", "76%");
    ocean.append("stop").attr("offset", "0%").attr("stop-color", "var(--fp-ocean-start)");
    ocean.append("stop").attr("offset", "64%").attr("stop-color", "var(--fp-ocean-mid)");
    ocean.append("stop").attr("offset", "100%").attr("stop-color", "var(--fp-ocean-end)");
    const land = defs
      .append("radialGradient")
      .attr("id", "land-fill")
      .attr("gradientUnits", "userSpaceOnUse");
    land.append("stop").attr("offset", "0%").attr("stop-color", "var(--fp-land-start)");
    land.append("stop").attr("offset", "64%").attr("stop-color", "var(--fp-land-mid)");
    land.append("stop").attr("offset", "100%").attr("stop-color", "var(--fp-land-end)");
    const gd = defs
      .append("linearGradient")
      .attr("id", "guangdong-fill")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "100%");
    gd.append("stop").attr("offset", "0%").attr("stop-color", "var(--fp-lit-start)");
    gd.append("stop").attr("offset", "48%").attr("stop-color", "var(--fp-lit-start)");
    gd.append("stop").attr("offset", "100%").attr("stop-color", "var(--fp-lit-end)");
    const connectorGrad = defs
      .append("linearGradient")
      .attr("id", "connector-gradient")
      .attr("gradientUnits", "userSpaceOnUse");
    connectorGrad.append("stop").attr("offset", "0%").attr("stop-color", "rgba(118, 238, 208, 0.92)");
    connectorGrad.append("stop").attr("offset", "55%").attr("stop-color", "rgba(126, 208, 186, 0.65)");
    connectorGrad.append("stop").attr("offset", "100%").attr("stop-color", "rgba(130, 196, 180, 0.48)");
    const limbFade = defs
      .append("radialGradient")
      .attr("id", "globe-limb-fade")
      .attr("cx", "44%")
      .attr("cy", "42%")
      .attr("r", "58%");
    limbFade.append("stop").attr("offset", "0%").attr("stop-color", "#071320").attr("stop-opacity", "0");
    limbFade.append("stop").attr("offset", "74%").attr("stop-color", "#071320").attr("stop-opacity", "0");
    limbFade.append("stop").attr("offset", "91%").attr("stop-color", "#06111d").attr("stop-opacity", "0.28");
    limbFade.append("stop").attr("offset", "100%").attr("stop-color", "#050d17").attr("stop-opacity", "0.58");
    const atmosphere = defs
      .append("radialGradient")
      .attr("id", "atmosphere-fill");
    atmosphere
      .append("stop")
      .attr("offset", "86%")
      .attr("stop-color", "var(--fp-atmosphere)")
      .attr("stop-opacity", "0");
    atmosphere
      .append("stop")
      .attr("offset", "93%")
      .attr("stop-color", "var(--fp-atmosphere)")
      .attr("stop-opacity", ".1");
    atmosphere
      .append("stop")
      .attr("offset", "95.6%")
      .attr("stop-color", "var(--fp-atmosphere)")
      .attr("stop-opacity", "var(--fp-atmosphere-opacity)");
    atmosphere
      .append("stop")
      .attr("offset", "97.5%")
      .attr("stop-color", "var(--fp-atmosphere)")
      .attr("stop-opacity", ".12");
    atmosphere
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "var(--fp-atmosphere)")
      .attr("stop-opacity", "0");
    const shade = defs
      .append("radialGradient")
      .attr("id", "sphere-shade")
      .attr("cx", "38%")
      .attr("cy", "31%")
      .attr("r", "70%");
    shade
      .append("stop")
      .attr("offset", "25%")
      .attr("stop-color", "var(--fp-globe-shadow)")
      .attr("stop-opacity", "0");
    shade
      .append("stop")
      .attr("offset", "74%")
      .attr("stop-color", "var(--fp-globe-shadow)")
      .attr("stop-opacity", ".04");
    shade
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "var(--fp-globe-shadow)")
      .attr("stop-opacity", ".47");
    const createGlow = (id, blur, opacity) => {
      const filter = defs
        .append("filter")
        .attr("id", id)
        .attr("x", "-60%")
        .attr("y", "-60%")
        .attr("width", "220%")
        .attr("height", "220%");
      filter
        .append("feGaussianBlur")
        .attr("in", "SourceGraphic")
        .attr("stdDeviation", blur)
        .attr("result", "blur");
      filter
        .append("feComponentTransfer")
        .attr("in", "blur")
        .append("feFuncA")
        .attr("type", "linear")
        .attr("slope", opacity);
      const merge = filter.append("feMerge");
      merge.append("feMergeNode");
      merge.append("feMergeNode").attr("in", "SourceGraphic");
    };
    createGlow("province-glow", 2.1, 0.5);
    createGlow("hover-glow", 1.3, 0.48);
    createGlow("point-glow", 2.4, 0.95);
    const atmo = svg
      .append("circle")
      .attr("fill", "url(#atmosphere-fill)")
      .attr("pointer-events", "none");
    const oceanPath = svg
      .append("path")
      .datum(sphere)
      .attr("fill", "url(#ocean-fill)");
    const gridPath = svg
      .append("path")
      .datum(graticule)
      .attr("class", "ocean-grid");
    const worldLayer = svg.append("g").attr("aria-hidden", "true");
    const worldPaths = worldLayer
      .selectAll("path")
      .data(countries)
      .join("path")
      .attr("class", "map-land");
    const provinceLayer = svg.append("g").attr("aria-hidden", "true");
    const provincePaths = provinceLayer
      .selectAll("path")
      .data(provinces)
      .join("path")
      .attr("class", "province");
    const limbVignette = svg
      .append("circle")
      .attr("class", "limb-vignette")
      .attr("fill", "url(#globe-limb-fade)")
      .attr("pointer-events", "none");
    const chinaPath = svg
      .append("path")
      .datum(chinaOutline)
      .attr("class", "country-china");
    const maritimePath = svg
      .append("path")
      .datum(raw.maritimeLines || null)
      .attr("class", "maritime-line");
    const sphereShade = svg
      .append("path")
      .datum(sphere)
      .attr("fill", "url(#sphere-shade)")
      .attr("pointer-events", "none");
    const visitPaths = svg
      .append("g")
      .selectAll("path")
      .data(
        features.filter((f) => f !== home && summaries.has(f.properties.id)),
      )
      .join("path")
      .attr("class", "visited-land")
      .attr("fill", (f) =>
        `color-mix(in srgb, var(--fp-lit-start) ${Math.round(summaries.get(f.properties.id).brightness*100)}%, var(--fp-lit-end))`,
      )
      .attr("stroke", "var(--fp-lit-end)")
      .attr("stroke-width", ".7");
    const visitLabels = svg
      .append("g")
      .selectAll("text")
      .data(
        features.filter((f) => f !== home && summaries.has(f.properties.id)),
      )
      .join("text")
      .attr("class", "constant-label")
      .attr("text-anchor", "middle")
      .text(displayName);
    const homePath = svg
      .append("path")
      .datum(home)
      .attr("class", "lit-land")
      .attr("data-feature-id", home.properties.id);
    const selectedPath = svg.append("path").attr("class","selected-land").attr("display","none");
    const hoverPath = svg
      .append("path")
      .attr("class", "hover-land")
      .attr("display", "none");
    const outlinePath = svg
      .append("path")
      .datum(sphere)
      .attr("class", "sphere-outline");
    const homeLabel = svg
      .append("text")
      .attr("class", "constant-label")
      .attr("text-anchor", "middle")
      .text(home.properties.nameZh);
    const connector = svg.append("path").attr("class", "connector");
    const connectorEnd = svg
      .append("circle")
      .attr("class", "connector-end")
      .attr("r", 2.2)
      .attr("display", "none");
    const markerRing = svg
      .append("circle")
      .attr("class", "marker-ring")
      .attr("r", 7.5);
    const marker = svg
      .append("circle")
      .attr("class", "map-marker")
      .attr("r", 2.8);
    const card = $("visit-card");
    const emptyPhotoIcon = stage
      .querySelector(".photo-empty svg")
      ?.cloneNode(true);
    const hoverLabel = $("region-label");
    const probe = document.createElement("canvas").getContext("2d");
    let width = 0,
      height = 0,
      radius = 0,
      cx = 0,
      cy = 0,
      mobile = false;
    let hovered = null,
      selected = null,
      pointer = null,
      drag = null,
      moveQueued = false,
      pendingPointer = null;
    let renderedPaths = new Map();
    let projectedPaths = new Map();
    let announceTimer = 0;
    let measuredCardHeight=0;
    probe.font = "13px Microsoft YaHei";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    function visible(point) {
      return (
        d3.geoDistance(point, projection.invert([cx, cy])) < Math.PI / 2 - 0.004
      );
    }
    function displayName(feature) {
      const p = feature.properties;
      if (
        p.kind === "region" &&
        p.countryNameZh &&
        !p.nameZh.includes(p.countryNameZh)
      )
        return `${p.nameZh} · ${p.countryNameZh}`;
      return p.nameZh;
    }
    function announce(message) {
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => {
        $("live-region").textContent = message;
      }, 180);
    }
    function pointInsideGlobe(point) {
      return Math.hypot(point[0] - cx, point[1] - cy) <= radius;
    }
    function featureAt(point) {
      if (!pointInsideGlobe(point)) return null;
      // A two-pixel edge tolerance keeps the prior province stable while hovering a shared border.
      if (hovered && projectedPaths.has(hovered.properties.id)) {
        const id = hovered.properties.id;
        if (
          !renderedPaths.has(id) &&
          projectedPaths.get(id) &&
          typeof Path2D !== "undefined"
        )
          renderedPaths.set(id, new Path2D(projectedPaths.get(id)));
        probe.lineWidth = 3.3;
        if (
          renderedPaths.has(id) &&
          probe.isPointInStroke(renderedPaths.get(id), point[0], point[1])
        )
          return hovered;
      }
      const coordinate = projection.invert(point);
      if (!coordinate || !coordinate.every(Number.isFinite)) return null;
      return (
        priority.find((feature) => d3.geoContains(feature, coordinate)) || null
      );
    }
    function pointOnFeature(feature) {
      const center = feature.properties.center;
      if (visible(center)) return projection(center);
      // A multi-part country can be under the pointer while its representative point is hidden.
      return pointer && pointInsideGlobe(pointer) ? pointer : null;
    }
    let detailAnimations = [], hoverAnimation = null, lastHoverId = null;
    const stopDetailMotion = () => { detailAnimations.forEach(animation => animation.cancel()); detailAnimations = []; };
    function revealDetail(first) {
      stopDetailMotion();
      if (reducedMotion.matches) return;
      // Only opacity changes: card geometry and mobile centering remain stable.
      const fade = (element, from, duration, delay=0) => {
        if (!element || typeof element.animate !== 'function') return;
        const to = Number.parseFloat(getComputedStyle(element).opacity) || 1;
        detailAnimations.push(element.animate([{opacity:from},{opacity:to}],{duration,delay,easing:'cubic-bezier(.2,.65,.3,1)',fill:'backwards'}));
      };
      fade(marker.node(),0,160);
      fade(connector.node(),0,220,35);
      if(first) fade(card,0,280,80);
      else for(const child of card.children) fade(child,.6,200);
    }
    on(reducedMotion, 'change', () => { stopDetailMotion(); hoverAnimation?.cancel(); });
    function updateOverlay() {
      const feature = selected;
      selectedPath.attr("display",selected&&!drag?null:"none").attr("d",selected?path(displayById.get(selected.properties.id)):null);
      if (hovered)
        hoverPath
          .datum(hovered)
          .attr("d", (f) => path(displayById.get(f.properties.id)))
          .attr("display", null)
          .classed("lit-hover", summaries.has(hovered.properties.id));
      else hoverPath.attr("display", "none");
      const nextHoverId = hovered?.properties.id || null;
      if(nextHoverId !== lastHoverId){
        hoverAnimation?.cancel(); lastHoverId = nextHoverId;
        if(nextHoverId && !reducedMotion.matches) hoverAnimation = hoverPath.node().animate([{opacity:.25},{opacity:1}],{duration:150,easing:'ease-out'});
      }
      const selectedVisible = selected && !drag && visible(selected.properties.center),
        sp = selectedVisible ? projection(selected.properties.center) : null;
      homeLabel
        .text(selected ? displayName(selected) : home.properties.nameZh)
        .attr("display", selectedVisible ? null : "none")
        .attr("x", sp ? sp[0] : 0)
        .attr("y", sp ? sp[1] + 24 : 0);
      visitLabels.attr("display", "none");
      const summary = feature ? summaries.get(feature.properties.id) || (feature === selected ? {
        regionId:feature.properties.id,name:displayName(feature),residence:false,count:0,latest:null,
        location:{coordinate:feature.properties.center,level:'地区中心 · 尚无公开到访'},cover:{src:null},unvisited:true,
      } : null) : null,
        showCard = !!summary && !drag && !stage.closest('[data-footprint-settling]');
      const firstReveal = card.hidden;
      const detailChanged = showCard && (firstReveal || card.dataset.region !== summary.regionId);
      card.hidden = !showCard;
      if(!showCard) stopDetailMotion();
      const point = summary?.location?.coordinate;
      const pointVisible = showCard && point && visible(point),
        position = pointVisible ? projection(point) : null;
      connector.attr("display", pointVisible ? null : "none");
      connectorEnd.attr("display", pointVisible ? null : "none");
      marker.attr("display", pointVisible ? null : "none");
      markerRing.attr("display", pointVisible ? null : "none");
      if (showCard) {
        $("card-title").textContent = summary.name;
        $("card-role").textContent = summary.residence
          ? "常居地"
          : summary.unvisited
            ? "尚无到访记录"
            : summary.latest?.demo
            ? "演示行程"
            : "";
        card.setAttribute("aria-label", summary.name + "足迹详情");
        const shape=$("card-region-shape");
        if(shape&&card.dataset.region!==summary.regionId){
          const mini=d3.geoMercator().fitExtent([[6,6],[94,74]],feature);
          shape.replaceChildren();
          const outline=document.createElementNS('http://www.w3.org/2000/svg','path');
          outline.setAttribute('d',d3.geoPath(mini)(feature)||'');shape.append(outline);
        }
        card.dataset.region = summary.regionId;
        $("visit-count").textContent = summary.count
          ? String(summary.count)
          : "—";
        const visit = summary.latest;
        $("visit-date").textContent = visit
          ? visit.startDate === visit.endDate
            ? visit.endDate
            : visit.startDate + " — " + visit.endDate
          : "—";
        $("visit-date").classList.toggle("visit-date", !!visit);
        $("location-note").textContent =
          summary.location.level +
          (!point
            ? " · 该行程暂未配置坐标"
            : !pointVisible
            ? " · 当前位置在地球另一侧，拖动地球即可查看"
            : "");
        const coordinateLabel=$("card-coordinates");
        if(coordinateLabel)coordinateLabel.textContent=point&&point.every(Number.isFinite)
          ? (point[1]>=0?'北纬 ':'南纬 ')+Math.abs(point[1]).toFixed(2)+'°　'+(point[0]>=0?'东经 ':'西经 ')+Math.abs(point[0]).toFixed(2)+'°' : '';
        const box = stage.querySelector(".photo-empty"),
          src = summary.cover.src || "";
        if (box.dataset.cover !== src) {
          box.dataset.cover = src;
          box.replaceChildren();
          if (src) {
            const img = document.createElement("img");
            img.alt = summary.cover.photo.alt;
            img.loading = "lazy";
            img.src =
              (assetBase ? (assetBase === "/" ? "" : assetBase.replace(/\/$/, "")) : (document.documentElement.dataset.previewPrefix || "")) + src;
            img.addEventListener(
              "error",
              () => {
                const text = document.createElement("span");
                text.textContent = "照片加载失败";
                box.replaceChildren(text);
              },
              { once: true },
            );
            box.append(img);
          } else {
            const text = document.createElement("span");
            text.textContent = "尚未上传照片";
            if (emptyPhotoIcon) box.append(emptyPhotoIcon.cloneNode(true));
            box.append(text);
          }
        }
        const cardWidth = card.offsetWidth,
          cardHeight = card.offsetHeight;
        const rawLayout=footprintCard({width,height,cx,cy,radius,mobile},cardWidth,cardHeight,position);
        const left = mobile ? rawLayout.left : Math.max(Math.round(cx + radius * 1.045 + 24), rawLayout.left - 28);
        const {top,side,vertical}=rawLayout;
        card.dataset.side=side;card.dataset.vertical=vertical;
        card.style.left = left + "px";
        card.style.top = top + "px";
        if (position) {
          const [x, y] = position;
          if (mobile) {
            const targetX = width / 2, targetY = top;
            connectorGrad.attr("x1", x).attr("y1", y).attr("x2", targetX).attr("y2", targetY);
            connector.attr("d", `M${x},${y} L${x},${cy+radius+13} L${targetX},${targetY}`);
            connectorEnd.attr("cx", targetX).attr("cy", targetY);
          } else {
            const endX=side==='left'?left+cardWidth:left;
            const endY=clamp(y,top+24,top+cardHeight-24);
            const elbowX=side==='left'?endX+16:endX-16;
            connectorGrad.attr("x1", x).attr("y1", y).attr("x2", endX).attr("y2", endY);
            connector.attr("d", `M${x},${y} L${elbowX},${endY} L${endX},${endY}`);
            connectorEnd.attr("cx", endX).attr("cy", endY);
          }
          marker.attr("cx", x).attr("cy", y);
          markerRing.attr("cx", x).attr("cy", y);
        }
      }
      if(detailChanged) revealDetail(firstReveal);
      const measured=card.hidden?0:card.offsetHeight;
      if(measured!==measuredCardHeight){measuredCardHeight=measured;resize();}
      const showName = hovered && !drag && hovered !== selected;
      hoverLabel.hidden = !showName;
      if (showName) {
        const p = pointOnFeature(hovered);
        if (!p) {
          hoverLabel.hidden = true;
          return;
        }
        hoverLabel.dataset.visited =
          summaries.has(hovered.properties.id) || hovered === home ? "true" : "false";
        hoverLabel.textContent = displayName(hovered);
        hoverLabel.style.left =
          clamp(p[0] + 15, 12, width - hoverLabel.offsetWidth - 12) + "px";
        hoverLabel.style.top =
          clamp(p[1] - 44, 83, height - hoverLabel.offsetHeight - 45) + "px";
      }
    }
    function render() {
      drawStars();
      earthSurface?.render({width,height,cx,cy,radius,rotation:projection.rotate()});
      $("globe").dataset.rotation = projection
        .rotate()
        .map((value) => value.toFixed(3))
        .join(",");
      oceanPath.attr("d", path);
      gridPath.attr("d", path);
      const paths = new Map(
        features.map((f) => [
          f.properties.id,
          path(displayById.get(f.properties.id)),
        ]),
      );
      projectedPaths = paths;
      const cachedPath = (f) => paths.get(f.properties.id);
      worldPaths.attr("d", cachedPath);
      provincePaths.attr("d", cachedPath);
      chinaPath.attr("d", displayChina ? path(displayChina) : null);
      maritimePath.attr("d", raw.maritimeLines ? path : null);
      visitPaths.attr("d", cachedPath);
      sphereShade.attr("d", path);
      homePath.attr("d", cachedPath);
      outlinePath.attr("d", path);
      renderedPaths = new Map();
      updateOverlay();
    }
    function drawStars() {
      const shell=stage.closest('.footprint-immersion');
      const skyHeight=shell?shell.clientHeight:window.innerHeight;
      stage.style.setProperty('--fp-sky-height',skyHeight+'px');
      drawFootprintStars(byId("starfield"),width,skyHeight,assetBase,projection.rotate());
    }
    function resize() {
      if (disposed || !active() || stage.clientWidth < 60) return;
      let nextWidth=stage.clientWidth;
      // During column expansion, SVG's centered viewBox scales the already rendered map.
      // Reproject only once at the final width, rather than blocking each animation frame.
      if(stage.closest('[data-footprint-settling]')&&window.innerWidth>1100){
        const grid=stage.closest('.about-grid'),center=stage.closest('.about-center');
        if(grid&&center){
          const style=getComputedStyle(grid);
          nextWidth=grid.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-(center.clientWidth-stage.clientWidth);
        }
      }
      const immersion=stage.closest('.footprint-immersion');
      const toolbar=immersion?.querySelector('.footprint-immersion-toolbar');
      const availableHeight=immersion?immersion.clientHeight-(toolbar&&getComputedStyle(toolbar).position!=='absolute'?toolbar.offsetHeight:0):Infinity;
      const next=footprintView(nextWidth,window.innerWidth,card.offsetHeight,availableHeight);
      if(width===nextWidth&&height===next.height&&mobile===next.mobile&&radius===next.radius&&cy===next.cy&&cx===next.cx)return;
      width=nextWidth;
      ({height,radius,cx,cy,mobile}=next);
      stage.style.height = `${height}px`;
      svg
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", width)
        .attr("height", height);
      projection.translate([cx, cy]).scale(radius);
      land
        .attr("cx", cx - radius * 0.3)
        .attr("cy", cy - radius * 0.38)
        .attr("r", radius * 1.6);
      atmo
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", radius * 1.045);
      limbVignette
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", radius);
      $("gesture-hint").textContent = mobile
        ? "单指拖动旋转 · 轻触查看"
        : "拖动旋转 · 悬停高亮 · 点击查看";
      drawStars();
      render();
    }
    const eventPoint = (event) => {
      const rect = $("globe").getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    function pick(point, persistent = false) {
      pointer = point;
      const next = featureAt(point);
      if (next !== hovered) {
        hovered = next;
        if (next)
          announce(
            displayName(next) +
              (summaries.has(next.properties.id) ? "，已点亮" : "，未点亮"),
          );
      }
      if (persistent) selected = next;
      updateOverlay();
    }
    on($("globe"), "pointerdown", (event) => {
      if (event.button !== 0 || drag || event.isPrimary === false) return;
      const point = eventPoint(event);
      if (!pointInsideGlobe(point)) {
        selected = null;
        hovered = null;
        updateOverlay();
        return;
      }
      drag = {
        pointerId: event.pointerId,
        start: point,
        rotate: projection.rotate(),
        moved: false,
      };
      $("globe").setPointerCapture(event.pointerId);
    });
    on($("globe"), "pointermove", (event) => {
      if (drag && event.pointerId !== drag.pointerId) return;
      if (drag && event.pointerType === "mouse" && !(event.buttons & 1))
        cancelDrag();
      pendingPointer = {
        point: eventPoint(event),
        pointerId: event.pointerId,
        type: event.pointerType,
        dragSession: drag,
      };
      if (
        drag &&
        Math.hypot(
          pendingPointer.point[0] - drag.start[0],
          pendingPointer.point[1] - drag.start[1],
        ) > 4
      )
        drag.moved = true;
      if (moveQueued) return;
      moveQueued = true;
      moveFrame = requestAnimationFrame(() => {
        moveFrame = 0;
        moveQueued = false;
        if (disposed || !active()) return;
        const next = pendingPointer;
        if (!next) return;
        if (
          drag &&
          drag === next.dragSession &&
          drag.pointerId === next.pointerId
        ) {
          applyDrag(next.point);
        } else if (!drag && next.type !== "touch") pick(next.point);
      });
    });
    function applyDrag(point) {
      if (!drag) return;
      const dx = point[0] - drag.start[0],
        dy = point[1] - drag.start[1];
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      $("globe").classList.add("dragging");
      hovered = null;
      selected = null;
      const factor = 72 / radius;
      projection.rotate([
        drag.rotate[0] + dx * factor,
        clamp(drag.rotate[1] - dy * factor, -89, 89),
        0,
      ]);
      render();
    }
    function cancelDrag() {
      const previous = drag;
      drag = null;
      pendingPointer = null;
      $("globe").classList.remove("dragging");
      if (previous && $("globe").hasPointerCapture(previous.pointerId))
        $("globe").releasePointerCapture(previous.pointerId);
    }
    function endDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (event.type === "pointerup") applyDrag(eventPoint(event));
      const moved = drag.moved;
      cancelDrag();
      if (!moved && event.type !== "pointercancel")
        pick(eventPoint(event), true);
      else updateOverlay();
    }
    on($("globe"), "pointerup", endDrag);
    on($("globe"), "pointercancel", endDrag);
    on($("globe"), "lostpointercapture", (event) => {
      if (drag?.pointerId === event.pointerId) cancelDrag();
    });
    on(window, "blur", cancelDrag);
    on($("globe"), "pointerleave", () => {
      if (!drag) {
        hovered = null;
        updateOverlay();
      }
    });
    function resetView() {
      cancelDrag();
      projection.rotate([-105, -23, 0]);
      hovered = null;
      selected = null;
      pointer = null;
      $("region-select").value = "";
      render();
      announce(`已回到中国，当前常居地是${displayName(home)}。`);
    }
    on($("reset-view"), "click", resetView);
    on($("globe"), "keydown", (event) => {
      if (event.key === "Home") {
        event.preventDefault();
        resetView();
        return;
      }
      if (event.key === "Escape") {
        selected = null;
        hovered = null;
        updateOverlay();
        return;
      }
      const change = {
        ArrowLeft: [-6, 0],
        ArrowRight: [6, 0],
        ArrowUp: [0, 6],
        ArrowDown: [0, -6],
      }[event.key];
      if (!change) return;
      event.preventDefault();
      const current = projection.rotate();
      projection.rotate([
        current[0] + change[0],
        clamp(current[1] + change[1], -89, 89),
        0,
      ]);
      hovered = null;
      selected = null;
      render();
    });
    const select = $("region-select");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "请选择省份、国家或地区";
    placeholder.disabled = true;
    select.append(placeholder);
    const ordered = [
      ...provinces,
      ...countries
        .slice()
        .sort((a, b) => displayName(a).localeCompare(displayName(b), "zh-CN")),
    ];
    ordered.forEach((feature) => {
      const option = document.createElement("option");
      option.value = feature.properties.id;
      option.textContent = displayName(feature);
      select.append(option);
    });
    select.value = "";
    on(select, "change", () => {
      cancelDrag();
      const feature = featureById.get(select.value);
      if (!feature) return;
      const coordinate = feature.properties.center;
      projection.rotate([-coordinate[0], -coordinate[1], 0]);
      hovered = null;
      selected = feature;
      pointer = null;
      $("locator").hidden=true;
      $("open-locator").setAttribute("aria-expanded","false");
      $("open-locator").focus({preventScroll:true});
      render();
      announce(
        `${displayName(feature)}，${feature === home ? "常居地" : summaries.has(feature.properties.id) ? "已点亮" : "未点亮"}。已手动定位。`,
      );
    });
    on($("open-locator"), "click", () => {
      const open = $("locator").hidden;
      $("locator").hidden = !open;
      $("open-locator").setAttribute("aria-expanded", String(open));
      if (open) {
        // Start a fresh choice so choosing the previous region fires a native change.
        select.value = "";
        select.focus();
      }
    });
    on(document, "keydown", (event) => {
      if (event.key === "Escape") {
        $("locator").hidden = true;
        $("open-locator").setAttribute("aria-expanded", "false");
      }
    });
    for (const source of raw.sources || []) {
      const link = document.createElement("a");
      link.textContent = source.name;
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      $("source-list").append(link);
    }
    $("data-notes").textContent = (raw.notes || []).join(" ");
    let resizeFrame=0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;resize();});
    });
    const themeObserver=new MutationObserver(()=>{if(active())drawStars();});
    themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    observer.observe(stage);
    const immersion=document.querySelector(".footprint-immersion");
    if(immersion)observer.observe(immersion);
    resize();
    loading.hidden = true;
    let pulseFrame = 0;
    function pulse(time) {
      pulseFrame = 0;
      if (disposed || !active() || reducedMotion.matches) return;
      const textured = stage.dataset.earthTextured === "true";
      homePath.attr("opacity", (textured ? 0.62 : 0.88) + Math.sin(time / 1250) * (textured ? 0.08 : 0.1));
      markerRing.attr("opacity", 0.44 + Math.sin(time / 1250) * 0.18);
      pulseFrame = requestAnimationFrame(pulse);
    }
    function resume() {
      cancelAnimationFrame(pulseFrame);
      pulseFrame = 0;
      if (disposed) return;
      if (!active()) {
        cancelDrag();
        cancelAnimationFrame(moveFrame);
        moveQueued = false;
        pendingPointer = null;
        return;
      }
      resize();
      drawStars(); // Theme can change while this panel is hidden.
      homePath.attr("opacity", stage.dataset.earthTextured === "true" ? 0.66 : 1);
      if (!reducedMotion.matches) pulseFrame = requestAnimationFrame(pulse);
    }
    on(document, "visibilitychange", resume);
    on(document, "footprint:activate", resume);
    on(document, "footprint:layout-ready", ()=>{if(active()){resize();updateOverlay();}});
    on(reducedMotion, "change", resume);
    function dispose() {
      disposed = true;
      stopDetailMotion(); hoverAnimation?.cancel();
      earthSurface?.dispose();
      cancelDrag();
      cancelAnimationFrame(pulseFrame);
      cancelAnimationFrame(moveFrame);
      cancelAnimationFrame(resizeFrame);
      themeObserver.disconnect();
      clearTimeout(announceTimer);
      observer.disconnect();
      for (const remove of listeners) remove();
    }
    on(window, "pagehide", dispose);
    resume();
    // Read-only diagnostic helpers for geometry checks; no travel data is created.
    window.footprintSample = Object.freeze({
      isAnimating: () => !!pulseFrame,
      publishedCounts: () =>
        records.regions.map((r) => ({ id: r.regionId, count: r.count })),
      featureCount: features.length,
      homeId: home.properties.id,
      getView: () => ({
        rotation: projection.rotate(),
        center: [cx, cy],
        radius,
        width,
        height,
      }),
      identifyCoordinate: (coordinate) => {
        const f = priority.find((feature) =>
          d3.geoContains(feature, coordinate),
        );
        return f ? { id: f.properties.id, name: displayName(f) } : null;
      },
      projectCoordinate: (coordinate) =>
        visible(coordinate) ? projection(coordinate) : null,
      identifyScreenPoint: (point) => {
        const f = featureAt(point);
        return f ? { id: f.properties.id, name: displayName(f) } : null;
      },
      getSelected: () => selected?.properties.id || null,
    });
    return dispose;
  } catch (error) {
    if (loading) loading.textContent = `足迹未能载入：${error.message}`;
    console.error(error);
    return () => {};
  }
}
