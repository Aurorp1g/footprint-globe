# 同一地区多图片切换 & 标记点同步跟随

> **适用项目**：footprint-globe（个人足迹地球可视化）
> **目标**：当同一省份 / 地区有多条访问记录、多张照片时，卡片区支持**左右切换图片**，地球上的**标记点（pin）同步跳到对应坐标**，卡片中的日期、位置描述也一并更新。
>
> 给 AI Agent 用的复刻指南 —— 逐文件、逐位置说明改动。

---

## 1. 功能概览

| 改动前 | 改动后 |
|---|---|
| 每地区只显示最新一张照片 | 所有该地区的照片左右滑动切换 |
| 标记点钉死在最新访问地坐标 | 切到哪张照片，标记点跳到哪 |
| 无切换控件 | 毛玻璃圆形箭头 + `2 / 8` 计数器 |
| 卡片日期固定 | 日期随当前照片变化 |

核心思路：

1. **数据层**（`travel.ts`）：region 新增 `photos[]`，每条照片携带自己的 `coordinate`、`locationLevel`、`startDate`、`endDate`
2. **渲染层**（`globe.js`）：弃用单一 `cover.src`，改读 `photos[]` 数组；多于 1 张则渲染导航；切图前 mutate `summary.location` 和 `summary.latest`，再调 `updateOverlay()` 刷新全卡片
3. **样式层**（`footprint.css`）：`.photo-nav` 左右圆形按钮 + `.photo-counter` 底部计数标签

---

## 2. 数据结构层 —— `src/core/travel.ts`

### 2.1 原始代码（修改前）

位置：`buildTravelDataset` 函数中 `regions` 数组的 `map` 回调末尾（紧接 `cover` 定义）

```ts
cover: {
  reason: latest?.photoUrl ? "order" : "empty",
  photo: latest?.photoUrl ? { id: latest.id, alt: latest.photoAlt, caption: "" } : null,
  src: latest?.photoUrl || null,
},
    };
  });
```

只有一个 `cover`，`src` 固定指向该地区**最新**一条记录的 `photoUrl`。

### 2.2 修改后代码

在 `cover` 闭合花括号 `}` 之后、region 对象闭合 `};` 之前，**新增** `photos` 字段：

```ts
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
```

**语义**：

- `sorted` 是按 `endDate` 降序排列的该地区所有 visit
- `.filter(r => r.photoUrl)` 只保留有图的记录
- 每条 photo 携带 `coordinate`（经纬度 `[lng, lat]`）、`locationLevel`（如 `"汕头 · 坐标定位"`）、`startDate` / `endDate`、`demo`
- `cover` 字段保留不动，确保向后兼容（老数据或无 `photos` 字段时 fallback）

### 2.3 类型说明

修改不影响任何导出的 TypeScript 接口（`buildTravelDataset` 返回类型由 TS 自动推断）。但如果项目有显式的 region 类型定义，需补充：

```ts
photos?: Array<{
  id: string;
  alt: string;
  src: string;
  coordinate: [number, number] | null;
  locationLevel: string;
  startDate: string;
  endDate: string;
  demo: boolean;
}>;
```

---

## 3. 前端渲染层 —— `src/core/globe.js`

### 3.1 原始代码（修改前）

位置：`updateOverlay` 函数中，搜索定位字符串 `const box = stage.querySelector(".photo-empty")`，完整原始代码如下：

```js
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
```

只处理 `summary.cover.src` 单个图片源。

### 3.2 修改后代码

**删除**上述整段（从 `const box = stage.querySelector(".photo-empty"),` 到它对应的闭合 `}`），**替换为**：

