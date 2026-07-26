/**
 * Capa de IA desacoplada — preparada para integrar OpenAI/Anthropic/etc.
 * Solo ofrece análisis e información. Nunca ejecuta operaciones financieras.
 */
class AIService {
    async analyzePortfolio(portfolioData) {
        if (!portfolioData) {
            return "No tengo datos de portafolio para analizar. Conecta tu cuenta Wallbit primero.";
        }

        const positions = portfolioData?.data?.assets || portfolioData?.assets || [];
        const usdBalance = portfolioData?.data?.usd_balance ?? portfolioData?.usd_balance ?? 0;

        if (!positions.length) {
            return `Tu cuenta de inversión tiene ${usdBalance} USD disponibles pero no tienes posiciones abiertas actualmente.`;
        }

        const summary = positions
            .map((p) => `• ${p.symbol || p.ticker}: ${p.shares || p.quantity || 0} acciones`)
            .join("\n");

        return `📊 Análisis de portafolio:\n\nPosiciones:\n${summary}\n\nSaldo USD disponible: ${usdBalance}\n\nNota: Este es un análisis informativo. No constituye asesoramiento financiero.`;
    }

    async explainAsset(assetData) {
        if (!assetData?.data && !assetData?.symbol) {
            return "No encontré información sobre ese activo.";
        }

        const asset = assetData.data || assetData;
        const name = asset.name || asset.symbol;
        const sector = asset.sector || "N/A";
        const price = asset.price || asset.current_price || "N/A";
        const description = asset.description || "Sin descripción disponible.";

        return `📈 *${name}* (${asset.symbol})\n\nSector: ${sector}\nPrecio: ${price}\n\n${description.slice(0, 500)}`;
    }

    async answerQuestion(question, context = {}) {
        const q = question.toLowerCase();

        if (q.includes("portafolio") || q.includes("portfolio")) {
            return this.analyzePortfolio(context.portfolio);
        }

        if (q.includes("riesgo")) {
            return "⚠️ Todo portafolio con activos financieros conlleva riesgo de mercado. Diversificar entre sectores y mantener liquidez puede ayudar a gestionar el riesgo. Consulta con un asesor financiero para recomendaciones personalizadas.";
        }

        if (q.includes("hoy") || q.includes("transaccion")) {
            const txs = context.transactions?.data || context.transactions || [];
            if (!txs.length) return "No hay transacciones recientes para mostrar.";
            return `Hoy tienes ${txs.length} transacción(es) registrada(s). Usa el comando *transactions* para ver el detalle.`;
        }

        return "Soy tu asistente financiero informativo. Puedo explicar activos, analizar tu portafolio y responder preguntas generales. No ejecuto operaciones automáticamente.\n\nPrueba: *portfolio*, *asset AAPL*, o pregúntame sobre tu cartera.";
    }
}

export default new AIService();
