import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SCHEMA = {
  type: "object",
  properties: {
    pay_date: {
      type: "string",
      description: "ISO YYYY-MM-DD pay date from the payslip",
    },
    period: {
      type: "string",
      description: "Human-readable pay period, e.g. '2026 APR'",
    },
    employee_name: { type: "string" },
    currency: { type: "string", description: "3-letter ISO currency code, e.g. THB" },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          amount: { type: "number", description: "Always positive" },
          direction: { type: "string", enum: ["credit", "debit"] },
          item_type: {
            type: "string",
            enum: [
              "net_pay",
              "pf_employee",
              "ss_employee",
              "withholding_tax",
              "allowance",
              "other_deduction",
              "other_income",
            ],
          },
        },
        required: ["description", "amount", "direction", "item_type"],
        additionalProperties: false,
      },
    },
  },
  required: ["pay_date", "currency", "line_items"],
  additionalProperties: false,
} as const;

export async function GET() {
  return NextResponse.json({ version: "v1", ts: new Date().toISOString() });
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

    const form = await request.formData();
    const extractedText = form.get("text");

    if (typeof extractedText !== "string" || extractedText.length === 0) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });
    const stream = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Extract structured data from this payslip.\n\n" +
                "Classify each employee-facing line item using these item_type values:\n" +
                '- "net_pay": the final NET PAYMENT / net salary the employee receives. direction: credit.\n' +
                '- "pf_employee": employee provident fund contribution (PVD / กองทุนสำรองเลี้ยงชีพ / PF EMPLOYEE). direction: debit.\n' +
                '- "ss_employee": employee social security contribution (SS EMPLOYEE). direction: debit.\n' +
                '- "withholding_tax": withholding tax deducted from employee pay. direction: debit.\n' +
                '- "allowance": additional allowances paid to employee (WFH, transport, meal, etc.). direction: credit.\n' +
                '- "other_income": any other income paid to employee. direction: credit.\n' +
                '- "other_deduction": any other deduction from employee pay. direction: debit.\n\n' +
                "SKIP: employer-side items (employer PF contribution, tax absorbed/grossed-up by company), YTD figures, running balances, gross salary (only include net_pay).\n" +
                "Dates ISO YYYY-MM-DD. Amounts always positive.\n\n" +
                "=== PAYSLIP TEXT ===\n" +
                extractedText,
            },
          ],
        },
      ],
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
        { error: "Failed to parse Claude response", raw: textBlock.text.slice(0, 500) },
        { status: 500 }
      );
    }

    return NextResponse.json({ ...parsed, usage: response.usage });
  } catch (err) {
    console.error("parse-payslip error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