```js
const box = stage.querySelector(".photo-empty"),
  photos = (summary.photos && summary.photos.length > 0)
    ? summary.photos
    : (summary.cover.src
        ? [{ id: summary.cover.photo?.id, alt: summary.cover.photo?.alt, src: summary.cover.src }]
        : []),
  photoKey = summary.regionId;
if (card.dataset.photoKey !== photoKey) {
  card.dataset.photoKey = photoKey;
  card.dataset.photoIdx = "0";
}
const photoIdx = parseInt(card.dataset.photoIdx || "0", 10);
const currentPhoto = photos[photoIdx] || null;
const showNav = photos.length > 1;
if (box.dataset.currentPhoto !== (currentPhoto?.src || "")) {
  box.dataset.currentPhoto = currentPhoto?.src || "";
  box.dataset.cover = currentPhoto?.src || "";
  box.replaceChildren();
  if (currentPhoto) {
    const img = document.createElement("img");
    img.alt = currentPhoto.alt || "";
    img.loading = "lazy";
    img.src =
      (assetBase ? (assetBase === "/" ? "" : assetBase.replace(/\/$/, "")) : (document.documentElement.dataset.previewPrefix || "")) + currentPhoto.src;
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
    if (showNav) {
      const counter = document.createElement("span");
      counter.className = "photo-counter";
      counter.textContent = `${photoIdx + 1} / ${photos.length}`;
      const prevBtn = document.createElement("button");
      prevBtn.className = "photo-nav photo-prev";
      prevBtn.setAttribute("aria-label", "上一张");
      prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      const nextBtn = document.createElement("button");
      nextBtn.className = "photo-nav photo-next";
      nextBtn.setAttribute("aria-label", "下一张");
      nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      const navigate = (delta) => {
        const idx = parseInt(card.dataset.photoIdx || "0", 10);
        const newIdx = (idx + delta + photos.length) % photos.length;
        card.dataset.photoIdx = String(newIdx);
        const photo = photos[newIdx];
        if (photo && photo.coordinate && photo.coordinate.every(Number.isFinite)) {
          summary.location.coordinate = photo.coordinate;
          summary.location.level = photo.locationLevel || "坐标定位";
        }
        if (photo && photo.startDate) {
          summary.latest = {
            id: photo.id,
            startDate: photo.startDate,
            endDate: photo.endDate || photo.startDate,
            demo: photo.demo || false,
          };
        }
        updateOverlay();
      };
      prevBtn.addEventListener("click", (e) => { e.stopPropagation(); navigate(-1); });
      nextBtn.addEventListener("click", (e) => { e.stopPropagation(); navigate(1); });
      box.append(prevBtn, counter, nextBtn);
    }
  } else {
    const text = document.createElement("span");
    text.textContent = "尚未上传照片";
    if (emptyPhotoIcon) box.append(emptyPhotoIcon.cloneNode(true));
    box.append(text);
  }
}
```

### 3.3 分步拆解

#### Step A：获取照片列表

```js
photos = (summary.photos && summary.photos.length > 0)
  ? summary.photos
  : (summary.cover.src
      ? [{ id: summary.cover.photo?.id, alt: summary.cover.photo?.alt, src: summary.cover.src }]
      : []),
```

- 优先用 `summary.photos`（新字段）
- Fallback 到 `summary.cover.src` 构造单元素数组（兼容老数据）

#### Step B：地区切换时重置索引

```js
if (card.dataset.photoKey !== photoKey) {
  card.dataset.photoKey = photoKey;
  card.dataset.photoIdx = "0";
}
```

用 `data-photo-key` 比对 `regionId`，不同地区则照片索引归零。

#### Step C：渲染当前照片

```js
const currentPhoto = photos[photoIdx] || null;
```

根据 `data-photo-idx` 从数组中取当前照片。

#### Step D：缓存检查（避免重复渲染）

```js
if (box.dataset.currentPhoto !== (currentPhoto?.src || "")) {
```

用 `data-current-photo` 缓存当前渲染的 `src`，相同时跳过 DOM 重建。

#### Step E：生成导航控件（仅 `photos.length > 1`）

- **左箭头**（`photo-prev`）：SVG 向左 `polyline`
- **右箭头**（`photo-next`）：SVG 向右 `polyline`
- **计数器**（`photo-counter`）：`"2 / 8"` 格式文本

#### Step F：navigate 核心逻辑（最关键）

