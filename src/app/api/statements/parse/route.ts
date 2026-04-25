import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SCHEMA = {
  type: "object",
  properties: {
    statement_period: {
      type: "object",
      properties: {
        start: { type: "string" },
        end: { type: "string" },
      },
      required: ["start", "end"],
      additionalProperties: false,
    },
    account_holder: { type: "string" },
    account_number_masked: { type: "string" },
    currency: { type: "string" },
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

const ROUTE_VERSION = "v3-client-decrypt";

export async function GET() {
  return NextResponse.json({ version: ROUTE_VERSION, ts: new Date().toISOString() });
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
    const extractedText = form.get("text");
    const file = form.get("file");

    let messageContent;

    if (typeof extractedText === "string" && extractedText.length > 0) {
      // Client decrypted + extracted text already
      messageContent = [
        {
          type: "text" as const,
          text:
            "The following text was extracted from a bank or credit card statement PDF. " +
            "Extract all transactions as structured JSON. Dates ISO YYYY-MM-DD. " +
            "Amounts always positive — use direction (credit=in, debit=out). " +
            "Translate Thai descriptions to English where helpful but keep merchant names. " +
            "Skip running balance entries — only actual transactions.\n\n" +
            "=== STATEMENT TEXT ===\n" +
            extractedText,
        },
      ];
    } else if (file instanceof File) {
      if (file.type !== "application/pdf") {
        return NextResponse.json({ error: "Only PDF files supported" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
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
            "Return as structured JSON. Dates ISO YYYY-MM-DD. Amounts positive; use direction. " +
            "Translate Thai descriptions to English where helpful but keep merchant names. " +
            "Skip running balance entries.",
        },
      ];
    } else {
      return NextResponse.json({ error: "No file or text provided" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });
    // Stream because max_tokens > 16K can exceed default HTTP timeouts.
    // 1000 transactions × ~50 tokens/tx ≈ 50K output tokens.
    const stream = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 64000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: messageContent }],
    });
    const response = await stream.finalMessage();

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
