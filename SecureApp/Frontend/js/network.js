// Owns the WebSocket connection and routes decrypted messages to the
// module that handles each `type`. Other modules import `sendEncrypted`
// to talk back to the server.

import { state } from './state.js';
import { encrypt, decrypt } from './encryption.js';
import { handlePing, handlePong, handleOnlineAnnouncement, handleOfflineAnnouncement, updateStatus, addContact } from './contacts.js';
import { handleIncomingMessage, handleTyping, handleReadReceipt, handleDeleteMessage } from './chat.js';
import { handleSignal } from './webrtc.js';

export function connect(onOpen) {
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    state.ws = new WebSocket(`${protocol}${window.location.host}/ws`);

    state.ws.onopen = () => onOpen && onOpen();
    state.ws.onmessage = onMessage;
    state.ws.onclose = () => {
        // Best-effort: stop trying to send heartbeats etc. against a dead socket.
        state.ws = null;
    };
}

export async function sendEncrypted(obj) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    const payload = JSON.stringify(obj);
    const enc = await encrypt(payload, state.secretKey);
    state.ws.send(enc);
}

async function onMessage(e) {
    const dec = await decrypt(e.data, state.secretKey);
    if (!dec) return; // not for us / wrong key
    const data = JSON.parse(dec);

    // Presence handshake
    if (data.type === 'ping' && data.target === state.myUsername) return handlePing(data);
    if (data.type === 'pong' && data.target === state.myUsername) return handlePong(data);
    if (data.type === 'online') return handleOnlineAnnouncement(data);
    if (data.type === 'offline') return handleOfflineAnnouncement(data);

    // WebRTC signalling
    if (data.isSignal && data.target === state.myUsername) return handleSignal(data);

    // Read receipts
    if (data.type === 'read' && data.target === state.myUsername) return handleReadReceipt(data);

    // Message deletion
    if (data.type === 'delete' && data.target === state.myUsername) return handleDeleteMessage(data);

    // Everything else (messages / typing), addressed to us or broadcast
    if (data.user !== state.myUsername && (!data.target || data.target === state.myUsername || data.target === 'all')) {
        if (data.type === 'typing') {
            handleTyping(data.user);
        } else {
            // Auto-add the sender so their message shows up without a manual
            // "add contact" step. Must happen before updateStatus/handleIncomingMessage,
            // which look up the contact's DOM element.
            addContact(data.user);
            updateStatus(data.user, true);
            handleIncomingMessage(data);
        }
    }
}