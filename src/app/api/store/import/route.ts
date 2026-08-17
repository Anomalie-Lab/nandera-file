import { NextResponse } from "next/server";
import { requireAdmin, viewerPayload } from "@/lib/auth";
import { importClientFromExcel } from "@/lib/store-repository";
import { ExcelImportError, MAX_IMPORT_BYTES } from "@/lib/excel-client";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`excel-import:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Envie o arquivo Excel no campo file (multipart/form-data)." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Selecione o arquivo .xlsx do template de cliente." },
      { status: 400 }
    );
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx")) {
    return NextResponse.json(
      {
        error:
          "O import aceita somente Excel .xlsx. Baixe o template oficial (botão Template).",
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_IMPORT_BYTES) {
    return NextResponse.json(
      { error: "Arquivo maior que 4 MB." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const { store, clientName } = await importClientFromExcel(buffer);
    return NextResponse.json({
      ...store,
      viewer: viewerPayload(admin),
      importedClient: clientName,
    });
  } catch (err) {
    if (err instanceof ExcelImportError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[store/import]", err);
    const message =
      err instanceof Error ? err.message : "Import failed unexpectedly.";
    const prismaStale =
      /not found in enum|PrismaClientUnknownRequestError/i.test(message);
    return NextResponse.json(
      {
        error: prismaStale
          ? "Erro interno do servidor (banco desatualizado). Pare o npm run dev, rode npx prisma generate e inicie de novo."
          : message,
      },
      { status: 500 }
    );
  }
}
