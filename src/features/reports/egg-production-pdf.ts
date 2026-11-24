import {
  getEggProductionComparisonResult,
  type EggProductionComparison,
} from "./egg-production-comparison.ts";

export type EggProductionPdfRecord = {
  collectedAt: string;
  entryType: "collection" | "opening_stock";
  productId: string;
  productName: string;
  blockName: string | null;
  quantity: number;
  unitName: string;
  eggs: number;
  conversionFactor: number;
  isBaseUnit: boolean;
  availableUnits?: {
    name: string;
    conversionFactor: number;
    isBaseUnit: boolean;
  }[];
};

export function getEggProductionPdfFilename(
  from: string,
  to: string,
  today: string,
): string {
  if (!from && !to) return `egg-production-${today}`;
  if (from && to && from !== to) return `egg-production-${from}_to_${to}`;
  return `egg-production-${from || to || today}`;
}

export function createEggProductionPdfHtml({
  farmName,
  logoUri,
  timezone,
  generatedAt,
  from,
  to,
  today,
  collections,
  openingStock,
  previousCollections,
  comparison,
}: {
  farmName: string;
  logoUri?: string | null;
  timezone: string;
  generatedAt: Date;
  from: string;
  to: string;
  today: string;
  collections: EggProductionPdfRecord[];
  openingStock: EggProductionPdfRecord[];
  previousCollections: EggProductionPdfRecord[];
  comparison: EggProductionComparison | null;
}): string {
  const total = sumEggs(collections);
  const previousTotal = sumEggs(previousCollections);
  const result = comparison
    ? getEggProductionComparisonResult(total, previousTotal)
    : null;
  const currentByProduct = groupBy(collections, (row) => row.productId);
  const previousByProduct = groupBy(previousCollections, (row) => row.productId);
  const currentByBlock = groupBy(collections, (row) => row.blockName ?? "Not assigned");
  const productIds = new Set([...currentByProduct.keys(), ...previousByProduct.keys()]);
  const productRows = [...productIds]
    .map((id) => {
      const currentRows = currentByProduct.get(id) ?? [];
      const previousRows = previousByProduct.get(id) ?? [];
      return {
        name: currentRows[0]?.productName ?? previousRows[0]?.productName ?? "Egg product",
        eggs: sumEggs(currentRows),
        previous: sumEggs(previousRows),
      };
    })
    .sort((a, b) => b.eggs - a.eggs);
  const blockRows = [...currentByBlock.entries()]
    .map(([name, rows]) => ({ name, eggs: sumEggs(rows) }))
    .sort((a, b) => b.eggs - a.eggs);
  const maxEggs = Math.max(1, ...productRows.map((row) => row.eggs), ...blockRows.map((row) => row.eggs));
  const currentDates = [...new Set(collections.map((row) => localDateKey(row.collectedAt, timezone)))].sort();
  const periodDuration = from && to
    ? daysBetween(from, to)
    : from || to
      ? currentDates.length > 1
        ? daysBetween(currentDates[0], currentDates[currentDates.length - 1])
        : currentDates.length
      : currentDates.length
        ? daysBetween(currentDates[0], today)
        : 0;
  const dailyRows = new Map<string, number>();
  for (const row of collections) {
    const date = localDateKey(row.collectedAt, timezone);
    dailyRows.set(date, (dailyRows.get(date) ?? 0) + row.eggs);
  }
  const generated = formatDateTime(generatedAt, timezone);
  const logo = logoUri
    ? `<img class="logo" src="${escapeHtml(logoUri)}" alt="" onerror="this.style.display='none'">`
    : `<div class="logo-fallback">F</div>`;
  const recordedConversionFactors = getConversionFactors(
    [...collections, ...openingStock],
    timezone,
  );
  const conversionNote = formatConversionNote(recordedConversionFactors, timezone);
  const comparisonLabel = comparison?.label ?? "";
  const comparisonValue = result
    ? result.kind === "new"
      ? "New: no collections in the previous period"
      : result.kind === "empty"
        ? "0 eggs"
        : result.kind === "equal"
          ? "0 eggs"
          : `${result.kind === "up" ? "▲ +" : "▼ −"}${formatNumber(Math.abs(result.change))} eggs`
    : "—";
  const comparisonPercent = result?.percentage === null || result?.percentage === undefined
    ? ""
    : `${formatNumber(result.percentage)}%`;
  const comparisonContext = result?.kind === "new"
    ? comparisonLabel
    : result?.kind === "empty"
      ? `No collections in either period · ${comparisonLabel}`
      : result?.kind === "equal"
        ? `No change · ${comparisonLabel}`
        : comparisonLabel;
  const comparisonTone = result?.kind === "up"
    ? "positive"
    : result?.kind === "down"
      ? "negative"
      : "";
  const comparisonFigure = comparison && result
      ? `<div class="figure"><div class="figure-label">Comparison</div><div class="comparison-value ${comparisonTone}">${escapeHtml(comparisonValue)}${comparisonPercent ? ` · ${escapeHtml(comparisonPercent)}` : ""}</div><div class="figure-note">${escapeHtml(comparisonContext)}</div></div>`
      : "";
  const figureClass = comparisonFigure ? "figures" : "figures without-comparison";
  const periodYearStart = from.slice(0, 4);
  const periodYearEnd = to.slice(0, 4);
  const formattedPeriod = periodYearStart && periodYearStart === periodYearEnd && from !== to
      ? `${formatLocalDate(from, timezone, false).replace(/, \d{4}$/, "")} – ${formatLocalDate(to, timezone, false)}`
      : formatPeriod(from, to, today, timezone);
  const productBreakdown = productRows.length
    ? productRows.map((row) => {
        const change = getEggProductionComparisonResult(row.eggs, row.previous);
        const previousLabel = change.kind === "new"
          ? "New"
          : change.kind === "empty"
            ? "—"
            : change.kind === "equal"
              ? "0"
              : `${change.kind === "up" ? "▲ +" : "▼ −"}${formatNumber(Math.abs(change.change))}`;
        return `<div class="break-row ${comparison ? "" : "no-previous"}"><span class="break-name">${escapeHtml(row.name)}</span><span class="bar"><i style="width:${percent(row.eggs, maxEggs)}%"></i></span><strong>${formatNumber(row.eggs)} eggs</strong>${comparison ? `<span class="previous ${change.kind === "down" ? "negative" : change.kind === "up" ? "positive" : ""}">${previousLabel}</span>` : ""}</div>`;
      }).join("")
    : `<p class="muted">No collections in this period.</p>`;
  const blockBreakdown = blockRows.length
    ? blockRows.map((row) =>
        `<div class="break-row block-row"><span class="break-name">${escapeHtml(row.name)}</span><span class="bar"><i style="width:${percent(row.eggs, maxEggs)}%"></i></span><strong>${formatNumber(row.eggs)} eggs</strong></div>`,
      ).join("")
    : `<p class="muted">No collections in this period.</p>`;
  const dailyTable = periodDuration > 1
    ? `<section><h2>Daily totals</h2><table><thead><tr><th>Date</th><th class="number">Eggs collected</th></tr></thead><tbody>${[...dailyRows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, eggs]) => `<tr><td>${escapeHtml(formatLocalDate(date, timezone, true))}</td><td class="number">${formatNumber(eggs)}</td></tr>`).join("")}</tbody></table></section>`
    : "";
  const collectionTable = `<section><h2>Collections</h2><table><thead><tr><th>Date</th><th>Product</th><th>Block</th><th>Recorded</th><th class="number">Eggs</th></tr></thead><tbody>${collections.map((row) => `<tr><td>${escapeHtml(formatDateTime(row.collectedAt, timezone))}</td><td>${escapeHtml(row.productName)}</td><td class="${row.blockName ? "" : "muted"}">${escapeHtml(row.blockName ?? "Not assigned")}</td><td>${escapeHtml(formatRecorded(row))}</td><td class="number">${formatNumber(row.eggs)}</td></tr>`).join("")}</tbody><tfoot><tr><th colspan="4">Total collected</th><th class="number">${formatNumber(total)}</th></tr></tfoot></table></section>`;
  const openingTable = openingStock.length
    ? `<section><h2>Opening stock <span class="section-note">Not counted as production · ${openingStock.length} ${openingStock.length === 1 ? "entry" : "entries"}</span></h2><table><thead><tr><th>Date</th><th>Product</th><th>Block</th><th>Recorded</th><th class="number">Eggs</th></tr></thead><tbody>${openingStock.map((row) => `<tr><td>${escapeHtml(formatLocalDate(localDateKey(row.collectedAt, timezone), timezone, false))}</td><td>${escapeHtml(row.productName)}</td><td class="${row.blockName ? "" : "muted"}">${escapeHtml(row.blockName ?? "Not assigned")}</td><td>${escapeHtml(formatRecorded(row))}</td><td class="number">${formatNumber(row.eggs)}</td></tr>`).join("")}</tbody><tfoot><tr><th colspan="4">Opening stock total</th><th class="number">${formatNumber(sumEggs(openingStock))}</th></tr></tfoot></table></section>`
    : "";
  const openingSummary = openingStock.length
    ? `<p class="opening-summary"><strong>Opening stock entries:</strong> ${openingStock.length} · ${formatNumber(sumEggs(openingStock))} eggs · Not counted as production</p>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@page{size:A4 portrait;margin:13mm 12mm 18mm;@bottom-right{content:"Page " counter(page) " of " counter(pages);color:#53645c;font:7.5pt Arial,Helvetica,sans-serif}}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#17221e;font:9pt/1.35 Arial,Helvetica,sans-serif}
body{padding-bottom:12mm}header{display:flex;align-items:center;gap:10px;border-bottom:2.5pt solid #256b56;padding:0 0 9px}
.logo,.logo-fallback{width:34px;height:34px;object-fit:contain;border-radius:6px}.logo-fallback{display:flex;align-items:center;justify-content:center;background:#256b56;color:#fff;font-weight:bold;font-size:15pt}
.heading{flex:1}.heading h1{font-size:17pt;line-height:1.15;margin:0 0 2px}.farm{font-size:9pt;color:#53645c}
.meta{text-align:right;color:#53645c;font-size:8pt;line-height:1.55}.meta strong{color:#263b32}
.figures{display:grid;grid-template-columns:1.4fr .8fr 1.1fr;border-bottom:1px solid #aebbb4;margin:13px 0 15px}.figures.without-comparison{grid-template-columns:1.4fr .8fr}.figure{padding:5px 12px 9px 0}.figure+.figure{border-left:1px solid #cbd4cf;padding-left:12px}.figure-label{font-size:8pt;color:#53645c;font-weight:bold;text-transform:uppercase;letter-spacing:.04em}
.figure-value{font-size:19pt;font-weight:bold;margin-top:3px;font-variant-numeric:tabular-nums}.figure-main .figure-value{font-size:25pt}.figure-note{font-size:8pt;color:#53645c;margin-top:2px}.comparison-value{font-size:14pt;font-weight:bold;margin-top:5px}.positive{color:#17643e}.negative{color:#8e4a08}
.opening-summary{font-size:8pt;color:#53645c;margin:-7px 0 12px}.opening-summary strong{color:#263b32}
h2{font-size:11pt;margin:13px 0 6px}section{margin:0 0 11px;break-inside:auto}.section-note{font-size:8pt;color:#53645c;font-weight:normal;margin-left:5px}
.breakdowns{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:2px 0 7px}.breakdown h3{font-size:9pt;margin:0 0 5px}
.break-row{display:grid;grid-template-columns:minmax(65px,1fr) 1.2fr 72px 52px;align-items:center;gap:6px;min-height:20px;font-size:7.5pt}.break-row.no-previous{grid-template-columns:minmax(65px,1fr) 1.2fr 72px}.block-row{grid-template-columns:minmax(65px,1fr) 1.2fr 72px}.break-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar{height:5px;background:#e4e9e6;display:block}.bar i{display:block;height:100%;background:#608c7b}.break-row strong{text-align:right;white-space:nowrap}.previous{text-align:right;color:#53645c;font-size:7pt;white-space:nowrap}
table{width:100%;border-collapse:collapse;table-layout:auto;font-size:8pt}thead{display:table-header-group}tfoot{display:table-row-group}th,td{border-bottom:1px solid #cbd4cf;padding:5px 6px;text-align:left;vertical-align:top}thead th{border-top:1px solid #87978f;border-bottom:1.5px solid #87978f;font-size:7.5pt;text-transform:uppercase;letter-spacing:.025em}tfoot th{border-top:1.5px solid #61736a;font-weight:bold;background:#f2f5f3}tr{break-inside:avoid;page-break-inside:avoid}.number{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.muted{color:#758078}.note{font-size:7.5pt;color:#4f5c55;margin:9px 0 0}
footer{position:fixed;left:0;right:0;bottom:-12mm;padding-top:5px;border-top:1px solid #aebbb4;color:#53645c;font-size:7.5pt;display:flex;justify-content:space-between;background:#fff}
</style></head><body>
<header>${logo}<div class="heading"><h1>Egg production report</h1><div class="farm">${escapeHtml(farmName)}</div></div><div class="meta"><div><strong>Period:</strong> ${escapeHtml(formattedPeriod)}</div><div><strong>Generated:</strong> ${escapeHtml(generated)}</div></div></header>
<div class="${figureClass}">
 <div class="figure figure-main"><div class="figure-label">Eggs collected</div><div class="figure-value">${formatNumber(total)}</div><div class="figure-note">${escapeHtml(formatEggsAndPacks(collections))}</div></div>
 <div class="figure"><div class="figure-label">Collections</div><div class="figure-value">${collections.length}</div><div class="figure-note">records</div></div>
 ${comparisonFigure}
</div>
${openingSummary}
<div class="breakdowns"><div class="breakdown"><h2>By product</h2>${productBreakdown}</div><div class="breakdown"><h2>By block</h2>${blockBreakdown}</div></div>
${dailyTable}${collectionTable}${openingTable}
<p class="note">${escapeHtml(conversionNote)}</p>
<footer><span>${escapeHtml(farmName)} · Egg production report</span><span class="page-count"></span></footer>
</body></html>`;
}

