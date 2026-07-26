/** Conversation states — each inbound message is interpreted by current state */
export const SessionState = {
    IDLE: "IDLE",
    WAITING_API_KEY: "WAITING_API_KEY",
    CONNECTED: "CONNECTED",
    WAITING_CONFIRM_TRADE: "WAITING_CONFIRM_TRADE",
    WAITING_SYMBOL: "WAITING_SYMBOL",
    WAITING_AMOUNT: "WAITING_AMOUNT",
    WAITING_CONFIRMATION: "WAITING_CONFIRMATION",
};

export const API_KEY_STATUS = {
    NONE: "none",
    VALID: "valid",
    EXPIRED: "expired",
    ERROR: "error",
};
