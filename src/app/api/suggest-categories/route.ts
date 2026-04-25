import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SuggestRequest = {
  transactions: { id: string; description: string; direction: "credit" | "debit"; amount: number }[];
  existing_categories?: string[]; // user's existing categories to bias toward
};

const SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          category: { type: "string", description: "Best-fit category, e.g. Dining, Transport, Subscriptions, Travel, Bills, Groceries, Shopping, Health, Salary, Interest, Other" },
          confidence: { type: "number", description: "0-1 confidence" },
        },
        required: ["id", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
} as const;

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

    const body: SuggestRequest = await request.json();
    if (!body.transactions || body.transactions.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    const client = new Anthropic({ apiKey });

    const lines = body.transactions
      .map(
        (t) =>
          `id=${t.id} | ${t.direction} | ${t.amount} | "${t.description.slice(0, 200)}"`
      )
      .join("\n");
    const existing = body.existing_categories?.length
      ? `Prefer matching one of these existing user categories when reasonable: ${body.existing_categories.join(", ")}.\n`
      : "";

    const stream = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 16000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "For each bank/card transaction below, suggest a single best-fit expense or income category. " +
                "Use simple categories like: Dining, Groceries, Subscriptions, Travel, Transport, Bills, Shopping, Health, Salary, Interest, Reimbursement, Transfer, Other. " +
                "Thai descriptions are fine — interpret them. " +
                "If the description is clearly a merchant (e.g. 'IHERB', 'NETFLIX', 'AGODA'), pick the obvious category. " +
                existing +
                "\n\nTransactions:\n" +
                lines,
            },
          ],
        },
      ],
    });
    const response = await stream.finalMessage();

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No structured output" }, { status: 500 });
    }
    const parsed = JSON.parse(textBlock.text);
    return NextResponse.json({ suggestions: parsed.suggestions });
  } catch (err) {
    console.error("suggest-categories error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