export function formatEggsAndPacks(rows: EggProductionPdfRecord[]): string {
  const productRows = groupBy(rows, (row) => row.productId);
  const packTotals = new Map<string, { name: string; factor: number; eggs: number }>();
  const rowsWithoutPackUnit: EggProductionPdfRecord[] = [];

  for (const productRecords of productRows.values()) {
    const packUnit = productRecords[0].availableUnits
      ?.filter((unit) => !unit.isBaseUnit && Number.isFinite(unit.conversionFactor) && unit.conversionFactor > 1)
      .sort((a, b) => b.conversionFactor - a.conversionFactor)[0];
    if (!packUnit) {
      rowsWithoutPackUnit.push(...productRecords);
      continue;
    }

    const key = `${packUnit.name.toLocaleLowerCase()}:${packUnit.conversionFactor}`;
    const total = packTotals.get(key) ?? {
      name: packUnit.name,
      factor: packUnit.conversionFactor,
      eggs: 0,
    };
    total.eggs += sumEggs(productRecords);
    packTotals.set(key, total);
  }

  if (packTotals.size) {
    const parts = [...packTotals.values()].map(({ name, factor, eggs }) => {
      const packs = Math.floor((eggs + Number.EPSILON) / factor);
      const remainder = eggs - packs * factor;
      const packDescription = packs > 0
        ? `${formatNumber(packs)} ${plural(name.toLocaleLowerCase(), packs)}`
        : "";
      const eggDescription = remainder > 0 ? `${formatNumber(remainder)} eggs` : "";
      return [packDescription, eggDescription].filter(Boolean).join(" and ");
    }).filter(Boolean);

    if (rowsWithoutPackUnit.length) {
      const fallback = formatRecordedEggsAndPacks(rowsWithoutPackUnit);
      if (fallback) parts.push(fallback);
    }
    return parts.join(" · ") || `${formatNumber(sumEggs(rows))} eggs`;
  }

  return formatRecordedEggsAndPacks(rows);
}

