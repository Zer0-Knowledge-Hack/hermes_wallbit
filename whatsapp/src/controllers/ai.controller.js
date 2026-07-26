import db from "../database/index.js";
import analyticsService from "../services/analytics.service.js";
import geminiService from "../services/gemini.service.js";

export function listConversations(req, res) {
    res.json({ success: true, data: db.all("ai_conversations") });
}

export function getConversation(req, res) {
    const conv = db.find("ai_conversations", (c) => c.id === req.params.id);
    if (!conv) return res.status(404).json({ success: false, message: "No encontrada" });
    res.json({ success: true, data: conv });
}

export async function chat(req, res) {
    const { message, conversationId } = req.body;
    const config = geminiService.getConfig();
    const { default: apiKeysService } = await import("../services/apikeys.service.js");
    const key = apiKeysService.getDecrypted("gemini");

    if (!key) {
        return res.status(400).json({ success: false, message: "Configura Gemini API Key primero" });
    }

    let conversation = conversationId
        ? db.find("ai_conversations", (c) => c.id === conversationId)
        : null;

    if (!conversation) {
        conversation = db.insert("ai_conversations", {
            title: message.slice(0, 50),
            messages: [],
        });
    }

    conversation.messages.push({ role: "user", content: message, at: new Date().toISOString() });

    // Streaming not implemented in v1 — return full response
    try {
        const model = config.model || "gemini-2.5-flash";
        const apiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: config.systemPrompt }] },
                    contents: [{ role: "user", parts: [{ text: message }] }],
                    generationConfig: {
                        temperature: config.temperature,
                        topP: config.topP,
                        topK: config.topK,
                        candidateCount: config.candidateCount,
                    },
                }),
            }
        );

        const data = await apiRes.json();
        const reply =
            data.candidates?.[0]?.content?.parts?.[0]?.text ||
            data.error?.message ||
            "Sin respuesta";

        conversation.messages.push({ role: "assistant", content: reply, at: new Date().toISOString() });
        db.update("ai_conversations", conversation.id, { messages: conversation.messages });

        analyticsService.recordAiUsage({ model, tokens: reply.length });

        res.json({ success: true, data: { conversationId: conversation.id, reply } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
