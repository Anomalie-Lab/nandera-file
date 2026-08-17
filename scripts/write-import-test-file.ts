import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { buildClientWorkbook } from "../src/lib/excel-client";
import { blankData, uid } from "../src/lib/domain/normalize";

/** Filled template — simulates a user who downloaded Template and completed row 3+. */
function userFilledImportData() {
  const d = blankData("Casa Verde Embalagens Ltda.");
  d.meta.accountManager = "Trading Desk";
  d.meta.period = "August 2026";
  d.meta.issued = "17 Aug 2026";
  d.meta.reportNo = "CV·ASR·2026-08";
  d.meta.tradeLane = "China → Brazil (BR)";
  d.meta.preparedBy = "Trading Desk";
  d.meta.contact = "desk@nandera.com";
  d.kpi.activeFoot = "▲ 2 vs. last month";
  d.kpi.transitFoot = "next ETA 02 Oct · Santos";
  d.pos = [
    {
      id: uid(),
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
    {
      id: uid(),
      code: "PO-2026-0302",
      ndr: "NDR-2702",
      product: "Paper cups 8oz DW",
      qty: "1.10M pcs",
      value: 52800,
      incoterm: "FOB Ningbo",
      prod: 100,
      insp: "Passed",
      inspDate: "",
      cargoReady: "Ready 15 Aug",
      eta: "20 Sep",
      port: "Santos",
      stage: "Cargo Ready",
    },
  ];
  d.neg = [
    {
      id: uid(),
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
  d.act = [
    {
      id: uid(),
      type: "red",
      text: "PO-0301 — confirm inspection window by 20 Aug.",
      owner: "Trading Desk",
    },
  ];
  d.closed = [
    {
      id: uid(),
      code: "PO-2026-0290",
      ndr: "NDR-2690",
      product: "Paper cups 8oz",
      value: 51000,
      delivered: "10 Aug",
      port: "Santos",
    },
  ];
  return d;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "public", "templates", "nandera-client-import-test.xlsx");

async function main() {
  const buf = await buildClientWorkbook(userFilledImportData());
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, buf);
  console.log("Wrote", outFile, buf.length, "bytes");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
