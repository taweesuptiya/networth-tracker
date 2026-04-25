import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ParsedTx = {
  date: string;
  description: string;
  amount: number;
  currency: string;
  direction: "credit" | "debit";
  category?: string;
};

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
  const base64 = buffer.toString("base64");

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
                    description: "credit = money in (deposit, refund); debit = money out (purchase, withdrawal)",
                  },
                  category: {
                    type: "string",
                    description: "Best-guess category: Food, Transport, Shopping, Bills, Salary, Transfer, ATM, Fee, Other",
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
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          {
            type: "text",
            text:
              "Extract all transactions from this bank or credit card statement. " +
              "Return them as structured JSON. Dates must be ISO format (YYYY-MM-DD). " +
              "Amounts are always positive numbers; use the direction field to indicate credit (money in) or debit (money out). " +
              "If the statement is in Thai, translate descriptions to English where possible but keep merchant names in original form. " +
              "Skip running balance entries — only include actual transactions.",
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
    transactions: parsed.transactions as ParsedTx[],
    usage: response.usage,
  });
}
