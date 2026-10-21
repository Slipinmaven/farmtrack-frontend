import { zipSync, strToU8 } from "fflate";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

export type ReportExportCell = string | number | null;
export type ReportExportColumnKind = "text" | "number" | "currency" | "date";

export type ReportExportColumn = {
  key: string;
  label: string;
  kind?: ReportExportColumnKind;
};

export type ReportExportSheet = {
  name: string;
  columns: ReportExportColumn[];
  rows: Record<string, ReportExportCell>[];
  totals?: boolean;
  totalColumns?: string[];
  formulas?: Record<number, Record<string, string>>;
};
export type ReportExportChart = {
  title: string;
  categories: string[];
  series: { name: string; values: number[]; color?: string }[];
};

export type ReportExportData = {
  title: string;
  farmName: string;
  currencyCode?: string;
  farmLogoUri?: string | null;
  fromDate?: string;
  toDate?: string;
  charts?: ReportExportChart[];
  summary: {
    label: string;
    value: ReportExportCell;
    kind?: ReportExportColumnKind;
  }[];
  sheets: ReportExportSheet[];
};

export type ReportExportFormat = "pdf" | "xlsx" | "csv";

export async function exportReport(
  data: ReportExportData,
  format: ReportExportFormat,
): Promise<void> {
  const filename = `${slug(data.farmName)}-${slug(data.title)}-${dateStamp()}`;
  if (format === "pdf") {
    await exportPdf(data, filename);
  } else if (format === "xlsx") {
    await exportFile(
      `${filename}.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      createWorkbook(data),
    );
  } else {
    await exportFile(
      `${filename}.csv`,
      "text/csv;charset=utf-8",
      createCsv(data.sheets[0]),
    );
  }
}

function createPdfHtml(data: ReportExportData): string {
  const generated = new Date().toLocaleString();
  const period =
    data.fromDate || data.toDate
      ? `${data.fromDate || "Beginning"} to ${data.toDate || "Today"}`
      : "Current snapshot";
  const logo = data.farmLogoUri
    ? `<span class="logo-container"><img class="farm-logo" src="${escapeHtml(data.farmLogoUri)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"><span class="farm-logo-fallback">FT</span></span>`
    : `<span class="farm-logo-fallback">FT</span>`;
  const summaryRows = data.summary
    .map(
      ({ label, value, kind }) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(formatCell(value, kind, data.currencyCode))}</td></tr>`,
    )
    .join("");
  const sections = data.sheets
    .map((sheet) => {
      const headers = sheet.columns
        .map((column) => `<th>${escapeHtml(column.label)}</th>`)
        .join("");
      const rows = sheet.rows
        .map(
          (row) =>
            `<tr>${sheet.columns
              .map(
                (column) =>
                  `<td>${escapeHtml(
                    formatCell(row[column.key], column.kind, data.currencyCode),
                  )}</td>`,
              )
              .join("")}</tr>`,
        )
        .join("");
      return `<section><h2>${escapeHtml(sheet.name)}</h2><table><thead><tr>${headers}</tr></thead><tbody>${rows}${renderHtmlTotals(sheet)}</tbody></table></section>`;
    })
    .join("");
  const charts = (data.charts ?? [])
    .map((chart) => renderHtmlChart(chart, data.currencyCode))
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { size: ${data.sheets.some((sheet) => sheet.columns.length > 6) ? "landscape" : "portrait"}; margin: 16mm 12mm 20mm; @bottom-right { content: "Page " counter(page); color: #64748b; font: 9pt Arial, sans-serif; } }
  * { box-sizing: border-box; }
  body { color: #172b26; font: 10pt Arial, sans-serif; line-height: 1.4; }
  header { display: flex; align-items: center; gap: 12px; padding-bottom: 14px; border-bottom: 2px solid #20745b; }
  .logo-container { position: relative; display: inline-flex; width: 44px; height: 44px; }
  .farm-logo { width: 44px; height: 44px; object-fit: contain; border-radius: 8px; }
  .logo-container .farm-logo { position: absolute; inset: 0; }
  .farm-logo-fallback { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; color: white; background: #20745b; border-radius: 8px; font-weight: 700; font-size: 15pt; }
  .logo-container .farm-logo-fallback { display: none; position: absolute; inset: 0; }
  .brand { color: #64748b; font-size: 9pt; margin-bottom: 3px; }
  h1 { font-size: 20pt; margin: 0; }
  .meta { display: flex; gap: 24px; margin: 13px 0 18px; color: #475569; }
  h2 { font-size: 13pt; margin: 19px 0 7px; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 12px; }
  thead { display: table-header-group; }
  th, td { border: 1px solid #d8e1dd; padding: 6px 7px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  thead th { background: #edf4f0; color: #244c3e; font-weight: 700; }
  tbody tr:nth-child(even) { background: #f8faf9; }
  .summary th { width: 45%; }
  .total-row { font-weight: 700; background: #edf4f0 !important; }
  .chart-section { padding: 10px 12px; border: 1px solid #d8e1dd; border-radius: 6px; break-inside: avoid; }
  .chart-legend { display: flex; gap: 16px; margin-bottom: 10px; color: #475569; font-size: 9pt; }
  .chart-legend i { display: inline-block; width: 9px; height: 9px; margin-right: 5px; border-radius: 2px; }
  .chart-category { display: grid; grid-template-columns: 95px 1fr; gap: 5px 12px; align-items: center; margin: 7px 0; }
  .chart-category > strong { grid-row: 1 / span ${Math.max(1, data.charts?.[0]?.series.length ?? 1)}; font-size: 9pt; }
  .chart-series { display: grid; grid-template-columns: 75px 1fr 100px; gap: 7px; align-items: center; font-size: 8pt; }
  .chart-series-name { color: #475569; }
  .chart-track { height: 9px; background: #edf2ef; border-radius: 5px; overflow: hidden; }
  .chart-bar { display: block; height: 100%; border-radius: 5px; }
  .chart-number { text-align: right; }
  section { break-inside: auto; }
  tr { break-inside: avoid; }
  footer { color: #64748b; font-size: 8pt; margin-top: 18px; }
</style></head><body>
  <header>${logo}<div><div class="brand">${escapeHtml(data.farmName)} · FarmTrack</div><h1>${escapeHtml(data.title)}</h1></div></header>
  <div class="meta"><span><strong>Period:</strong> ${escapeHtml(period)}</span><span><strong>Generated:</strong> ${escapeHtml(generated)}</span></div>
  ${data.summary.length ? `<section><h2>Summary</h2><table class="summary"><tbody>${summaryRows}</tbody></table></section>` : ""}
  ${charts}
  ${sections}
  <footer>Prepared by FarmTrack for ${escapeHtml(data.farmName)}.</footer>
</body></html>`;
}

async function exportPdf(data: ReportExportData, filename: string): Promise<void> {
  const html = createPdfHtml(data);
  if (Platform.OS === "web") {
    await downloadWebPdf(html, filename);
    return;
  }

  const result = await Print.printToFileAsync({ html, base64: true });
  if (!result.base64) {
    throw new Error("The PDF renderer did not return the generated file data.");
  }
  if (!Paths.cache) {
    throw new Error("The device file cache is not available for report export.");
  }
  const pdfFile = new File(Paths.cache, `${filename}.pdf`);
  pdfFile.create({ intermediates: true, overwrite: true });
  pdfFile.write(result.base64, { encoding: "base64" });
  await shareFile(pdfFile.uri, `${filename}.pdf`, "application/pdf");
}

async function downloadWebPdf(html: string, filename: string): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;
  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = "1120px";
  container.style.backgroundColor = "#ffffff";

  for (const stylesheet of parsedDocument.head.querySelectorAll("style")) {
    container.append(stylesheet.cloneNode(true));
  }
  const content = document.createElement("div");
  content.innerHTML = parsedDocument.body.innerHTML;
  container.append(content);
  document.body.append(container);

  try {
    await document.fonts.ready;
    const pdf = await html2pdf()
      .set({
        margin: [12, 10, 16, 10],
        filename: `${filename}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 1.5,
          useCORS: true,
          backgroundColor: "#ffffff",
          windowWidth: 1120,
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: content.querySelector("table tr th:nth-child(7)")
            ? "landscape"
            : "portrait",
        },
      })
      .from(content)
      .toPdf()
      .get("pdf");

    const pageCount = pdf.internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page);
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(
        `Page ${page} of ${pageCount}`,
        pdf.internal.pageSize.getWidth() - 10,
        pdf.internal.pageSize.getHeight() - 6,
        { align: "right" },
      );
    }

    await pdf.save(`${filename}.pdf`);
  } finally {
    container.remove();
  }
}

async function exportFile(
  filename: string,
  mimeType: string,
  contents: string | Uint8Array,
): Promise<void> {
  if (Platform.OS === "web") {
    const blobPart =
      typeof contents === "string"
        ? contents
        : (() => {
            const buffer = new ArrayBuffer(contents.byteLength);
            new Uint8Array(buffer).set(contents);
            return buffer;
          })();
    const blob = new Blob([blobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  if (!Paths.cache) {
    throw new Error("The device file cache is not available for report export.");
  }
  const file = new File(Paths.cache, filename);
  file.create({ intermediates: true, overwrite: true });
  file.write(contents);
  await shareFile(file.uri, filename, mimeType);
}

async function shareFile(
  uri: string,
  filename: string,
  mimeType: string,
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(`File sharing is unavailable for ${filename} on this device.`);
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: filename });
}

function createCsv(sheet: ReportExportSheet | undefined): string {
  if (!sheet) return "";
  const header = sheet.columns.map((column) => csvCell(column.label)).join(",");
  const rows = sheet.rows.map((row) =>
    sheet.columns
      .map((column) => csvCell(row[column.key], column.kind))
      .join(","),
  );
  return `\uFEFF${[header, ...rows].join("\r\n")}`;
}

function createWorkbook(data: ReportExportData): Uint8Array {
  const summarySheet: ReportExportSheet = {
    name: "Summary",
    columns: [
      { key: "metric", label: "Metric" },
      { key: "value", label: "Value", kind: "number" },
    ],
    rows: [
      { metric: "Farm", value: data.farmName },
      { metric: "Report", value: data.title },
      {
        metric: "Reporting period",
        value: data.fromDate || data.toDate
          ? `${data.fromDate || "Beginning"} to ${data.toDate || "Today"}`
          : "Current snapshot",
      },
      { metric: "Generated", value: new Date().toISOString() },
      ...data.summary.map((item) => ({
        metric:
          item.kind === "currency" && data.currencyCode
            ? `${item.label} (${data.currencyCode})`
            : item.label,
        value: item.value,
      })),
    ],
    formulas: (() => {
      const salesIndex = data.summary.findIndex((item) => item.label === "Completed sales");
      const expenseIndex = data.summary.findIndex((item) => item.label === "Recorded expenses");
      const surplusIndex = data.summary.findIndex(
        (item) => item.label === "Sales less recorded expenses (estimate)",
      );
      if (salesIndex < 0 || expenseIndex < 0 || surplusIndex < 0) return undefined;
      const dataRowIndex = 4 + surplusIndex;
      return {
        [dataRowIndex]: {
          value: `B${6 + salesIndex}-B${6 + expenseIndex}`,
        },
      };
    })(),
  };
  const sheets = uniqueSheetNames([summarySheet, ...data.sheets]);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypesXml(sheets.length)),
    "_rels/.rels": strToU8(rootRelationshipsXml),
    "xl/workbook.xml": strToU8(workbookXml(sheets)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationshipsXml(sheets.length)),
    "xl/styles.xml": strToU8(stylesXml),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(
      worksheetXml(sheet),
    );
  });
  return zipSync(files, { level: 6 });
}

function worksheetXml(sheet: ReportExportSheet): string {
  const header = sheet.columns.map((column) => column.label);
  const allRows: ReportExportCell[][] = [
    header,
    ...sheet.rows.map((row) => sheet.columns.map((column) => row[column.key])),
  ];
  const totalRowIndex = allRows.length + 1;
  const columnCount = Math.max(sheet.columns.length, 1);
  const rowXml = allRows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) =>
          cellXml(
            `${columnName(columnIndex + 1)}${rowIndex + 1}`,
            value,
            rowIndex === 0 ? undefined : sheet.columns[columnIndex]?.kind,
            rowIndex === 0,
            rowIndex > 0
              ? sheet.formulas?.[rowIndex - 1]?.[sheet.columns[columnIndex]?.key ?? ""]
              : undefined,
          ),
        )
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const totalColumns = sheet.totalColumns ?? (
    sheet.totals
      ? sheet.columns
          .filter((column) => column.kind === "number" || column.kind === "currency")
          .map((column) => column.key)
      : []
  );
  const totals = totalColumns.length > 0 && sheet.rows.length
    ? `<row r="${totalRowIndex}">${sheet.columns
        .map((column, index) => {
          const ref = columnName(index + 1);
          if (totalColumns.includes(column.key)) {
            return `<c r="${ref}${totalRowIndex}" s="${styleForKind(column.kind)}"><f>SUM(${ref}2:${ref}${totalRowIndex - 1})</f><v></v></c>`;
          }
          if (index === 0) {
            return `<c r="${ref}${totalRowIndex}" t="inlineStr" s="1"><is><t>Total</t></is></c>`;
          }
          return `<c r="${ref}${totalRowIndex}"/>`;
        })
        .join("")}</row>`
    : "";
  const lastColumn = columnName(columnCount);
  const lastRow = sheet.rows.length + 1 + (totalColumns.length && sheet.rows.length ? 1 : 0);
  const widths = sheet.columns
    .map((column) => {
      const maxLength = Math.min(
        48,
        Math.max(
          column.label.length,
          ...sheet.rows.slice(0, 150).map((row) =>
            String(row[column.key] ?? "").length,
          ),
        ),
      );
      return `<col min="${sheet.columns.indexOf(column) + 1}" max="${sheet.columns.indexOf(column) + 1}" width="${Math.max(12, maxLength + 2)}" customWidth="1"/>`;
    })
    .join("");
  const filterRange = sheet.rows.length
    ? `<autoFilter ref="A1:${lastColumn}${sheet.rows.length + 1}"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${rowXml}${totals}</sheetData>${filterRange}<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}

function cellXml(
  address: string,
  value: ReportExportCell,
  kind: ReportExportColumnKind = "text",
  isHeader = false,
  formula?: string,
): string {
  const style = isHeader ? 1 : styleForKind(kind);
  if (formula) {
    const cachedValue = Number(value);
    const cached = Number.isFinite(cachedValue) ? cachedValue : 0;
    return `<c r="${address}" s="${style}"><f>${escapeXml(formula)}</f><v>${cached}</v></c>`;
  }
  if (value === null || value === undefined || value === "") {
    return `<c r="${address}" s="${style}"/>`;
  }
  if (kind === "number" || kind === "currency") {
    const number = Number(value);
    return Number.isFinite(number)
      ? `<c r="${address}" s="${style}"><v>${number}</v></c>`
      : `<c r="${address}" s="0" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
  }
  if (kind === "date") {
    const serial = excelDate(value);
    return Number.isFinite(serial)
      ? `<c r="${address}" s="3"><v>${serial}</v></c>`
      : `<c r="${address}" s="0" t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
  }
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function styleForKind(kind: ReportExportColumnKind = "text"): number {
  if (kind === "currency") return 4;
  if (kind === "number") return 2;
  if (kind === "date") return 3;
  return 0;
}

function renderHtmlTotals(sheet: ReportExportSheet): string {
  if (!sheet.rows.length) return "";
  const totalColumns = sheet.totalColumns ?? (
    sheet.totals
      ? sheet.columns
          .filter((column) => column.kind === "number" || column.kind === "currency")
          .map((column) => column.key)
      : []
  );
  if (!totalColumns.length) return "";
  const cells = sheet.columns.map((column, index) => {
    if (totalColumns.includes(column.key)) {
      const total = sheet.rows.reduce(
        (sum, row) => sum + (Number(row[column.key]) || 0),
        0,
      );
      return `<td>${escapeHtml(formatCell(total, column.kind))}</td>`;
    }
    return `<td>${index === 0 ? "Total" : ""}</td>`;
  });
  return `<tr class="total-row">${cells.join("")}</tr>`;
}

function renderHtmlChart(
  chart: ReportExportChart,
  currencyCode?: string,
): string {
  const max = Math.max(
    1,
    ...chart.series.flatMap((series) => series.values.map((value) => Math.abs(value))),
  );
  const bars = chart.categories
    .map((category, index) => {
      const seriesBars = chart.series
        .map((series) => {
          const value = series.values[index] ?? 0;
          const width = Math.max(0, (Math.abs(value) / max) * 100);
          const color = series.color ?? "#20745b";
          return `<div class="chart-series"><span class="chart-series-name">${escapeHtml(series.name)}</span><span class="chart-track"><span class="chart-bar" style="width:${width}%;background:${escapeHtml(color)}"></span></span><span class="chart-number">${escapeHtml(formatCell(value, "currency", currencyCode))}</span></div>`;
        })
        .join("");
      return `<div class="chart-category"><strong>${escapeHtml(category)}</strong>${seriesBars}</div>`;
    })
    .join("");
  const legend = chart.series
    .map(
      (series) =>
        `<span><i style="background:${escapeHtml(series.color ?? "#20745b")}"></i>${escapeHtml(series.name)}</span>`,
    )
    .join("");
  return `<section class="chart-section"><h2>${escapeHtml(chart.title)}</h2><div class="chart-legend">${legend}</div>${bars}</section>`;
}

function formatCell(
  value: ReportExportCell,
  kind: ReportExportColumnKind = "text",
  currencyCode?: string,
): string {
  if (value === null || value === undefined) return "";
  if (kind === "currency" || kind === "number") {
    const number = Number(value);
    if (Number.isFinite(number)) {
      const formatted = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: kind === "currency" ? 2 : 0,
        maximumFractionDigits: 2,
      }).format(number);
      return kind === "currency" && currencyCode
        ? `${currencyCode} ${formatted}`
        : formatted;
    }
  }
  return String(value);
}

function csvCell(
  value: ReportExportCell,
  kind: ReportExportColumnKind = "text",
): string {
  if (value === null || value === undefined) return "";
  let text = kind === "date" ? String(value).slice(0, 10) : String(value);
  if (
    kind === "text" &&
    /^[\s]*[=+\-@]/.test(text)
  ) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function excelDate(value: ReportExportCell): number {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? Number.NaN
    : date.getTime() / 86400000 + 25569;
}

function contentTypesXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
}

const rootRelationshipsXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

function workbookXml(sheets: ReportExportSheet[]): string {
  const sheetNodes = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNodes}</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`;
}

function workbookRelationshipsXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

const stylesXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="#,##0.00;[Red]-#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF20745B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD8E1DD"/></left><right style="thin"><color rgb="FFD8E1DD"/></right><top style="thin"><color rgb="FFD8E1DD"/></top><bottom style="thin"><color rgb="FFD8E1DD"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function uniqueSheetNames(sheets: ReportExportSheet[]): ReportExportSheet[] {
  const usedNames = new Set<string>();
  return sheets.map((sheet) => {
    const base = sheet.name.slice(0, 31);
    let name = base;
    let suffix = 2;
    while (usedNames.has(name.toLocaleLowerCase())) {
      const ending = ` ${suffix}`;
      name = `${base.slice(0, 31 - ending.length)}${ending}`;
      suffix += 1;
    }
    usedNames.add(name.toLocaleLowerCase());
    return { ...sheet, name };
  });
}

function columnName(column: number): string {
  let remainder = column;
  let name = "";
  while (remainder > 0) {
    const index = (remainder - 1) % 26;
    name = String.fromCharCode(65 + index) + name;
    remainder = Math.floor((remainder - 1) / 26);
  }
  return name;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function escapeXml(value: string): string {
  return escapeHtml(value).replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
    "",
  );
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "farmtrack-report";
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
