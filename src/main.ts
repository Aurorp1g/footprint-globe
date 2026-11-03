import "./styles/demo.css";
import sampleData from "./data/footprints.sample.json";
import { buildTravelDataset } from "./core/travel";
import { initFootprintGlobe } from "./index";

const dataset = buildTravelDataset(sampleData);

const countEl = document.getElementById("visited-region-count");
if (countEl) {
  countEl.textContent = String(dataset.regions.filter((r) => r.count > 0).length);
}

void initFootprintGlobe({
  data: sampleData,
});

