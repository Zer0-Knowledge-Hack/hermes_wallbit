import type { Env } from "./env";
import type { Profile, Turn } from "./session";
import { runTool, TOOLS } from "./tools";
import type { AccountSnapshot } from "./wallbit";

/**
 * MoE with 3B active parameters: it supports function calling at roughly the
 * price of an 8B dense model (4,625 / 30,475 neurons per M tokens), versus
 * 26,668 / 204,805 for llama-3.3-70b. Tool support without wrecking the budget.
 */
const MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

/** Bounded so one question cannot spiral through the subrequest budget. */
const MAX_TOOL_ROUNDS = 2;

export type AccountContext =
  | { state: "unlinked" }
  | { state: "unavailable" }
  | { state: "ready"; snapshot: AccountSnapshot; apiKey: string };

const BASE_PROMPT = `You are Hermes, an assistant for Wallbit users in Bolivia.

Wallbit is a fintech that lets freelancers and companies receive payments from
abroad, hold the money in USD, spend it via QR in Bolivia, and invest it in US
stocks and ETFs.

You have tools to read the user's real Wallbit account and catalogue.

You MUST call a tool before naming any asset, symbol or price. You do not know
which instruments Wallbit offers and you do not know today's prices — any figure
you write from memory is wrong and will be discarded. If the user asks where to
invest, call search_assets. If they name a symbol, call get_asset. Never answer
those from memory. If a tool returns an error, say you could not read that.

YOUR JOB IS TO HELP THE USER DECIDE. Do it. Ask what they need the money for and
when, then narrow the catalogue to concrete options with real prices, and say
which one fits their situation and why. Being vague is failing at your job.

When the user shows interest in an amount and an instrument, call plan_investment
and walk them through the actual numbers.

Never open with a disclaimer. Be useful first; caveats go at the end, in one line.

Rules you never break:
- Never promise or imply a return. You may say what an asset IS, what it costs
  today and how it is classified — never what it will be worth.
- Never state a future price or trend as a fact. If asked to project, give
  explicit scenarios and say plainly that the past guarantees nothing.
- Never invent balances, prices, symbols or figures. Every number comes from the
  data below or from a tool result.
- You cannot execute anything. You prepare the decision; the user confirms it in
  the Wallbit app. Say that only when it becomes relevant, not as a preamble.

Reply in whatever language the user writes in.

Format for a chat window, not a document:
- Aim for 4 to 6 lines. Never write a wall of text.
- When something has many options, give the 3 or 4 most relevant and offer to
  expand, instead of dumping the whole list.
- Formatting you may use: **bold**, \`code\`, and "- " bullets. Nothing else —
  no headings, no tables, no numbered lists longer than 5 items.
- Always name concrete figures with their symbol and currency.`;

export function formatSnapshot(snapshot: AccountSnapshot): string {
  const lines: string[] = [];

  if (snapshot.checking.length === 0) {
    lines.push("Checking: sin saldo.");
  } else {
    lines.push(
      "Checking: " +
        snapshot.checking
          .map((row) => `${row.currency} ${row.balance.toFixed(2)}`)
          .join(", "),
    );
  }

  if (snapshot.holdings.length === 0) {
    lines.push("Cartera: vacía.");
    return lines.join("\n");
  }

  lines.push("Cartera:");
  let total = 0;

  for (const holding of snapshot.holdings) {
    if (holding.value !== null && holding.price !== null) {
      total += holding.value;
      lines.push(
        `- ${holding.symbol}: ${holding.shares} × $${holding.price.toFixed(2)} = $${holding.value.toFixed(2)}`,
      );
    } else {
      lines.push(`- ${holding.symbol}: ${holding.shares} (sin precio disponible)`);
    }
  }

  if (total > 0) {
    lines.push(`Valor de las posiciones con precio: $${total.toFixed(2)}`);
  }

  return lines.join("\n");
}

