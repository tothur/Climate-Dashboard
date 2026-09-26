import { useEffect, useState } from "react";

// Pixel layout shared by all Climate Reanalyzer "Today's Weather" world maps (1100 px wide):
// title band on top, the globe, then a colour bar with its tick labels underneath.
const SOURCE_WIDTH = 1100;
const MAP_ROWS: [number, number] = [61, 728];
const BAR_COLUMNS: [number, number] = [11, 1090];
const BAR_ROWS: [number, number] = [752, 768];
const LABEL_ROWS: [number, number] = [774, 792];
const BLANK_BANDS: Array<[number, number]> = [
  [49, 58],
  [731, 748],
];
const NEAR_WHITE = 238;

interface ProcessedMap {
  mapUrl: string;
  barUrl: string;
  labelsUrl: string;
  /** Horizontal centres of the tick labels, as a percentage of the source width. */
  labelCenters: number[];
}

const processedCache = new Map<string, Promise<ProcessedMap | null>>();
const resolvedCache = new Map<string, ProcessedMap | null>();

function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}

function canvasToUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("Empty canvas"))), "image/png");
  });
}

function cropCanvas(image: HTMLImageElement, [x0, x1]: [number, number], [y0, y1]: [number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = x1 - x0;
  canvas.height = y1 - y0;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(image, x0, y0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

/** Checks that the image still has the expected layout before cropping it. */
function hasExpectedLayout(image: HTMLImageElement): boolean {
  if (image.naturalWidth !== SOURCE_WIDTH || image.naturalHeight < LABEL_ROWS[1] || image.naturalHeight > 820) return false;
  const { context } = cropCanvas(image, [0, SOURCE_WIDTH], [0, image.naturalHeight]);
  const isBlankRow = (y: number) => {
    const row = context.getImageData(0, y, SOURCE_WIDTH, 1).data;
    for (let i = 0; i < row.length; i += 4) {
      if (row[i] < NEAR_WHITE || row[i + 1] < NEAR_WHITE || row[i + 2] < NEAR_WHITE) return false;
    }
    return true;
  };
  for (const [start, end] of BLANK_BANDS) {
    for (let y = start; y <= end; y += 1) if (!isBlankRow(y)) return false;
  }
  // The colour bar row should be mostly saturated colour, not page background.
  const barRow = context.getImageData(BAR_COLUMNS[0], Math.round((BAR_ROWS[0] + BAR_ROWS[1]) / 2), BAR_COLUMNS[1] - BAR_COLUMNS[0], 1).data;
  let coloured = 0;
  for (let i = 0; i < barRow.length; i += 4) {
    if (Math.min(barRow[i], barRow[i + 1], barRow[i + 2]) < 200) coloured += 1;
  }
  return coloured / (barRow.length / 4) > 0.5;
}

/** Removes the white page background around the globe; white inside the outline (data) is kept. */
function clearOutsideGlobe(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x += 1) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y += 1) stack.push(y * width, y * width + width - 1);

  while (stack.length) {
    const pixel = stack.pop() as number;
    if (visited[pixel]) continue;
    visited[pixel] = 1;
    const i = pixel * 4;
    if (data[i] <= NEAR_WHITE || data[i + 1] <= NEAR_WHITE || data[i + 2] <= NEAR_WHITE) continue;
    data[i + 3] = 0;
    const x = pixel % width;
    if (x > 0) stack.push(pixel - 1);
    if (x < width - 1) stack.push(pixel + 1);
    if (pixel >= width) stack.push(pixel - width);
    if (pixel < width * (height - 1)) stack.push(pixel + width);
  }

  // Turn the anti-aliased light fringe along the outline into a soft dark edge so no halo shows on dark cards.
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const i = pixel * 4;
    if (data[i + 3] === 0) continue;
    const x = pixel % width;
    const touchesCleared =
      (x > 0 && data[i - 1] === 0) ||
      (x < width - 1 && data[i + 7] === 0) ||
      (pixel >= width && data[i - width * 4 + 3] === 0) ||
      (pixel < width * (height - 1) && data[i + width * 4 + 3] === 0);
    if (!touchesCleared) continue;
    const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (luminance <= 150) continue;
    data[i + 3] = Math.round(255 * Math.min(1, Math.max(0, (255 - luminance) / 105)));
    data[i] = data[i + 1] = data[i + 2] = 0;
  }
  context.putImageData(image, 0, 0);
}

/** Finds the horizontal centre of each tick label by grouping columns that contain dark text pixels. */
function findLabelCenters(context: CanvasRenderingContext2D, width: number, height: number): number[] {
  const data = context.getImageData(0, 0, width, height).data;
  const inkColumns: boolean[] = [];
  for (let x = 0; x < width; x += 1) {
    let ink = false;
    for (let y = 0; y < height && !ink; y += 1) {
      const i = (y * width + x) * 4;
      ink = (data[i] + data[i + 1] + data[i + 2]) / 3 < 140;
    }
    inkColumns.push(ink);
  }
  const centers: number[] = [];
  let start = -1;
  let lastInk = -100;
  for (let x = 0; x <= width; x += 1) {
    const ink = x < width && inkColumns[x];
    if (ink) {
      if (start < 0 || x - lastInk > 8) {
        if (start >= 0) centers.push(((start + lastInk) / 2 / width) * 100);
        start = x;
      }
      lastInk = x;
    }
  }
  if (start >= 0) centers.push(((start + lastInk) / 2 / width) * 100);
  return centers;
}

