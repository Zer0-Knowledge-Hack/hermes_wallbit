let sockInstance = null;
let connectionInfo = {
    status: "disconnected",
    phone: null,
    name: null,
    connectedAt: null,
    qr: null,
};

class WhatsAppService {
    setSocket(sock) {
        sockInstance = sock;
    }

    getSocket() {
        return sockInstance;
    }

    setConnectionInfo(info) {
        connectionInfo = { ...connectionInfo, ...info };
    }

    getConnectionInfo() {
        return { ...connectionInfo };
    }

    async sendText(jid, text) {
        if (!sockInstance) throw new Error("WhatsApp no conectado");

        return sockInstance.sendMessage(jid, { text });
    }

    async sendImage(jid, buffer, caption = "") {
        if (!sockInstance) throw new Error("WhatsApp no conectado");

        return sockInstance.sendMessage(jid, {
            image: buffer,
            caption,
        });
    }

    async sendDocument(jid, buffer, fileName, mimetype) {
        if (!sockInstance) throw new Error("WhatsApp no conectado");

        return sockInstance.sendMessage(jid, {
            document: buffer,
            fileName,
            mimetype,
        });
    }

    async sendLocation(jid, lat, lng, name = "") {
        if (!sockInstance) throw new Error("WhatsApp no conectado");

        return sockInstance.sendMessage(jid, {
            location: { degreesLatitude: lat, degreesLongitude: lng, name },
        });
    }

    async logout() {
        if (sockInstance) {
            await sockInstance.logout();
            sockInstance = null;
        }
    }
}

export default new WhatsAppService();
