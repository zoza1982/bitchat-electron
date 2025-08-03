import * as nacl from 'tweetnacl';
import { createHash } from 'crypto';
import { KeyPair, Identity } from '../../shared/types';

/**
 * KeyManager handles cryptographic key generation and management
 * for the BitChat protocol using TweetNaCl.
 * 
 * Key Types:
 * - Curve25519: Used for Noise Protocol Diffie-Hellman operations
 * - Ed25519: Used for message signatures
 * - Secp256k1: For Nostr protocol (derived from Curve25519)
 */
export class KeyManager {
  /**
   * Generates a Curve25519 key pair for Noise Protocol
   */
  static generateCurve25519KeyPair(): KeyPair {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: Buffer.from(keyPair.publicKey),
      privateKey: Buffer.from(keyPair.secretKey)
    };
  }

  /**
   * Generates an Ed25519 key pair for signatures
   */
  static generateEd25519KeyPair(): KeyPair {
    const keyPair = nacl.sign.keyPair();
    return {
      publicKey: Buffer.from(keyPair.publicKey),
      privateKey: Buffer.from(keyPair.secretKey)
    };
  }

  /**
   * Performs Diffie-Hellman key exchange using Curve25519
   */
  static dh(privateKey: Buffer, publicKey: Buffer): Buffer {
    const shared = nacl.scalarMult(
      new Uint8Array(privateKey),
      new Uint8Array(publicKey)
    );
    return Buffer.from(shared);
  }

  /**
   * Signs a message using Ed25519
   */
  static sign(message: Buffer, privateKey: Buffer): Buffer {
    const signature = nacl.sign.detached(
      new Uint8Array(message),
      new Uint8Array(privateKey)
    );
    return Buffer.from(signature);
  }

  /**
   * Verifies an Ed25519 signature
   */
  static verify(message: Buffer, signature: Buffer, publicKey: Buffer): boolean {
    return nacl.sign.detached.verify(
      new Uint8Array(message),
      new Uint8Array(signature),
      new Uint8Array(publicKey)
    );
  }

  /**
   * Generates a fingerprint from a public key
   * Uses SHA-256 hash of the public key
   */
  static generateFingerprint(publicKey: Buffer): string {
    const hash = createHash('sha256').update(publicKey).digest();
    // Format as hex with colons for readability
    return hash.toString('hex')
      .match(/.{2}/g)!
      .join(':')
      .toUpperCase();
  }

  /**
   * Derives Nostr keys from Noise static key
   * This is a placeholder - actual implementation would need proper secp256k1
   */
  static deriveNostrKeys(noiseKeyPair: KeyPair): { publicKey: string; privateKey: string } {
    // For now, we'll use a deterministic derivation from the Noise key
    // In production, this would use proper secp256k1 key derivation
    const seed = createHash('sha256')
      .update(noiseKeyPair.privateKey)
      .update('nostr-key-derivation')
      .digest();
    
    // Generate a new keypair from the seed
    const keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(seed));
    
    return {
      publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
      privateKey: Buffer.from(keyPair.secretKey).toString('hex')
    };
  }

  /**
   * Creates a complete identity with all required keys
   */
  static async createIdentity(nickname: string): Promise<Identity> {
    const staticKeyPair = this.generateCurve25519KeyPair();
    const signingKeyPair = this.generateEd25519KeyPair();
    const nostrKeyPair = this.deriveNostrKeys(staticKeyPair);

    return {
      nickname,
      staticKeyPair,
      signingKeyPair,
      nostrKeyPair,
      createdAt: new Date()
    };
  }

  /**
   * Generates ephemeral key pair for Noise handshake
   */
  static generateEphemeralKeyPair(): KeyPair {
    return this.generateCurve25519KeyPair();
  }

  /**
   * Constant-time comparison of two buffers
   * Important for security to prevent timing attacks
   */
  static constantTimeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    
    return result === 0;
  }

  /**
   * Generates a random nonce for encryption
   */
  static generateNonce(): Buffer {
    return Buffer.from(nacl.randomBytes(nacl.box.nonceLength));
  }

  /**
   * Generates random bytes
   */
  static randomBytes(length: number): Buffer {
    return Buffer.from(nacl.randomBytes(length));
  }

  /**
   * Encrypts data using NaCl box (for testing/utility)
   */
  static encrypt(
    message: Buffer,
    nonce: Buffer,
    theirPublicKey: Buffer,
    ourPrivateKey: Buffer
  ): Buffer {
    const encrypted = nacl.box(
      new Uint8Array(message),
      new Uint8Array(nonce),
      new Uint8Array(theirPublicKey),
      new Uint8Array(ourPrivateKey)
    );
    return Buffer.from(encrypted);
  }

  /**
   * Decrypts data using NaCl box (for testing/utility)
   */
  static decrypt(
    ciphertext: Buffer,
    nonce: Buffer,
    theirPublicKey: Buffer,
    ourPrivateKey: Buffer
  ): Buffer | null {
    const decrypted = nacl.box.open(
      new Uint8Array(ciphertext),
      new Uint8Array(nonce),
      new Uint8Array(theirPublicKey),
      new Uint8Array(ourPrivateKey)
    );
    
    if (!decrypted) {
      return null;
    }
    
    return Buffer.from(decrypted);
  }
}