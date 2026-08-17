import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  ExcelImportError,
  MAIN_SHEET_NAME,
  buildClientTemplateBuffer,
  buildClientWorkbook,
  parseClientWorkbook,
} from "./excel-client";
import { blankData } from "./domain/normalize";

describe("Excel client template", () => {
  it("generates a single Import sheet with all columns on row 2", async () => {
    const buf = await buildClientTemplateBuffer();
    expect(buf.subarray(0, 2).toString("utf8")).toBe("PK");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual([MAIN_SHEET_NAME]);

    const sheet = wb.getWorksheet(MAIN_SHEET_NAME)!;
    expect(sheet.getRow(2).getCell(1).value).toBe(
      "Logo caption (used if no image)"
    );
    expect(sheet.getRow(2).getCell(3).value).toBe("Client");
    expect(sheet.getRow(2).getCell(13).value).toBe("Client PO number");
    expect(sheet.getRow(2).getCell(25).value).toBe("Stage");
    expect(sheet.getRow(2).getCell(26).value).toBe("Reference");
    expect(sheet.getRow(2).getCell(35).value).toBe("Type");
    expect(sheet.getRow(2).getCell(38).value).toBe("Closed — Client PO number");
    expect(sheet.columnCount).toBe(43);
    expect(sheet.getRow(3).getCell(3).value).toBe("Example Client Ltd.");
    expect(sheet.getRow(3).getCell(4).value).toBe("Trading Desk");
  });

  it("rejects the blank template while Example Client Ltd. is still on row 3", async () => {
    const buf = await buildClientTemplateBuffer();
    await expect(parseClientWorkbook(buf)).rejects.toBeInstanceOf(
      ExcelImportError
    );
  });

  it("creates a client record from a filled official template", async () => {
    const source = blankData("Casa Verde Embalagens Ltda.");
    source.meta.accountManager = "Trading Desk";
    source.meta.period = "August 2026";
    source.meta.issued = "17 Aug 2026";
    source.meta.reportNo = "CV·ASR·2026-08";
    source.meta.tradeLane = "China → Brazil (BR)";
    source.kpi.activeFoot = "first import";
    source.pos = [
      {
        id: "p1",
        code: "PO-2026-0301",
        ndr: "NDR-2701",
        product: "Kraft bowls",
        qty: "1×40′HC",
        value: 41200,
        incoterm: "FOB Qingdao",
        prod: 40,
        insp: "Booked",
        inspDate: "20 Aug",
        cargoReady: "28 Aug",
        eta: "02 Oct",
        port: "Santos",
        stage: "In Production",
      },
    ];
    source.neg = [
      {
        id: "n1",
        ref: "NEG-20",
        topic: "PLA lids — trial",
        next: "send quote",
        owner: "Desk",
        due: "22 Aug",
        value: 88000,
        stage: "Inquiry",
        outcome: "Open",
        samples: "Requested",
      },
    ];
    source.act = [
      {
        id: "a1",
        type: "red",
        text: "PO-0301 — confirm inspection window.",
        owner: "Trading Desk",
      },
    ];
    source.closed = [
      {
        id: "c1",
        code: "PO-2026-0290",
        ndr: "NDR-2690",
        product: "Paper cups 8oz",
        value: 51000,
        delivered: "10 Aug",
        port: "Santos",
      },
    ];

    const buf = await buildClientWorkbook(source);
    const parsed = await parseClientWorkbook(buf);

    expect(parsed.meta.client).toBe("Casa Verde Embalagens Ltda.");
    expect(parsed.meta.accountManager).toBe("Trading Desk");
    expect(parsed.meta.period).toBe("August 2026");
    expect(parsed.meta.reportNo).toBe("CV·ASR·2026-08");
    expect(parsed.kpi.activeFoot).toBe("first import");

    expect(parsed.pos).toHaveLength(1);
    expect(parsed.pos[0].code).toBe("PO-2026-0301");
    expect(parsed.pos[0].stage).toBe("In Production");

    expect(parsed.neg[0].ref).toBe("NEG-20");
    expect(parsed.neg[0].samples).toBe("Requested");

    expect(parsed.act[0].type).toBe("red");
    expect(parsed.act[0].text).toContain("PO-0301");

    expect(parsed.closed[0].code).toBe("PO-2026-0290");
  });

  it("rejects an invalid PO stage with row number", async () => {
    const source = blankData("Test Client Stage");
    source.pos = [
      {
        id: "p1",
        code: "PO-1",
        ndr: "NDR-1",
        product: "Cups",
        qty: "1",
        value: 1,
        incoterm: "FOB",
        prod: 0,
        insp: "Pending",
        inspDate: "",
        cargoReady: "",
        eta: "",
        port: "Santos",
        stage: "Confirmed",
      },
    ];
    const buf = await buildClientWorkbook(source);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    wb.getWorksheet(MAIN_SHEET_NAME)!.getRow(4).getCell(25).value = "Dispatched";
    const broken = Buffer.from(await wb.xlsx.writeBuffer());

    await expect(parseClientWorkbook(broken)).rejects.toThrow(
      /Import row 4: invalid "Stage"/
    );
  });
});
