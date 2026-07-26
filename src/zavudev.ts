import Zavudev from "@zavudev/sdk";

export interface ZavudevSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends a notification message to a Telegram chat using the Zavudev SDK.
 *
 * Why separate from `telegram.ts`: While `telegram.ts` manages raw Bot API
 * HTTP calls for conversational features (inline keyboards, editing cards),
 * Zavudev SDK provides a unified multi-channel messaging client ideal for
 * proactive alerts, cron job broadcasts, and out-of-band notifications.
 */
export async function sendZavudevAlert(
  apiKey: string | undefined,
  chatId: number,
  text: string,
): Promise<ZavudevSendResult> {
  if (!apiKey || apiKey.trim() === "") {
    return {
      ok: false,
      error:
        "No se encontró la clave ZAVUDEV_API_KEY en las variables de entorno. Asegúrate de configurarla en tu archivo .dev.vars.",
    };
  }

  try {
    const zavu = new Zavudev({ apiKey });
    const response = await zavu.messages.send({
      to: String(chatId),
      channel: "telegram",
      text,
    });

    return {
      ok: true,
      messageId: response.message.id,
    };
  } catch (error) {
    console.error("sendZavudevAlert threw", error);
    const errorMessage =
      error instanceof Error ? error.message : "Error desconocido de red o de la API de Zavudev";
    return {
      ok: false,
      error: `Fallo al enviar la alerta con Zavudev: ${errorMessage}`,
    };
  }
}