function formatRecordedEggsAndPacks(rows: EggProductionPdfRecord[]): string {
  const packs = new Map<string, { quantity: number; eggsPerPack: number }>();
  let baseEggs = 0;
  for (const row of rows) {
    if (row.isBaseUnit) {
      baseEggs += row.eggs;
      continue;
    }
    const key = `${row.unitName}:${row.conversionFactor}`;
    const pack = packs.get(key) ?? {
      quantity: 0,
      eggsPerPack: row.conversionFactor,
    };
    pack.quantity += row.quantity;
    packs.set(key, pack);
  }
  const parts: string[] = [];
  for (const [key, pack] of packs) {
    const unitName = key.split(":")[0];
    parts.push(
      `${formatNumber(pack.quantity)} ${plural(unitName.toLocaleLowerCase(), pack.quantity)}`,
    );
  }
  if (baseEggs > 0 || parts.length === 0) {
    parts.push(`${formatNumber(baseEggs)} eggs`);
  }
  return parts.join(" and ");
}

function getConversionFactors(
  rows: EggProductionPdfRecord[],
  timezone: string,
): { unitName: string; factor: number; firstDate: string }[] {
  const factors = new Map<string, { unitName: string; factor: number; firstDate: string }>();
  for (const row of rows) {
    if (row.isBaseUnit || !Number.isFinite(row.conversionFactor)) continue;
    const date = localDateKey(row.collectedAt, timezone);
    const key = `${row.unitName.toLocaleLowerCase()}:${row.conversionFactor}`;
    const existing = factors.get(key);
    if (!existing || date < existing.firstDate) {
      factors.set(key, {
        unitName: row.unitName,
        factor: row.conversionFactor,
        firstDate: date,
      });
    }
  }
  return [...factors.values()].sort((a, b) => a.firstDate.localeCompare(b.firstDate));
}

