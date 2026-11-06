import "./styles/demo.css";
import { buildTravelDataset } from "./core/travel";
import { initFootprintGlobe } from "./index";

let rawData;
try {
  rawData = (await import("./data/footprints.json")).default;
} catch {
  rawData = (await import("./data/footprints.sample.json")).default;
}

const dataset = buildTravelDataset(rawData);

const countEl = document.getElementById("visited-region-count");
if (countEl) {
  countEl.textContent = String(dataset.regions.filter((r) => r.count > 0).length);
}

void initFootprintGlobe({
  data: rawData,
});