import ExcelJS from "exceljs";
import {
  ACT_TYPES,
  INSP_STATES,
  NEG_OUTCOMES,
  NEG_SAMPLES,
  NEG_STAGES,
  POS_STAGES,
  type ClientData,
} from "./domain/types";
import { blankData, uid } from "./domain/normalize";

export const TEMPLATE_FILENAME = "nandera-client-template.xlsx";
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
export const MAIN_SHEET_NAME = "Import";

export class ExcelImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcelImportError";
  }
}

/** Legacy multi-sheet names (still accepted on import). */
const LEGACY_SHEETS = {
  client: "Client",
  pos: "Purchase Orders",
  neg: "Negotiations",
  act: "Actions",
  closed: "Closed",
} as const;

const LEGACY_SHEET_ALIASES: Record<string, keyof typeof LEGACY_SHEETS> = {
  client: "client",
  cliente: "client",
  "purchase orders": "pos",
  pedidos: "pos",
  pos: "pos",
  orders: "pos",
  negotiations: "neg",
  negociacoes: "neg",
  pipeline: "neg",
  actions: "act",
  alertas: "act",
  "action items": "act",
  closed: "closed",
  entregues: "closed",
  delivered: "closed",
};

type ClientField = {
  field: keyof ClientData["meta"] | "activeFoot" | "transitFoot";
  label: string;
  hint: string;
};

/** Labels match Settings → Report header / KPI footnotes in manager.html. */
const CLIENT_FIELDS: ClientField[] = [
  {
    field: "company",
    label: "Logo caption (used if no image)",
    hint: "Default: YOUR LOGO",
  },
  {
    field: "title",
    label: "Report title",
    hint: "Default: Account Status Report",
  },
  {
    field: "client",
    label: "Client",
    hint: "Required on row 3. Client name for the new record.",
  },
  {
    field: "accountManager",
    label: "Account manager",
    hint: "e.g. Trading Desk",
  },
  {
    field: "period",
    label: "Reporting period",
    hint: "e.g. July 2026",
  },
  {
    field: "issued",
    label: "Issued date",
    hint: "e.g. 05 Aug 2026",
  },
  {
    field: "reportNo",
    label: "Report no.",
    hint: "e.g. VS·ASR·2026-07",
  },
  {
    field: "tradeLane",
    label: "Trade lane",
    hint: "Default: China → Brazil (BR)",
  },
  {
    field: "preparedBy",
    label: "Prepared by",
    hint: "e.g. Trading Desk",
  },
  {
    field: "contact",
    label: "Contact",
    hint: "e.g. desk@company.com",
  },
  {
    field: "activeFoot",
    label: "Active POs — footnote",
    hint: "KPI footnote on the report",
  },
  {
    field: "transitFoot",
    label: "In Transit — footnote",
    hint: "KPI footnote on the report",
  },
];

const POS_COLS = [
  {
    key: "code",
    header: "Client PO number",
    aliases: ["client po", "po", "code"],
  },
  {
    key: "ndr",
    header: "NDR ref (Nandera)",
    aliases: ["ndr ref", "ndr"],
  },
  { key: "product", header: "Product", aliases: [] },
  {
    key: "qty",
    header: "Qty / Volume",
    aliases: ["qty / vol", "qty", "volume"],
  },
  {
    key: "value",
    header: "Value (US$)",
    aliases: ["value us$", "value us", "value"],
  },
  { key: "incoterm", header: "Incoterm", aliases: [] },
  {
    key: "prod",
    header: "Production %",
    aliases: ["production", "prod"],
  },
  {
    key: "insp",
    header: "Inspection status",
    aliases: ["inspection", "insp"],
  },
  {
    key: "inspDate",
    header: "Inspection booked date",
    aliases: ["insp date", "insp. date", "inspection date"],
  },
  {
    key: "cargoReady",
    header: "Cargo ready / ETD",
    aliases: ["cargo ready", "cargo ready etd"],
  },
  { key: "eta", header: "ETA", aliases: [] },
  {
    key: "port",
    header: "Destination port",
    aliases: ["port"],
  },
  { key: "stage", header: "Stage", aliases: ["status"] },
] as const;