function formatConversionNote(
  factors: { unitName: string; factor: number; firstDate: string }[],
  timezone: string,
): string {
  if (!factors.length) {
    return "Egg quantities use the conversion factor saved with each record.";
  }
  const descriptions = factors.map((item) => {
    const normalizedName = item.unitName.toLocaleLowerCase();
    const unitName = normalizedName.endsWith("s")
      ? normalizedName.slice(0, -1)
      : normalizedName;
    return `1 ${unitName} = ${formatNumber(item.factor)} eggs (factor on records from ${formatLocalDate(item.firstDate, timezone, false)})`;
  });
  if (factors.length === 1 && /tray/i.test(factors[0].unitName)) {
    return `Trays are converted to eggs using the tray size saved on each record: ${descriptions[0]}.`;
  }
  return `Units are converted to eggs using the factor saved on each record: ${descriptions.join("; ")}.`;
}

function formatPeriod(
  from: string,
  to: string,
  today: string,
  timezone: string,
): string {
  if (!from && !to) return `All dates through ${formatLocalDate(today, timezone, false)}`;
  if (!from) return `Through ${formatLocalDate(to, timezone, true)}`;
  if (!to) return `From ${formatLocalDate(from, timezone, true)} onward`;
  if (from === to) return formatLocalDate(from, timezone, true);
  return `${formatLocalDate(from, timezone, false)} – ${formatLocalDate(to, timezone, false)}`;
}

function formatDateTime(value: Date | string, timezone: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}

function formatLocalDate(value: string, _timezone: string, weekday: boolean): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    ...(weekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function localDateKey(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000,
  ) + 1;
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

function sumEggs(rows: EggProductionPdfRecord[]): number {
  return rows.reduce((sum, row) => sum + row.eggs, 0);
}

function percent(value: number, total: number): number {
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function plural(value: string, quantity: number): string {
  const normalized = value.toLocaleLowerCase();
  if (quantity === 1) return normalized.endsWith("s") ? value.slice(0, -1) : value;
  return normalized.endsWith("s") ? value : `${value}s`;
}

function formatRecorded(row: EggProductionPdfRecord): string {
  if (
    row.isBaseUnit ||
    /^(piece|pieces|pc|pcs|each|egg|eggs)$/i.test(row.unitName.trim())
  ) {
    return `${formatNumber(row.eggs)} eggs`;
  }
  return `${formatNumber(row.quantity)} ${plural(row.unitName.toLocaleLowerCase(), row.quantity)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