```js
const navigate = (delta) => {
  const idx = parseInt(card.dataset.photoIdx || "0", 10);
  const newIdx = (idx + delta + photos.length) % photos.length;  // 循环取余
  card.dataset.photoIdx = String(newIdx);
  const photo = photos[newIdx];
  // ① 同步标记点坐标到地球上
  if (photo && photo.coordinate && photo.coordinate.every(Number.isFinite)) {
    summary.location.coordinate = photo.coordinate;
    summary.location.level = photo.locationLevel || "坐标定位";
  }
  // ② 同步卡片日期
  if (photo && photo.startDate) {
    summary.latest = {
      id: photo.id,
      startDate: photo.startDate,
      endDate: photo.endDate || photo.startDate,
      demo: photo.demo || false,
    };
  }
  // ③ 触发全卡片重绘 → 标记点跳动 + 日期刷新 + 照片切换
  updateOverlay();
};
```

**关键点**：`summary` 是指向 `summaries` Map 中 region 对象的引用。直接 mutate `summary.location` 和 `summary.latest`，再调 `updateOverlay()` 时，该函数内部的 `point = summary?.location?.coordinate`、`$("visit-date")`、`$("location-note")`、`$("card-coordinates")` 都会自动读到新值，标记点随之跳到新位置。

---

## 4. 样式层 —— `src/styles/footprint.css`

### 4.1 新增样式

在 `.photo-empty[data-cover=""]::after` 规则之后、`.visit-stats` 之前，新增以下 CSS：

```css
#footprint .photo-empty .photo-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 3;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(160,200,235,.25);
  border-radius: 50%;
  background: rgba(10,22,38,.72);
  backdrop-filter: blur(6px);
  color: #c6ddf0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease, opacity 150ms ease;
  opacity: .65;
}
#footprint .photo-empty .photo-nav:hover {
  background: rgba(20,40,62,.88);
  border-color: rgba(160,200,235,.5);
  color: #eaf4fc;
  opacity: 1;
}
#footprint .photo-empty .photo-nav:active {
  background: rgba(30,55,82,.92);
  border-color: rgba(180,215,245,.6);
}
#footprint .photo-empty .photo-nav svg {
  width: 16px;
  height: 16px;
  stroke: #c6ddf0;
}
#footprint .photo-empty .photo-nav:hover svg {
  stroke: #edf6fd;
}
#footprint .photo-empty .photo-prev {
  left: 10px;
}
#footprint .photo-empty .photo-next {
  right: 10px;
}
#footprint .photo-empty .photo-counter {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  font-size: 11px;
  letter-spacing: .06em;
  color: #b0c6d9;
  background: rgba(12,24,40,.8);
  padding: 3px 10px;
  border-radius: 10px;
  backdrop-filter: blur(4px);
  pointer-events: none;
}
```

### 4.2 视觉设计说明

| 元素 | 效果 |
|---|---|
| `.photo-nav` | 32px 圆形、毛玻璃半透明底、居中垂直定位、默认 65% 透明度 |
| `.photo-nav:hover` | 不透明度 → 100%、背景加深、边框增亮 |
| `.photo-prev` | `left: 10px` 贴左侧 |
| `.photo-next` | `right: 10px` 贴右侧 |
| `.photo-counter` | 底部居中、胶囊形标签、`pointer-events: none`（不挡按钮点击） |

---

## 5. 数据格式要求

让本功能生效，`footprints.json` 中同一 `regionId` 的每条 visit 需要：

```json
{
  "id": "广东-汕头-1",
  "regionId": "CN-44",
  "name": "广东省",
  "title": "家与父母之所在，生我养我之故乡",
  "startDate": "2026-01-01",
  "endDate": "2026-01-01",
  "coordinate": [116.7515585, 23.4694075],
  "locationLevel": "汕头 · 坐标定位",
  "remark": "家与父母之所在，生我养我之故乡",
  "photoUrl": "/photos/汕头.jpg",
  "photoAlt": "家与父母之所在，生我养我之故乡",
  "demo": false
}
```

**关键字段**：
- `coordinate`：`[经度, 纬度]` —— 必须是有效数值对，否则标记点不会同步
- `photoUrl`：`/photos/xxx.jpg` —— 全地区至少一张有 `photoUrl` 的 visit
- `regionId`：相同的值归入同一地区，如 `"CN-44"` = 广东