const NEG_COLS = [
  { key: "ref", header: "Reference", aliases: ["ref"] },
  {
    key: "value",
    header: "Est. value (US$)",
    aliases: ["value us$", "value us", "value"],
  },
  { key: "stage", header: "Stage", aliases: ["status"] },
  { key: "outcome", header: "Outcome", aliases: [] },
  {
    key: "samples",
    header: "Sample status",
    aliases: ["samples"],
  },
  {
    key: "topic",
    header: "Topic / product",
    aliases: ["topic", "product"],
  },
  {
    key: "next",
    header: "Next action",
    aliases: ["next"],
  },
  { key: "owner", header: "Owner", aliases: [] },
  { key: "due", header: "Due", aliases: [] },
] as const;

const ACT_COLS = [
  { key: "type", header: "Type", aliases: [] },
  { key: "owner", header: "Owner", aliases: [] },
  { key: "text", header: "Message", aliases: ["text"] },
] as const;

/** Closed headers prefixed so they stay unique on the single-sheet layout. */
const CLOSED_COLS = [
  {
    key: "code",
    header: "Closed — Client PO number",
    aliases: ["client po number", "closed client po", "closed po"],
  },
  {
    key: "ndr",
    header: "Closed — NDR ref (Nandera)",
    aliases: ["ndr ref nandera", "closed ndr ref", "closed ndr", "ndr"],
  },
  { key: "product", header: "Closed — Product", aliases: ["product", "closed product"] },
  {
    key: "value",
    header: "Closed — Value (US$)",
    aliases: ["value us$", "value us", "value", "closed value us$", "closed value"],
  },
  { key: "delivered", header: "Closed — Delivered", aliases: ["delivered", "closed delivered"] },
  { key: "port", header: "Closed — Port", aliases: ["port", "closed port"] },
] as const;

const ACT_TYPE_LABELS = ACT_TYPES.map(([, label]) => label);

type FlatSection = "client" | "pos" | "neg" | "act" | "closed";

type FlatColumn = {
  section: FlatSection;
  key: string;
  header: string;
  width: number;
};

function flatLayout(): FlatColumn[] {
  const cols: FlatColumn[] = [];
  for (const f of CLIENT_FIELDS) {
    cols.push({ section: "client", key: f.field, header: f.label, width: 22 });
  }
  for (const c of POS_COLS) {
    cols.push({ section: "pos", key: c.key, header: c.header, width: 16 });
  }
  for (const c of NEG_COLS) {
    cols.push({ section: "neg", key: c.key, header: c.header, width: 16 });
  }
  for (const c of ACT_COLS) {
    cols.push({ section: "act", key: c.key, header: c.header, width: 18 });
  }
  for (const c of CLOSED_COLS) {
    cols.push({ section: "closed", key: c.key, header: c.header, width: 16 });
  }
  return cols;
}

const FLAT_LAYOUT = flatLayout();
const FLAT_DATA_START = 3;
const FLAT_DATA_ROWS = 200;

/** Shown on row 3 of the blank template; import ignores this row until Client is replaced. */
export const TEMPLATE_EXAMPLE_CLIENT = "Example Client Ltd.";

const TEMPLATE_ROW_EXAMPLES: Record<string, string> = {
  company: "YOUR LOGO",
  title: "Account Status Report",
  client: TEMPLATE_EXAMPLE_CLIENT,
  accountManager: "Trading Desk",
  period: "August 2026",
  issued: "17 Aug 2026",
  reportNo: "EX·ASR·2026-08",
  tradeLane: "China → Brazil (BR)",
  preparedBy: "Trading Desk",
  contact: "desk@company.com",
  activeFoot: "e.g. ▲ 2 vs. last month",
  transitFoot: "e.g. next ETA 19 Aug · Santos",
};

