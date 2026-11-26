// AES-GCM encrypt/decrypt using the Web Crypto API.
// The secret key string is hashed with SHA-256 to derive a raw AES-GCM key.

export async function deriveKey(pw) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(text, keyStr) {
    const key = await deriveKey(keyStr);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));

    const comb = new Uint8Array(iv.length + enc.byteLength);
    comb.set(iv);
    comb.set(new Uint8Array(enc), iv.length);

    return bytesToBase64(comb);
}

// Spreading a large array into String.fromCharCode(...) overflows the call
// stack (~100KB+), which silently broke file and voice messages. Convert in chunks.
function bytesToBase64(bytes) {
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

export async function decrypt(data, keyStr) {
    try {
        const key = await deriveKey(keyStr);
        const bin = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bin.slice(0, 12) }, key, bin.slice(12));
        return new TextDecoder().decode(dec);
    } catch (e) {
        // Wrong key, corrupted payload, or a message meant for someone else
        // sharing a different secret key — all indistinguishable, and that's fine.
        return null;
    }
}