---

## 6. Agent 复刻指令（可直接粘贴给 Agent）

```
请你按照以下精确步骤，为 footprint-globe 项目新增"同一地区多图片切换 + 标记点同步跟随"功能。

## 步骤 1：修改 src/core/travel.ts

在 buildTravelDataset 函数的 regions map 回调中，搜索定位文字：

cover: {
        reason: latest?.photoUrl ? "order" : "empty",
        photo: latest?.photoUrl ? { id: latest.id, alt: latest.photoAlt, caption: "" } : null,
        src: latest?.photoUrl || null,
      },

紧接上面的 `},` 之后、`};` 之前，新增以下 photos 字段：

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

注意：cover 的 `},` 和 新增的 `photos:` 之间需要逗号分隔。

## 步骤 2：修改 src/core/globe.js

在 updateOverlay 函数中，搜索定位字符串：

const box = stage.querySelector(".photo-empty"),

找到的整段代码是从 `const box = stage.querySelector(".photo-empty"),` 开始，到它对应的闭合 `}` 结束（大约 25 行）。这段代码处理的是单一照片显示逻辑。

将这段代码完整替换为：

const box = stage.querySelector(".photo-empty"),
  photos = (summary.photos && summary.photos.length > 0) ? summary.photos : (summary.cover.src ? [{ id: summary.cover.photo?.id, alt: summary.cover.photo?.alt, src: summary.cover.src }] : []),
  photoKey = summary.regionId;
if (card.dataset.photoKey !== photoKey) {
  card.dataset.photoKey = photoKey;
  card.dataset.photoIdx = "0";
}
const photoIdx = parseInt(card.dataset.photoIdx || "0", 10);
const currentPhoto = photos[photoIdx] || null;
const showNav = photos.length > 1;
if (box.dataset.currentPhoto !== (currentPhoto?.src || "")) {
  box.dataset.currentPhoto = currentPhoto?.src || "";
  box.dataset.cover = currentPhoto?.src || "";
  box.replaceChildren();
  if (currentPhoto) {
    const img = document.createElement("img");
    img.alt = currentPhoto.alt || "";
    img.loading = "lazy";
    img.src =
      (assetBase ? (assetBase === "/" ? "" : assetBase.replace(/\/$/, "")) : (document.documentElement.dataset.previewPrefix || "")) + currentPhoto.src;
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
    if (showNav) {
      const counter = document.createElement("span");
      counter.className = "photo-counter";
      counter.textContent = `${photoIdx + 1} / ${photos.length}`;
      const prevBtn = document.createElement("button");
      prevBtn.className = "photo-nav photo-prev";
      prevBtn.setAttribute("aria-label", "上一张");
      prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      const nextBtn = document.createElement("button");
      nextBtn.className = "photo-nav photo-next";
      nextBtn.setAttribute("aria-label", "下一张");
      nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      const navigate = (delta) => {
        const idx = parseInt(card.dataset.photoIdx || "0", 10);
        const newIdx = (idx + delta + photos.length) % photos.length;
        card.dataset.photoIdx = String(newIdx);
        const photo = photos[newIdx];
        if (photo && photo.coordinate && photo.coordinate.every(Number.isFinite)) {
          summary.location.coordinate = photo.coordinate;
          summary.location.level = photo.locationLevel || "坐标定位";
        }
        if (photo && photo.startDate) {
          summary.latest = {
            id: photo.id,
            startDate: photo.startDate,
            endDate: photo.endDate || photo.startDate,
            demo: photo.demo || false,
          };
        }
        updateOverlay();
      };
      prevBtn.addEventListener("click", (e) => { e.stopPropagation(); navigate(-1); });
      nextBtn.addEventListener("click", (e) => { e.stopPropagation(); navigate(1); });
      box.append(prevBtn, counter, nextBtn);
    }
  } else {
    const text = document.createElement("span");
    text.textContent = "尚未上传照片";
    if (emptyPhotoIcon) box.append(emptyPhotoIcon.cloneNode(true));
    box.append(text);
  }
}

## 步骤 3：修改 src/styles/footprint.css

搜索定位文字（全局唯一）：

#footprint .photo-empty[data-cover=""]::after{color:#adc0d1;font-size:12px}

在该规则与下一规则 `#footprint .visit-stats` 之间，插入以下 CSS：

