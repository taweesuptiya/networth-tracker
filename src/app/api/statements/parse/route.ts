import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    statement_period: {
      type: "object",
      properties: {
        start: { type: "string", description: "ISO date YYYY-MM-DD" },
        end: { type: "string", description: "ISO date YYYY-MM-DD" },
      },
      required: ["start", "end"],
      additionalProperties: false,
    },
    account_holder: { type: "string" },
    account_number_masked: { type: "string" },
    currency: { type: "string", description: "e.g. THB, USD" },
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
          currency: { type: "string" },
          direction: { type: "string", enum: ["credit", "debit"] },
          category: { type: "string" },
        },
        required: ["date", "description", "amount", "currency", "direction"],
        additionalProperties: false,
      },
    },
  },
  required: ["statement_period", "currency", "transactions"],
  additionalProperties: false,
} as const;

function isEncrypted(buffer: Buffer): boolean {
  // Cheap heuristic: PDF spec encrypted files have "/Encrypt" in the trailer dictionary.
  // Reading the last 8KB is enough — that's where xref + trailer live.
  const tail = buffer.subarray(Math.max(0, buffer.length - 8192));
  return tail.includes(Buffer.from("/Encrypt"));
}

async function decryptToText(
  buffer: Buffer,
  passwords: string[]
): Promise<{ text: string; passwordUsed: string | null } | { error: string }> {
  // Stub DOM globals required by pdfjs-dist at module load (text extraction doesn't actually use them)
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = class {};
  if (typeof g.Path2D === "undefined") g.Path2D = class {};
  if (typeof g.ImageData === "undefined") g.ImageData = class {};

  let pdfjs;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "";
  } catch (e) {
    return { error: `Failed to load PDF library: ${e instanceof Error ? e.message : String(e)}` };
  }

  const candidates: (string | undefined)[] = [undefined, ...passwords];
  let lastErr: string | null = null;

  for (const pw of candidates) {
    try {
      const data = new Uint8Array(buffer);
      const doc = await pdfjs.getDocument({
        data,
        password: pw,
        useSystemFonts: false,
        disableFontFace: true,
        isEvalSupported: false,
      }).promise;

      let text = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text +=
          `\n--- Page ${i} ---\n` +
          content.items.map((item) => ("str" in item ? item.str : "")).join(" ") +
          "\n";
      }
      return { text, passwordUsed: pw ?? null };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (!/password/i.test(lastErr)) return { error: lastErr };
    }
  }

  return { error: `Could not decrypt PDF. Last error: ${lastErr}` };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files supported" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const client = new Anthropic({ apiKey });

    let messageContent;
    let decryptInfo = "no-password";

    if (isEncrypted(buffer)) {
      // Encrypted: load saved passwords, decrypt, send extracted text to Claude
      const { data: pwRows } = await supabase.from("pdf_passwords").select("password");
      const passwords = (pwRows ?? []).map((r) => r.password as string);
      const result = await decryptToText(buffer, passwords);
      if ("error" in result) {
        return NextResponse.json(
          {
            error:
              passwords.length === 0
                ? "PDF is password-protected but you haven't saved any passwords yet. Add one in the 🔐 panel above."
                : `PDF is password-protected and none of your ${passwords.length} saved passwords worked. ${result.error}`,
          },
          { status: 400 }
        );
      }
      decryptInfo = result.passwordUsed ? "saved-password" : "no-password";
      messageContent = [
        {
          type: "text" as const,
          text:
            "The following text was extracted from a bank or credit card statement PDF. " +
            "Extract all transactions as structured JSON. Dates must be ISO YYYY-MM-DD. " +
            "Amounts are always positive — use the direction field to indicate credit (money in) or debit (money out). " +
            "If descriptions are in Thai, translate to English where helpful but keep merchant names. " +
            "Skip running balance entries — only include actual transactions.\n\n" +
            "=== STATEMENT TEXT ===\n" +
            result.text,
        },
      ];
    } else {
      // Unencrypted: send PDF directly to Claude (preserves visual layout)
      const base64 = buffer.toString("base64");
      messageContent = [
        {
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
        },
        {
          type: "text" as const,
          text:
            "Extract all transactions from this bank or credit card statement. " +
            "Return as structured JSON. Dates ISO YYYY-MM-DD. Amounts positive; use direction (credit/debit). " +
            "Translate Thai descriptions to English where helpful but keep merchant names. " +
            "Skip running balance entries.",
        },
      ];
    }

    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: messageContent }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No structured output from Claude" }, { status: 500 });
    }

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse Claude response as JSON", raw: textBlock.text.slice(0, 500) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      period: parsed.statement_period,
      currency: parsed.currency,
      account_holder: parsed.account_holder ?? null,
      account_number: parsed.account_number_masked ?? null,
      transactions: parsed.transactions,
      decrypted_with: decryptInfo,
      usage: response.usage,
    });
  } catch (err) {
    console.error("parse-statement error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