/** Keeps only the dark tick-label text of the colour bar, on a transparent background. */
function isolateLabelText(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
    data[i + 3] = Math.round(255 - luminance);
    data[i] = data[i + 1] = data[i + 2] = 0;
  }
  context.putImageData(image, 0, 0);
}

async function processMap(url: string): Promise<ProcessedMap | null> {
  try {
    const image = await loadImage(url);
    if (!hasExpectedLayout(image)) return null;

    const map = cropCanvas(image, [0, SOURCE_WIDTH], MAP_ROWS);
    clearOutsideGlobe(map.context, map.canvas.width, map.canvas.height);
    const bar = cropCanvas(image, BAR_COLUMNS, BAR_ROWS);
    const labels = cropCanvas(image, [0, SOURCE_WIDTH], LABEL_ROWS);
    const labelCenters = findLabelCenters(labels.context, labels.canvas.width, labels.canvas.height);
    isolateLabelText(labels.context, labels.canvas.width, labels.canvas.height);

    const [mapUrl, barUrl, labelsUrl] = await Promise.all([canvasToUrl(map.canvas), canvasToUrl(bar.canvas), canvasToUrl(labels.canvas)]);
    return { mapUrl, barUrl, labelsUrl, labelCenters };
  } catch {
    return null;
  }
}

function processedMapFor(url: string): Promise<ProcessedMap | null> {
  if (!isSameOrigin(url)) return Promise.resolve(null);
  let pending = processedCache.get(url);
  if (!pending) {
    pending = processMap(url).then((result) => {
      resolvedCache.set(url, result);
      return result;
    });
    processedCache.set(url, pending);
  }
  return pending;
}

interface ClimateMapImageProps {
  imageUrls: string[];
  alt: string;
  noImageLabel: string;
  scaleStartLabel?: string;
  scaleEndLabel?: string;
  /** Tick values printed under the colour bar, left to right; rendered as text when they match the image. */
  scaleTicks?: string[];
}

/**
 * Renders a Climate Reanalyzer world map without its baked-in title band and page background, so it sits
 * directly on the card in light and dark themes. Falls back to the original image for cross-origin sources
 * or an unexpected layout, and to the next URL when an image fails to load.
 */
export function ClimateMapImage({ imageUrls, alt, noImageLabel, scaleStartLabel, scaleEndLabel, scaleTicks }: ClimateMapImageProps) {
  const candidates = imageUrls.filter((url, index, list) => url.trim().length > 0 && list.indexOf(url) === index);
  const candidateKey = candidates.join("|");
  const [activeIndex, setActiveIndex] = useState(0);
  const [processed, setProcessed] = useState<ProcessedMap | null | undefined>(() =>
    candidates[0] && resolvedCache.has(candidates[0]) ? resolvedCache.get(candidates[0]) : undefined
  );
  const [failed, setFailed] = useState(false);
  const activeUrl = candidates[activeIndex] ?? "";

  useEffect(() => {
    setActiveIndex(0);
    setFailed(false);
  }, [candidateKey]);

  useEffect(() => {
    let cancelled = false;
    if (!activeUrl) return;
    if (resolvedCache.has(activeUrl)) {
      setProcessed(resolvedCache.get(activeUrl));
      return;
    }
    setProcessed(undefined);
    processedMapFor(activeUrl).then((result) => {
      if (!cancelled) setProcessed(result);
    });
    return () => {
      cancelled = true;
    };
  }, [activeUrl]);

  if (!activeUrl || failed) return <div className="climate-map-empty">{noImageLabel}</div>;

  if (processed === undefined) {
    return (
      <figure className="climate-map is-loading" aria-busy="true">
        <div className="climate-map-placeholder" />
      </figure>
    );
  }

  if (processed) {
    return (
      <figure className="climate-map">
        <img className="climate-map-image" src={processed.mapUrl} alt={alt} />
        <div className="climate-map-scale" aria-hidden="true">
          <img className="climate-map-scale-bar" src={processed.barUrl} alt="" />
          {scaleTicks && scaleTicks.length === processed.labelCenters.length ? (
            <div className="climate-map-scale-ticks">
              {scaleTicks.map((tick, index) => (
                <span key={`${tick}-${index}`} style={{ left: `${processed.labelCenters[index]}%` }}>
                  {tick.replace(/^-/, "−")}
                </span>
              ))}
            </div>
          ) : (
            <img className="climate-map-scale-labels" src={processed.labelsUrl} alt="" />
          )}
          {scaleStartLabel || scaleEndLabel ? (
            <div className="climate-map-scale-notes">
              <span>{scaleStartLabel}</span>
              <span>{scaleEndLabel}</span>
            </div>
          ) : null}
        </div>
      </figure>
    );
  }

  return (
    <figure className="climate-map climate-map-original">
      <img
        className="climate-map-original-image"
        src={activeUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => {
          if (activeIndex + 1 < candidates.length) setActiveIndex(activeIndex + 1);
          else setFailed(true);
        }}
      />
    </figure>
  );
}