#footprint .photo-empty .photo-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:3;width:32px;height:32px;border:1px solid rgba(160,200,235,.25);border-radius:50%;background:rgba(10,22,38,.72);backdrop-filter:blur(6px);color:#c6ddf0;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:background 150ms ease,border-color 150ms ease,color 150ms ease,opacity 150ms ease;opacity:.65}
#footprint .photo-empty .photo-nav:hover{background:rgba(20,40,62,.88);border-color:rgba(160,200,235,.5);color:#eaf4fc;opacity:1}
#footprint .photo-empty .photo-nav:active{background:rgba(30,55,82,.92);border-color:rgba(180,215,245,.6)}
#footprint .photo-empty .photo-nav svg{width:16px;height:16px;stroke:#c6ddf0}
#footprint .photo-empty .photo-nav:hover svg{stroke:#edf6fd}
#footprint .photo-empty .photo-prev{left:10px}
#footprint .photo-empty .photo-next{right:10px}
#footprint .photo-empty .photo-counter{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);z-index:3;font-size:11px;letter-spacing:.06em;color:#b0c6d9;background:rgba(12,24,40,.8);padding:3px 10px;border-radius:10px;backdrop-filter:blur(4px);pointer-events:none}

## 步骤 4：数据格式要求
footprints.json 中同一 regionId 的每条 visit 必须包含字段：coordinate（[经度,纬度]）、photoUrl、locationLevel、startDate、endDate。
```

---

## 7. 注意事项（Agent 复刻时必须遵守）

1. **`box.dataset.cover` 不可省略**：替换代码中有一行 `box.dataset.cover = currentPhoto?.src || "";`，这行必须保留。因为 CSS 用 `[data-cover=""]` 选择器触发空状态的装饰性 SVG 背景，删掉会导致空状态样式丢失。

2. **`summary` 是引用不是拷贝**：`globe.js` 中 `const summary = summaries.get(feature.properties.id)` 拿到的 `summary` 直接指向 `summaries` Map 中的 region 对象。所以 `navigate` 里 `summary.location.coordinate = photo.coordinate` 是直接 mutate Map 中的原始数据，后续 `updateOverlay()` 重绘时经纬度、日期全部自动跟着变。**不需要**做 `summaries.set()` 之类的手动回写。

3. **`.photo-empty` 必须有 `position: relative`**：项目的 `footprint.css` 中 `.photo-empty` 已经设置了 `position:relative`（第 822 行附近）。不用担心。

4. **不会无限递归**：`navigate` 内部调 `updateOverlay()`，`updateOverlay` 会再次进入照片渲染逻辑。但照片区的缓存检查 `box.dataset.currentPhoto !== currentPhoto.src` 保证同一张照片不会重复重建 DOM。

5. **循环切换**：`(idx + delta + photos.length) % photos.length` 确保最后一张点右箭头回到第一张，第一张点左箭头跳到最后一张。

---

## 8. 验证清单

完成修改后确认以下行为：

- [ ] 只有一张图的地区 → 无箭头、无计数器，行为和改动前一致
- [ ] 多张图的地区 → 显示左右箭头 + 计数器（如 `1 / 5`）
- [ ] 点击右箭头 → 照片切换、计数器 `2 / 5`、地球标记点跳到新坐标
- [ ] 点击左箭头 → 照片切换、标记点跳回
- [ ] 在最后一张点右箭头 → 循环回第一张
- [ ] 在第一张点左箭头 → 循环到最后一张
- [ ] 点击另一个省份 → 照片索引归零，显示该省份第一张
- [ ] 卡片中的日期、位置描述随切图同步变化
- [ ] 卡片中的经纬度标注随切图同步变化
- [ ] 空状态（无图片地区）→ 显示"尚未上传照片"
- [ ] 图片加载失败 → 显示"照片加载失败"