const NAVY = "1B2A4A";
const GOLD = "B8860B";
const CREAM = "F6F1E7";
const SECTION_FILL: Record<FlatSection, string> = {
  client: "E8EDF5",
  pos: "EAF3F0",
  neg: "FBF3DE",
  act: "F4ECEB",
  closed: "EEF3F8",
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const obj = value as unknown as Record<string, unknown>;
    if (obj.result != null) return cellText(obj.result as ExcelJS.CellValue);
    if (typeof obj.text === "string") return obj.text.trim();
    if (obj.richText && Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>)
        .map((p) => p.text || "")
        .join("")
        .trim();
    }
    if (obj.hyperlink && typeof obj.text === "string") return String(obj.text).trim();
  }
  return String(value).trim();
}

function formatDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = d.toLocaleString("en", { month: "short", timeZone: "UTC" });
  return `${day} ${mon} ${d.getUTCFullYear()}`;
}

function toNumber(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function listFormula(values: readonly string[]): string {
  return `"${values.join(",")}"`;
}

function applyHeader(row: ExcelJS.Row, count: number) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${NAVY}` },
  };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 28;
  for (let i = 1; i <= count; i++) {
    row.getCell(i).border = {
      bottom: { style: "thin", color: { argb: `FF${GOLD}` } },
    };
  }
}

function flatColIndex(section: FlatSection, key: string): number {
  const idx = FLAT_LAYOUT.findIndex((c) => c.section === section && c.key === key);
  return idx >= 0 ? idx + 1 : -1;
}

function addListValidation(
  sheet: ExcelJS.Worksheet,
  col: number,
  values: readonly string[],
  firstRow: number,
  lastRow: number
) {
  if (col < 1) return;
  for (let r = firstRow; r <= lastRow; r++) {
    sheet.getCell(r, col).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [listFormula(values)],
      showErrorMessage: true,
      errorTitle: "Invalid value",
      error: `Use one of: ${values.join(", ")}`,
    };
  }
}

export async function buildClientTemplateBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Nandera ASR Manager";
  wb.created = new Date();

  const sheet = wb.addWorksheet(MAIN_SHEET_NAME);
  const totalCols = FLAT_LAYOUT.length;

  // Row 1 — section bands
  let col = 1;
  for (const section of ["client", "pos", "neg", "act", "closed"] as FlatSection[]) {
    const span = FLAT_LAYOUT.filter((c) => c.section === section).length;
    const start = col;
    const end = col + span - 1;
    sheet.mergeCells(1, start, 1, end);
    const cell = sheet.getCell(1, start);
    cell.value =
      section === "client"
        ? "CLIENT (fill row 3 — Client is required)"
        : section === "pos"
          ? "PURCHASE ORDERS"
          : section === "neg"
            ? "NEGOTIATIONS"
            : section === "act"
              ? "ACTIONS"
              : "CLOSED";
    cell.font = { bold: true, size: 10, color: { argb: "FF1B2A4A" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${SECTION_FILL[section]}` },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    col += span;
  }

  // Row 2 — all column headers
  FLAT_LAYOUT.forEach((c, i) => {
    const cell = sheet.getCell(2, i + 1);
    cell.value = c.header;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${CREAM}` },
    };
    cell.font = { bold: true, size: 10 };
    cell.alignment = { vertical: "middle", wrapText: true };
    sheet.getColumn(i + 1).width = c.width;
  });
  sheet.getRow(2).height = 32;

  // Row 3 — example placeholders (replace Client before import)
  const exampleFont = {
    italic: true,
    color: { argb: "FF888888" },
    size: 10,
  };
  FLAT_LAYOUT.forEach((col, i) => {
    if (col.section !== "client") return;
    const cell = sheet.getCell(FLAT_DATA_START, i + 1);
    cell.value = TEMPLATE_ROW_EXAMPLES[col.key] ?? "";
    cell.font = exampleFont;
  });
  sheet.getCell(FLAT_DATA_START, flatColIndex("client", "client")).note =
    "Replace Example Client Ltd. with the real client name. Other gray values are hints — edit or clear them. Add POs / negotiations / actions / closed deals on rows below (leave client columns blank).";

  sheet.views = [{ state: "frozen", ySplit: 2, xSplit: 0 }];

  const lastRow = FLAT_DATA_START + FLAT_DATA_ROWS - 1;
  addListValidation(sheet, flatColIndex("pos", "insp"), INSP_STATES, FLAT_DATA_START, lastRow);
  addListValidation(sheet, flatColIndex("pos", "stage"), POS_STAGES, FLAT_DATA_START, lastRow);
  addListValidation(sheet, flatColIndex("neg", "stage"), NEG_STAGES, FLAT_DATA_START, lastRow);
  addListValidation(sheet, flatColIndex("neg", "outcome"), NEG_OUTCOMES, FLAT_DATA_START, lastRow);
  addListValidation(sheet, flatColIndex("neg", "samples"), NEG_SAMPLES, FLAT_DATA_START, lastRow);
  addListValidation(sheet, flatColIndex("act", "type"), ACT_TYPE_LABELS, FLAT_DATA_START, lastRow);

  // Freeze panes aesthetic — top border on header row
  applyHeader(sheet.getRow(2), totalCols);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function findLegacySheet(
  wb: ExcelJS.Workbook,
  kind: keyof typeof LEGACY_SHEETS
): ExcelJS.Worksheet | undefined {
  const want = norm(LEGACY_SHEETS[kind]);
  return wb.worksheets.find((ws) => {
    const n = norm(ws.name);
    return n === want || LEGACY_SHEET_ALIASES[n] === kind;
  });
}

function findImportSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  return (
    wb.getWorksheet(MAIN_SHEET_NAME) ||
    wb.worksheets.find((ws) => norm(ws.name) === "import")
  );
}

function isFlatWorkbook(wb: ExcelJS.Workbook): boolean {
  const ws = findImportSheet(wb);
  if (!ws) return false;
  return (
    norm(cellText(ws.getRow(2).getCell(1).value)) ===
    norm(CLIENT_FIELDS[0].label)
  );
}

function headerIndex(
  row: ExcelJS.Row,
  cols: readonly { key: string; header: string; aliases: readonly string[] }[]
): Map<string, number> {
  const map = new Map<string, number>();
  row.eachCell((cell, col) => {
    const h = norm(cellText(cell.value));
    if (!h) return;
    for (const colDef of cols) {
      const names = [norm(colDef.header), norm(colDef.key), ...colDef.aliases.map(norm)];
      if (names.includes(h)) map.set(colDef.key, col);
    }
  });
  return map;
}

function rowObject(
  row: ExcelJS.Row,
  idx: Map<string, number>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, col] of idx) {
    out[key] = cellText(row.getCell(col).value);
  }
  return out;
}

function isEmptyRow(obj: Record<string, string>, keys: string[]): boolean {
  return keys.every((k) => !obj[k]);
}

function mustEnum(
  value: string,
  allowed: readonly string[],
  sheet: string,
  row: number,
  field: string,
  fallback: string
): string {
  if (!value) return fallback;
  const hit = allowed.find((a) => norm(a) === norm(value));
  if (hit) return hit;
  throw new ExcelImportError(
    `${sheet} row ${row}: invalid "${field}" (${value}). Use: ${allowed.join(", ")}.`
  );
}

function mapActType(raw: string, row: number): string {
  if (!raw) return "gold";
  const n = norm(raw.split(/[—–-]/)[0] || raw);
  for (const [code, label] of ACT_TYPES) {
    if (n === norm(code) || n === norm(label) || n.startsWith(norm(code)))
      return code;
  }
  throw new ExcelImportError(
    `Import row ${row}: invalid Type (${raw}). Use: ${ACT_TYPE_LABELS.join(", ")}.`
  );
}

function applyClientField(data: ClientData, key: string, value: string) {
  if (!value) return;
  if (key === "activeFoot") data.kpi.activeFoot = value;
  else if (key === "transitFoot") data.kpi.transitFoot = value;
  else (data.meta as Record<string, string>)[key] = value;
}

function sectionValues(
  row: ExcelJS.Row,
  section: FlatSection
): Record<string, string> {
  const out: Record<string, string> = {};
  FLAT_LAYOUT.forEach((col, i) => {
    if (col.section !== section) return;
    out[col.key] = cellText(row.getCell(i + 1).value);
  });
  return out;
}

function finalizeClientMeta(data: ClientData) {
  data.meta.client = data.meta.client.trim();
  const client = norm(data.meta.client);
  if (
    !client ||
    client === norm("New Client") ||
    client === norm(TEMPLATE_EXAMPLE_CLIENT)
  ) {
    throw new ExcelImportError(
      'Import sheet row 3: replace "Example Client Ltd." with your client name (or clear the example row and fill a real Client).'
    );
  }
}

function parseFlatSheet(ws: ExcelJS.Worksheet): ClientData {
  const data = blankData();
  const headerRow = norm(cellText(ws.getRow(2).getCell(1).value));
  if (headerRow !== norm(CLIENT_FIELDS[0].label)) {
    throw new ExcelImportError(
      "Import sheet: header row not recognized. Download the official template and keep row 2 unchanged."
    );
  }

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < FLAT_DATA_START) return;

    const clientVals = sectionValues(row, "client");
    const clientCell = clientVals.client?.trim() ?? "";
    const skipPlaceholderRow =
      rowNumber === FLAT_DATA_START &&
      norm(clientCell) === norm(TEMPLATE_EXAMPLE_CLIENT);
    if (!skipPlaceholderRow) {
      for (const [key, value] of Object.entries(clientVals)) {
        applyClientField(data, key, value);
      }
    }

    const po = sectionValues(row, "pos");
    if (po.code || po.ndr || po.product) {
      data.pos.push({
        id: uid(),
        code: po.code || "",
        ndr: po.ndr || "",
        product: po.product || "",
        qty: po.qty || "",
        value: toNumber(po.value || "0"),
        incoterm: po.incoterm || "",
        prod: Math.max(0, Math.min(100, Math.round(toNumber(po.prod || "0")))),
        insp: mustEnum(
          po.insp,
          INSP_STATES,
          MAIN_SHEET_NAME,
          rowNumber,
          "Inspection status",
          "Pending"
        ),
        inspDate: po.inspDate || "",
        cargoReady: po.cargoReady || "",
        eta: po.eta || "",
        port: po.port || "",
        stage: mustEnum(
          po.stage,
          POS_STAGES,
          MAIN_SHEET_NAME,
          rowNumber,
          "Stage",
          "Confirmed"
        ),
      });
    }

    const neg = sectionValues(row, "neg");
    if (neg.ref || neg.topic) {
      data.neg.push({
        id: uid(),
        ref: neg.ref || "",
        topic: neg.topic || "",
        next: neg.next || "",
        owner: neg.owner || "",
        due: neg.due || "",
        value: toNumber(neg.value || "0"),
        stage: mustEnum(
          neg.stage === "Quotation"
            ? "Inquiry"
            : neg.stage === "Negotiation"
              ? "Proposal"
              : neg.stage,
          NEG_STAGES,
          MAIN_SHEET_NAME,
          rowNumber,
          "Stage",
          "Inquiry"
        ),
        outcome: mustEnum(
          neg.outcome,
          NEG_OUTCOMES,
          MAIN_SHEET_NAME,
          rowNumber,
          "Outcome",
          "Open"
        ),
        samples: mustEnum(
          neg.samples,
          NEG_SAMPLES,
          MAIN_SHEET_NAME,
          rowNumber,
          "Sample status",
          "N/A"
        ),
      });
    }

    const act = sectionValues(row, "act");
    if (act.text) {
      data.act.push({
        id: uid(),
        type: mapActType(act.type, rowNumber),
        text: act.text,
        owner: act.owner || "",
      });
    }

    const closed = sectionValues(row, "closed");
    if (closed.code || closed.ndr || closed.product) {
      data.closed.push({
        id: uid(),
        code: closed.code || "",
        ndr: closed.ndr || "",
        product: closed.product || "",
        value: toNumber(closed.value || "0"),
        delivered: closed.delivered || "",
        port: closed.port || "",
      });
    }
  });

  finalizeClientMeta(data);
  return data;
}

function parseLegacyClientSheet(ws: ExcelJS.Worksheet): ClientData {
  const data = blankData();
  const byLabel = new Map<string, ClientField>();
  CLIENT_FIELDS.forEach((f) => {
    byLabel.set(norm(f.label), f);
    byLabel.set(norm(f.field), f);
  });

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const label = cellText(row.getCell(1).value);
    const value = cellText(row.getCell(2).value);
    const field = byLabel.get(norm(label));
    if (!field || !value) return;
    applyClientField(data, field.field, value);
  });

  finalizeClientMeta(data);
  return data;
}

function parseTable<T>(
  ws: ExcelJS.Worksheet | undefined,
  cols: readonly { key: string; header: string; aliases: readonly string[] }[],
  requiredKeys: string[],
  mapRow: (obj: Record<string, string>, row: number) => T | null
): T[] {
  if (!ws) return [];
  const header = ws.getRow(1);
  const idx = headerIndex(header, cols);
  if (!idx.size) {
    throw new ExcelImportError(
      `Sheet ${ws.name}: header not recognized. Download the official template and do not change row 1.`
    );
  }
  const out: T[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = rowObject(row, idx);
    if (isEmptyRow(obj, requiredKeys.length ? requiredKeys : [...idx.keys()])) return;
    const mapped = mapRow(obj, rowNumber);
    if (mapped) out.push(mapped);
  });
  return out;
}

function parseLegacyWorkbook(wb: ExcelJS.Workbook): ClientData {
  const clientSheet = findLegacySheet(wb, "client");
  if (!clientSheet) {
    throw new ExcelImportError(
      'Workbook has no "Import" or "Client" sheet. Download the official template via Import → Template.'
    );
  }

  const data = parseLegacyClientSheet(clientSheet);

  data.pos = parseTable(
    findLegacySheet(wb, "pos"),
    POS_COLS,
    ["code", "ndr", "product"],
    (obj, row) => {
      if (!obj.code && !obj.ndr && !obj.product) return null;
      return {
        id: uid(),
        code: obj.code || "",
        ndr: obj.ndr || "",
        product: obj.product || "",
        qty: obj.qty || "",
        value: toNumber(obj.value || "0"),
        incoterm: obj.incoterm || "",
        prod: Math.max(0, Math.min(100, Math.round(toNumber(obj.prod || "0")))),
        insp: mustEnum(
          obj.insp,
          INSP_STATES,
          LEGACY_SHEETS.pos,
          row,
          "Inspection status",
          "Pending"
        ),
        inspDate: obj.inspDate || "",
        cargoReady: obj.cargoReady || "",
        eta: obj.eta || "",
        port: obj.port || "",
        stage: mustEnum(
          obj.stage,
          POS_STAGES,
          LEGACY_SHEETS.pos,
          row,
          "Stage",
          "Confirmed"
        ),
      };
    }
  );

  data.neg = parseTable(
    findLegacySheet(wb, "neg"),
    NEG_COLS,
    ["ref", "topic"],
    (obj, row) => {
      if (!obj.ref && !obj.topic) return null;
      return {
        id: uid(),
        ref: obj.ref || "",
        topic: obj.topic || "",
        next: obj.next || "",
        owner: obj.owner || "",
        due: obj.due || "",
        value: toNumber(obj.value || "0"),
        stage: mustEnum(
          obj.stage === "Quotation"
            ? "Inquiry"
            : obj.stage === "Negotiation"
              ? "Proposal"
              : obj.stage,
          NEG_STAGES,
          LEGACY_SHEETS.neg,
          row,
          "Stage",
          "Inquiry"
        ),
        outcome: mustEnum(
          obj.outcome,
          NEG_OUTCOMES,
          LEGACY_SHEETS.neg,
          row,
          "Outcome",
          "Open"
        ),
        samples: mustEnum(
          obj.samples,
          NEG_SAMPLES,
          LEGACY_SHEETS.neg,
          row,
          "Sample status",
          "N/A"
        ),
      };
    }
  );

  data.act = parseTable(
    findLegacySheet(wb, "act"),
    ACT_COLS,
    ["text"],
    (obj, row) => {
      if (!obj.text) return null;
      return {
        id: uid(),
        type: mapActType(obj.type, row),
        text: obj.text,
        owner: obj.owner || "",
      };
    }
  );

  data.closed = parseTable(
    findLegacySheet(wb, "closed"),
    CLOSED_COLS,
    ["code", "ndr", "product"],
    (obj) => {
      if (!obj.code && !obj.ndr && !obj.product) return null;
      return {
        id: uid(),
        code: obj.code || "",
        ndr: obj.ndr || "",
        product: obj.product || "",
        value: toNumber(obj.value || "0"),
        delivered: obj.delivered || "",
        port: obj.port || "",
      };
    }
  );

  return data;
}

export function assignImportIds(data: ClientData): ClientData {
  data.pos.forEach((p) => {
    p.id = p.id || uid();
  });
  data.neg.forEach((n) => {
    n.id = n.id || uid();
  });
  data.act.forEach((a) => {
    a.id = a.id || uid();
  });
  data.closed.forEach((c) => {
    c.id = c.id || uid();
  });
  return data;
}

export async function parseClientWorkbook(buffer: Buffer): Promise<ClientData> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ExcelImportError(
      "Invalid Excel file. Use the official .xlsx template (nandera-client-template.xlsx)."
    );
  }

  const data = isFlatWorkbook(wb)
    ? parseFlatSheet(findImportSheet(wb)!)
    : parseLegacyWorkbook(wb);

  if (
    data.pos.length > 500 ||
    data.neg.length > 500 ||
    data.act.length > 500 ||
    data.closed.length > 500
  ) {
    throw new ExcelImportError("Import accepts at most 500 rows per section.");
  }

  return assignImportIds(data);
}

/** Fill the official single-sheet template — used by tests. */
export async function buildClientWorkbook(data: ClientData): Promise<Buffer> {
  const buf = await buildClientTemplateBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheet = findImportSheet(wb)!;
  const row = sheet.getRow(FLAT_DATA_START);

  FLAT_LAYOUT.forEach((col, i) => {
    if (col.section !== "client") return;
    let value = "";
    if (col.key === "activeFoot") value = data.kpi.activeFoot;
    else if (col.key === "transitFoot") value = data.kpi.transitFoot;
    else value = String(data.meta[col.key as keyof ClientData["meta"]] ?? "");
    row.getCell(i + 1).value = value;
  });

  let r = FLAT_DATA_START + 1;
  const writeRows = (
    section: FlatSection,
    items: Array<Record<string, unknown>>,
    mapItem?: (item: Record<string, unknown>) => Record<string, unknown>
  ) => {
    for (const raw of items) {
      const item = mapItem ? mapItem(raw) : raw;
      const target = sheet.getRow(r);
      FLAT_LAYOUT.forEach((col, i) => {
        if (col.section !== section) return;
        const v = item[col.key];
        target.getCell(i + 1).value =
          v == null || v === "" ? "" : (v as ExcelJS.CellValue);
      });
      r += 1;
    }
  };

  writeRows("pos", data.pos as unknown as Array<Record<string, unknown>>);
  writeRows("neg", data.neg as unknown as Array<Record<string, unknown>>);
  writeRows(
    "act",
    data.act as unknown as Array<Record<string, unknown>>,
    (a) => ({
      ...a,
      type: ACT_TYPES.find(([c]) => c === a.type)?.[1] ?? a.type,
    })
  );
  writeRows("closed", data.closed as unknown as Array<Record<string, unknown>>);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
