// Function to convert a string to an ArrayBuffer
function stringToArrayBuffer(str: string): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer;
}

// Function to convert an ArrayBuffer to a hexadecimal string
function arrayBufferToHex(buffer: ArrayBuffer): string {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

// Function to compute SHA-256 hash
export async function sha256(input: string): Promise<string> {
    const data = stringToArrayBuffer(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return arrayBufferToHex(hashBuffer);
}