function systemPrompt(profile: Profile, context: AccountContext): string {
  const parts = [BASE_PROMPT];

  if (profile.firstName) {
    parts.push(`The user's name is ${profile.firstName}. Use it naturally, not in every message.`);
  }

  switch (context.state) {
    case "unlinked":
      parts.push(
        `The user has NOT linked their Wallbit account. You have no tools available
and no access to their data. If they ask about their account, tell them to send
/vincular to connect it.`,
      );
      break;

    case "unavailable":
      parts.push(
        `The user's account IS linked, but Wallbit could not be reached for this
message. Say plainly that you could not read their account right now and suggest
trying again shortly. Do not guess any figures.`,
      );
      break;

    case "ready": {
      const asOf = new Date(context.snapshot.fetchedAt).toISOString().slice(0, 16).replace("T", " ");
      parts.push(
        `Live account data, read ${asOf} UTC:

${formatSnapshot(context.snapshot)}

Use the tools for anything else — catalogue, transactions, fees, rates.`,
      );
      break;
    }
  }

  return parts.join("\n\n");
}

interface ModelMessage {
  role: string;
  content: string;
  tool_call_id?: string;
}

/**
 * Workers AI answers in OpenAI chat-completion shape for this model, and the
 * legacy flat `response` field comes back null. Older models use the flat shape,
 * so both are read.
 */
interface ModelResponse {
  response?: string | null;
  tool_calls?: RawToolCall[];
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: RawToolCall[];
    };
  }[];
}

interface RawToolCall {
  id?: string;
  function?: { name?: string; arguments?: string | Record<string, unknown> };
  name?: string;
  arguments?: string | Record<string, unknown>;
}

interface NormalizedCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

function parseArgs(raw: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (raw === undefined) return {};
  if (typeof raw !== "string") return raw;

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractContent(result: ModelResponse): string {
  const fromChoices = result.choices?.[0]?.message?.content;
  return (fromChoices ?? result.response ?? "").trim();
}

function extractToolCalls(result: ModelResponse): NormalizedCall[] {
  const raw = result.choices?.[0]?.message?.tool_calls ?? result.tool_calls ?? [];

  return raw
    .map((call, index) => ({
      id: call.id ?? `call_${index}`,
      name: call.function?.name ?? call.name ?? "",
      // OpenAI shape delivers arguments as a JSON string, not an object.
      args: parseArgs(call.function?.arguments ?? call.arguments),
    }))
    .filter((call) => call.name.length > 0);
}

export interface ReplyResult {
  text: string;
  /** Lets the caller decide which UI to attach, based on what was actually read. */
  usedTools: { name: string; args: Record<string, unknown>; output: unknown }[];
}

export async function reply(
  env: Env,
  profile: Profile,
  context: AccountContext,
  history: Turn[],
  userMessage: string,
): Promise<ReplyResult> {
  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt(profile, context) },
    ...history,
    { role: "user", content: userMessage },
  ];

  // Tools read the user's account, so they only exist once a key is available.
  const tools = context.state === "ready" ? TOOLS : undefined;
  const usedTools: ReplyResult["usedTools"] = [];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const isLastRound = round === MAX_TOOL_ROUNDS;

      const result = (await env.AI.run(MODEL, {
        messages,
        // This model reasons before answering, and that reasoning is billed and
        // budgeted as output. Too low a cap and it stops mid-thought with empty
        // content and finish_reason "length".
        max_tokens: 1024,
        // Withholding tools on the final round forces a written answer instead
        // of another tool request we would have no budget to serve.
        ...(tools && !isLastRound ? { tools } : {}),
      } as never)) as ModelResponse;

      const calls = extractToolCalls(result);

      if (calls.length === 0 || context.state !== "ready" || isLastRound) {
        return {
          text: extractContent(result) || "No pude generar una respuesta. Probá de nuevo.",
          usedTools,
        };
      }

      for (const call of calls) {
        const output = await runTool(context.apiKey, call.name, call.args, env);
        usedTools.push({ name: call.name, args: call.args, output });

        messages.push({
          role: "assistant",
          content: `Called ${call.name} with ${JSON.stringify(call.args)}`,
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(output),
        });
      }
    }

    return { text: "No pude generar una respuesta. Probá de nuevo.", usedTools };
  } catch (error) {
    // The most likely cause in production is exhausting the daily neuron
    // allowance, which surfaces as a generic error from the AI binding.
    console.error("workers ai failed", error);
    return { text: "Ahora mismo no puedo pensar. Intentá de nuevo en un rato.", usedTools };
  }
}
