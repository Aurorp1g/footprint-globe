export interface SimpleVisitInput {
  id?: string;
  regionId: string;
  name?: string;
  title: string;
  startDate: string;
  endDate?: string;
  remark?: string;
  demo?: boolean;
  coordinate?: number[] | null;
  locationLevel?: string;
  photoUrl?: string | null;
  photoAlt?: string;
}

export interface FootprintConfigInput {
  residenceId?: string;
  settingsTitle?: string;
  visits?: SimpleVisitInput[];
  regions?: any[];
  records?: any[];
}

export function visitBrightness(count: number, residence = false) {
  return residence ? 1 : count <= 0 ? 0 : Math.min(0.78, 0.32 + 0.14 * Math.log2(count + 1));
}

export function buildTravelDataset(input: FootprintConfigInput) {
  const residenceId = input.residenceId || "CN-44";
  if (Array.isArray(input.regions) && input.regions.length > 0) {
    return {
      residenceId,
      settingsTitle: input.settingsTitle || "",
      records: input.records || [],
      regions: input.regions,
    };
  }
  const rawVisits = Array.isArray(input.visits) ? input.visits : [];
  const records = rawVisits.map((v, i) => ({
    id: v.id || `visit-${i + 1}`,
    slug: v.id || `visit-${i + 1}`,
    regionId: v.regionId,
    name: v.name,
    title: v.title,
    startDate: v.startDate,
    endDate: v.endDate || v.startDate,
    remark: v.remark || "",
    demo: Boolean(v.demo),
    coordinate:
      Array.isArray(v.coordinate) && v.coordinate.length >= 2
        ? ([Number(v.coordinate[0]), Number(v.coordinate[1])] as [number, number])
        : null,
    locationLevel: v.locationLevel || (v.regionId.startsWith("CN-") ? "省级定位" : "地区级定位"),
    photoUrl: v.photoUrl || null,
    photoAlt: v.photoAlt || v.title,
  }));

  const byRegion = new Map<string, typeof records>();
  for (const r of records) {
    const list = byRegion.get(r.regionId) || [];
    list.push(r);
    byRegion.set(r.regionId, list);
  }
  if (!byRegion.has(residenceId)) {
    byRegion.set(residenceId, []);
  }

  const regions = [...byRegion.entries()].map(([regionId, list]) => {
    const sorted = [...list].sort(
      (a, b) => b.endDate.localeCompare(a.endDate) || b.startDate.localeCompare(a.startDate),
    );
    const latest = sorted[0] || null;
    const isResidence = regionId === residenceId;
    return {
      regionId,
      name: latest?.name || (isResidence && regionId === "CN-44" ? "广东省" : regionId),
      residence: isResidence,
      count: list.length,
      brightness: visitBrightness(list.length, isResidence),
      location: {
        coordinate: latest?.coordinate || (isResidence && regionId === "CN-44" ? [113.26, 23.13] : null),
        level: latest?.locationLevel || (regionId.startsWith("CN-") ? "省级定位" : "地区级定位"),
      },
      latest: latest
        ? {
            id: latest.id,
            startDate: latest.startDate,
            endDate: latest.endDate,
            demo: latest.demo,
          }
        : null,
      cover: {
        reason: latest?.photoUrl ? "order" : "empty",
        photo: latest?.photoUrl ? { id: latest.id, alt: latest.photoAlt, caption: "" } : null,
        src: latest?.photoUrl || null,
      },
      photos: sorted
        .filter((r) => r.photoUrl)
        .map((r) => ({
          id: r.id,
          alt: r.photoAlt || r.title,
          src: r.photoUrl,
          coordinate: r.coordinate,
          locationLevel: r.locationLevel,
          startDate: r.startDate,
          endDate: r.endDate,
          demo: r.demo,
        })),
    };
  });

  return {
    residenceId,
    settingsTitle: input.settingsTitle || "个人足迹记录",
    records,
    regions,
  };
}