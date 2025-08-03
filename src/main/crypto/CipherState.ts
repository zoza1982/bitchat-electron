import { createHash, createHmac } from 'crypto';
import * as crypto from 'crypto';

/**
 * CipherState implements the Noise Protocol cipher operations
 * using ChaCha20-Poly1305 for authenticated encryption.
 */
export class CipherState {
  private key: Buffer | null = null;
  private nonce: bigint = 0n;

  /**
   * Initializes the cipher with a key
   */
  initializeKey(key: Buffer): void {
    if (key.length !== 32) {
      throw new Error('ChaCha20-Poly1305 requires a 32-byte key');
    }
    this.key = Buffer.from(key);
    this.nonce = 0n;
  }

  /**
   * Checks if the cipher has been initialized with a key
   */
  hasKey(): boolean {
    return this.key !== null;
  }

  /**
   * Sets the nonce value (used for rekey operations)
   */
  setNonce(nonce: bigint): void {
    this.nonce = nonce;
  }

  /**
   * Encrypts plaintext with associated data
   * Returns ciphertext with appended auth tag
   */
  encryptWithAd(ad: Buffer, plaintext: Buffer): Buffer {
    if (!this.key) {
      throw new Error('CipherState not initialized');
    }

    // Encode nonce as 96-bit (12 bytes) little-endian
    const nonceBuffer = Buffer.alloc(12);
    nonceBuffer.writeBigUInt64LE(this.nonce & 0xffffffffffffffffn, 0);
    nonceBuffer.writeUInt32LE(Number((this.nonce >> 64n) & 0xffffffffn), 8);

    // Create cipher
    const cipher = crypto.createCipheriv('chacha20-poly1305', this.key, nonceBuffer);
    
    // Set AAD
    cipher.setAAD(ad, { plaintextLength: plaintext.length });
    
    // Encrypt
    const encrypted = Buffer.concat([
      cipher.update(plaintext),
      cipher.final()
    ]);
    
    // Get auth tag
    const tag = cipher.getAuthTag();
    
    // Increment nonce
    this.nonce++;

    // Return ciphertext + tag
    return Buffer.concat([encrypted, tag]);
  }

  /**
   * Decrypts ciphertext with associated data
   * Returns plaintext or throws on authentication failure
   */
  decryptWithAd(ad: Buffer, ciphertext: Buffer): Buffer {
    if (!this.key) {
      throw new Error('CipherState not initialized');
    }

    // Auth tag is last 16 bytes
    if (ciphertext.length < 16) {
      throw new Error('Ciphertext too short');
    }

    // Split ciphertext and tag
    const actualCiphertext = ciphertext.slice(0, -16);
    const tag = ciphertext.slice(-16);

    // Encode nonce as 96-bit (12 bytes) little-endian
    const nonceBuffer = Buffer.alloc(12);
    nonceBuffer.writeBigUInt64LE(this.nonce & 0xffffffffffffffffn, 0);
    nonceBuffer.writeUInt32LE(Number((this.nonce >> 64n) & 0xffffffffn), 8);

    try {
      // Create decipher
      const decipher = crypto.createDecipheriv('chacha20-poly1305', this.key, nonceBuffer);
      
      // Set AAD
      decipher.setAAD(ad, { plaintextLength: actualCiphertext.length });
      
      // Set auth tag
      decipher.setAuthTag(tag);
      
      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(actualCiphertext),
        decipher.final()
      ]);
      
      // Increment nonce
      this.nonce++;

      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed: invalid ciphertext or authentication tag');
    }
  }

  /**
   * Performs a rekey operation (used in Noise protocol)
   * Sets the cipher key to ENCRYPT(k, maxnonce, zerolen, zeros)
   */
  rekey(): void {
    if (!this.key) {
      throw new Error('CipherState not initialized');
    }

    // Set nonce to maximum value (2^64-1)
    const maxNonce = Buffer.alloc(12);
    maxNonce.writeBigUInt64LE(0xffffffffffffffffn, 0);
    maxNonce.writeUInt32LE(0xffffffff, 8);

    // Create cipher with max nonce
    const cipher = crypto.createCipheriv('chacha20-poly1305', this.key, maxNonce);
    
    // Set empty AAD
    cipher.setAAD(Buffer.alloc(0), { plaintextLength: 32 });
    
    // Encrypt 32 zero bytes
    const zeros = Buffer.alloc(32);
    const encrypted = Buffer.concat([
      cipher.update(zeros),
      cipher.final()
    ]);
    
    // We just need the first 32 bytes of the output
    this.initializeKey(encrypted.slice(0, 32));
  }

  /**
   * Gets the current nonce value
   */
  getNonce(): bigint {
    return this.nonce;
  }

  /**
   * Clears sensitive data
   */
  clear(): void {
    if (this.key) {
      this.key.fill(0);
      this.key = null;
    }
    this.nonce = 0n;
  }
}

