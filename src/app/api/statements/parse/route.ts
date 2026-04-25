import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ExtractResult =
  | { ok: true; text: string; passwordUsed: string | null }
  | { ok: false; error: string; needsPassword: boolean };

async function extractText(buffer: Buffer, passwords: string[]): Promise<ExtractResult> {
  // Use pdfjs-dist legacy build (Node-friendly, no DOM required)
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Disable worker — run on main thread (serverless-friendly)
  pdfjs.GlobalWorkerOptions.workerSrc = "";

  // Try with no password first, then each saved password.
  const candidates: (string | undefined)[] = [undefined, ...passwords];
  let lastErr: unknown = null;
  let needsPassword = false;

  for (const pw of candidates) {
    try {
      const data = new Uint8Array(buffer);
      const loadingTask = pdfjs.getDocument({
        data,
        password: pw,
        useSystemFonts: false,
        disableFontFace: true,
        isEvalSupported: false,
      });
      const doc = await loadingTask.promise;

      let text = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        text += `\n--- Page ${i} ---\n${pageText}\n`;
      }
      return { ok: true, text, passwordUsed: pw ?? null };
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/password/i.test(msg)) {
        needsPassword = true;
        continue;
      }
      // non-password error — stop trying
      return { ok: false, error: msg, needsPassword: false };
    }
  }

  return {
    ok: false,
    error:
      needsPassword
        ? "PDF is password-protected and none of your saved passwords worked."
        : `Could not open PDF: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    needsPassword,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set in Vercel env vars" },
      { status: 500 }
    );
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

  // Load user's saved PDF passwords (RLS scopes to this user)
  const { data: pwRows } = await supabase
    .from("pdf_passwords")
    .select("password");
  const passwords = (pwRows ?? []).map((r) => r.password as string);

  const extracted = await extractText(buffer, passwords);
  if (!extracted.ok) {
    return NextResponse.json(
      { error: extracted.error, needsPassword: extracted.needsPassword },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 16000,
    output_config: {
      format: {
        type: "json_schema",
        schema: {
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
                  date: { type: "string", description: "ISO date YYYY-MM-DD" },
                  description: { type: "string" },
                  amount: {
                    type: "number",
                    description: "Always positive. Sign indicated by direction field.",
                  },
                  currency: { type: "string" },
                  direction: {
                    type: "string",
                    enum: ["credit", "debit"],
                    description:
                      "credit = money in (deposit, refund); debit = money out (purchase, withdrawal)",
                  },
                  category: {
                    type: "string",
                    description:
                      "Best-guess category: Food, Transport, Shopping, Bills, Salary, Transfer, ATM, Fee, Other",
                  },
                },
                required: ["date", "description", "amount", "currency", "direction"],
                additionalProperties: false,
              },
            },
          },
          required: ["statement_period", "currency", "transactions"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "The following text was extracted from a bank or credit card statement PDF. " +
              "Extract all transactions as structured JSON. Dates must be ISO YYYY-MM-DD. " +
              "Amounts are always positive — use the direction field to indicate credit (money in) or debit (money out). " +
              "If descriptions are in Thai, translate to English where helpful but keep merchant names in original form. " +
              "Skip running balance entries and statement-summary lines — only include actual transactions.\n\n" +
              "=== STATEMENT TEXT ===\n" +
              extracted.text,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json({ error: "No structured output returned" }, { status: 500 });
  }

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse Claude response as JSON", raw: textBlock.text },
      { status: 500 }
    );
  }

  return NextResponse.json({
    period: parsed.statement_period,
    currency: parsed.currency,
    account_holder: parsed.account_holder ?? null,
    account_number: parsed.account_number_masked ?? null,
    transactions: parsed.transactions,
    decrypted_with: extracted.passwordUsed ? "saved-password" : "no-password",
    usage: response.usage,
  });
}
