let ioInstance = null;

export function initializeSocket(io) {
    ioInstance = io;
}

export function getIo() {
    return ioInstance;
}

export default { initializeSocket, getIo };
