import type { InlineKeyboard } from "./ui";

const API_BASE = "https://api.telegram.org";

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from?: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

/** Telegram rejects anything longer, and silently losing a reply is worse. */
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Must be applied to every value that comes from outside this codebase before
 * it lands in a message. Asset names really do contain ampersands — "State
 * Street SPDR S&P 500 ETF Trust" alone breaks the HTML parser.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Converts the Markdown a model naturally writes into the small HTML subset
 * Telegram accepts.
 *
 * HTML rather than MarkdownV2 on purpose: MarkdownV2 requires escaping `.`, `-`,
 * `(`, `!` and more, so a single unescaped character in model output makes the
 * whole send fail. Here everything is escaped first and only our own tags are
 * added afterwards, so no model output can inject markup.
 */
export function toTelegramHtml(text: string): string {
  let out = escapeHtml(text);

  out = out.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, (_, code: string) => `<pre>${code.trim()}</pre>`);
  out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Headings have no equivalent in Telegram; bold is the closest thing.
  out = out.replace(/^#{1,6}\s*(.+)$/gm, "<b>$1</b>");

  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  out = out.replace(/__([^_\n]+)__/g, "<b>$1</b>");
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>");
  out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

  // Markdown bullets render as literal dashes in Telegram.
  out = out.replace(/^[ \t]*[-*][ \t]+/gm, "• ");

  return out;
}

async function post(
  token: string,
  method: string,
  payload: unknown,
): Promise<Response | null> {
  try {
    return await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error(`telegram ${method} threw`, error);
    return null;
  }
}

async function call(token: string, method: string, payload: unknown): Promise<void> {
  const response = await post(token, method, payload);

  // Telegram failures must not crash the handler — the user already got an ACK,
  // so all we can do is surface the problem in the logs.
  if (response !== null && !response.ok) {
    console.error(`telegram ${method} failed`, response.status, await response.text());
  }
}

/**
 * `html` is TRUSTED and sent as-is. Text that came from the model must be passed
 * through toTelegramHtml() by the caller; values from an API must go through
 * escapeHtml(). Converting here would double-escape our own cards and print
 * their tags verbatim.
 */
export async function sendMessage(
  token: string,
  chatId: number,
  html: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  const trimmed = html.slice(0, MAX_MESSAGE_LENGTH);
  const markup = keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {};

  const response = await post(token, "sendMessage", {
    chat_id: chatId,
    text: trimmed,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...markup,
  });

  if (response === null || response.ok) return;

  // Malformed markup must never cost the user their answer: fall back to plain
  // text with the tags stripped, which Telegram always accepts.
  console.error("telegram sendMessage html failed", response.status, await response.text());
  await call(token, "sendMessage", {
    chat_id: chatId,
    text: trimmed.replace(/<[^>]+>/g, ""),
    ...markup,
  });
}

/**
 * Replaces the message the button belongs to, so navigating categories does not
 * leave a trail of dead cards in the chat.
 */
export async function editMessage(
  token: string,
  chatId: number,
  messageId: number,
  html: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  const trimmed = html.slice(0, MAX_MESSAGE_LENGTH);

  const response = await post(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: trimmed,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });

  // Editing fails if the content is byte-identical to what is already shown.
  // That is a no-op, not an error worth surfacing to the user.
  if (response !== null && !response.ok) {
    console.error("telegram editMessageText failed", response.status, await response.text());
  }
}

/**
 * Every callback_query must be answered or the client spins on the button
 * forever. Called even on failure paths.
 */
export function answerCallback(
  token: string,
  callbackId: string,
  text?: string,
): Promise<void> {
  return call(token, "answerCallbackQuery", {
    callback_query_id: callbackId,
    ...(text ? { text } : {}),
  });
}

/** Shows the "typing…" indicator. Expires on its own after ~5s. */
export function sendTyping(token: string, chatId: number): Promise<void> {
  return call(token, "sendChatAction", { chat_id: chatId, action: "typing" });
}