/**
 * SymmetricState manages a CipherState plus ck (chaining key) and h (handshake hash)
 * Used during the Noise handshake
 */
export class SymmetricState {
  private cipherState: CipherState;
  private ck: Buffer; // chaining key
  private h: Buffer;  // handshake hash

  constructor(protocolName: string) {
    this.cipherState = new CipherState();
    
    // Initialize with protocol name
    const protocolNameBytes = Buffer.from(protocolName, 'ascii');
    
    if (protocolNameBytes.length <= 32) {
      // Pad with zeros to 32 bytes
      this.h = Buffer.alloc(32);
      protocolNameBytes.copy(this.h);
    } else {
      // Hash if longer than 32 bytes
      this.h = createHash('sha256').update(protocolNameBytes).digest();
    }
    
    this.ck = Buffer.from(this.h);
  }

  /**
   * Mixes key material into the chaining key
   */
  mixKey(inputKeyMaterial: Buffer): void {
    const [ck, tempK] = this.hkdf(this.ck, inputKeyMaterial, 2);
    this.ck = ck;
    this.cipherState.initializeKey(tempK);
  }

  /**
   * Mixes data into the handshake hash
   */
  mixHash(data: Buffer): void {
    this.h = createHash('sha256')
      .update(this.h)
      .update(data)
      .digest();
  }

  /**
   * Mixes key material and updates the hash
   */
  mixKeyAndHash(inputKeyMaterial: Buffer): void {
    const [ck, tempH, tempK] = this.hkdf(this.ck, inputKeyMaterial, 3);
    this.ck = ck;
    this.mixHash(tempH);
    this.cipherState.initializeKey(tempK);
  }

  /**
   * Gets a hash of the handshake state for channel binding
   */
  getHandshakeHash(): Buffer {
    return Buffer.from(this.h);
  }

  /**
   * Encrypts plaintext and mixes ciphertext into handshake hash
   */
  encryptAndHash(plaintext: Buffer): Buffer {
    let ciphertext: Buffer;
    
    if (this.cipherState.hasKey()) {
      ciphertext = this.cipherState.encryptWithAd(this.h, plaintext);
    } else {
      // No key yet, just return plaintext
      ciphertext = Buffer.from(plaintext);
    }
    
    this.mixHash(ciphertext);
    return ciphertext;
  }

  /**
   * Decrypts ciphertext and mixes it into handshake hash
   */
  decryptAndHash(ciphertext: Buffer): Buffer {
    let plaintext: Buffer;
    
    if (this.cipherState.hasKey()) {
      plaintext = this.cipherState.decryptWithAd(this.h, ciphertext);
    } else {
      // No key yet, ciphertext is plaintext
      plaintext = Buffer.from(ciphertext);
    }
    
    this.mixHash(ciphertext);
    return plaintext;
  }

  /**
   * Splits the symmetric state into two CipherStates for transport
   */
  split(): [CipherState, CipherState] {
    const [tempK1, tempK2] = this.hkdf(this.ck, Buffer.alloc(0), 2);
    
    const c1 = new CipherState();
    const c2 = new CipherState();
    
    c1.initializeKey(tempK1);
    c2.initializeKey(tempK2);
    
    return [c1, c2];
  }

  /**
   * HKDF implementation using HMAC-SHA256
   */
  private hkdf(chainingKey: Buffer, inputKeyMaterial: Buffer, numOutputs: number): Buffer[] {
    const tempKey = this.hmac(chainingKey, inputKeyMaterial);
    const outputs: Buffer[] = [];
    
    let output = Buffer.alloc(0);
    for (let i = 1; i <= numOutputs; i++) {
      output = Buffer.from(this.hmac(tempKey, Buffer.concat([output, Buffer.from([i])])));
      outputs.push(output);
    }
    
    return outputs;
  }

  /**
   * HMAC-SHA256
   */
  private hmac(key: Buffer, data: Buffer): Buffer {
    return createHmac('sha256', key).update(data).digest();
  }

  /**
   * Gets the current CipherState
   */
  getCipherState(): CipherState {
    return this.cipherState;
  }

  /**
   * Clears sensitive data
   */
  clear(): void {
    this.cipherState.clear();
    this.ck.fill(0);
    this.h.fill(0);
  }
}