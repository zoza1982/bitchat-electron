import { CipherState, SymmetricState } from '../../../src/main/crypto/CipherState';
import { randomBytes } from 'crypto';

describe('CipherState', () => {
  let cipher: CipherState;
  let key: Buffer;

  beforeEach(() => {
    cipher = new CipherState();
    key = randomBytes(32); // 32-byte key for ChaCha20-Poly1305
  });

  describe('Initialization', () => {
    it('should initialize with a valid 32-byte key', () => {
      cipher.initializeKey(key);
      expect(cipher.hasKey()).toBe(true);
    });

    it('should throw on invalid key length', () => {
      const invalidKey = randomBytes(16); // Wrong size
      expect(() => cipher.initializeKey(invalidKey)).toThrow('ChaCha20-Poly1305 requires a 32-byte key');
    });

    it('should start without a key', () => {
      expect(cipher.hasKey()).toBe(false);
    });

    it('should reset nonce on initialization', () => {
      cipher.initializeKey(key);
      cipher.setNonce(100n);
      
      const newKey = randomBytes(32);
      cipher.initializeKey(newKey);
      
      expect(cipher.getNonce()).toBe(0n);
    });
  });

  describe('Encryption and Decryption', () => {
    beforeEach(() => {
      cipher.initializeKey(key);
    });

    it('should encrypt and decrypt data correctly', () => {
      const plaintext = Buffer.from('Hello, World! This is a test message.');
      const ad = Buffer.from('additional data');
      
      const ciphertext = cipher.encryptWithAd(ad, plaintext);
      expect(ciphertext.length).toBe(plaintext.length + 16); // 16-byte auth tag
      
      // Reset nonce for decryption
      cipher.setNonce(0n);
      
      const decrypted = cipher.decryptWithAd(ad, ciphertext);
      expect(decrypted).toEqual(plaintext);
    });

    it('should handle empty plaintext', () => {
      const plaintext = Buffer.alloc(0);
      const ad = Buffer.from('additional data');
      
      const ciphertext = cipher.encryptWithAd(ad, plaintext);
      expect(ciphertext.length).toBe(16); // Just auth tag
      
      cipher.setNonce(0n);
      const decrypted = cipher.decryptWithAd(ad, ciphertext);
      expect(decrypted).toEqual(plaintext);
    });

    it('should handle empty additional data', () => {
      const plaintext = Buffer.from('Test message');
      const ad = Buffer.alloc(0);
      
      const ciphertext = cipher.encryptWithAd(ad, plaintext);
      
      cipher.setNonce(0n);
      const decrypted = cipher.decryptWithAd(ad, ciphertext);
      expect(decrypted).toEqual(plaintext);
    });

    it('should increment nonce after each operation', () => {
      const plaintext = Buffer.from('Test');
      const ad = Buffer.alloc(0);
      
      expect(cipher.getNonce()).toBe(0n);
      
      const ciphertext1 = cipher.encryptWithAd(ad, plaintext);
      expect(cipher.getNonce()).toBe(1n);
      
      const ciphertext2 = cipher.encryptWithAd(ad, plaintext);
      expect(cipher.getNonce()).toBe(2n);
      
      // Create a new cipher for decryption to test nonce increment
      const decryptCipher = new CipherState();
      decryptCipher.initializeKey(key);
      
      const decrypted1 = decryptCipher.decryptWithAd(ad, ciphertext1);
      expect(decryptCipher.getNonce()).toBe(1n);
      expect(decrypted1).toEqual(plaintext);
      
      const decrypted2 = decryptCipher.decryptWithAd(ad, ciphertext2);
      expect(decryptCipher.getNonce()).toBe(2n);
      expect(decrypted2).toEqual(plaintext);
    });

    it('should fail decryption with wrong additional data', () => {
      const plaintext = Buffer.from('Secret message');
      const ad = Buffer.from('correct ad');
      const wrongAd = Buffer.from('wrong ad');
      
      const ciphertext = cipher.encryptWithAd(ad, plaintext);
      
      cipher.setNonce(0n);
      expect(() => cipher.decryptWithAd(wrongAd, ciphertext))
        .toThrow('Decryption failed: invalid ciphertext or authentication tag');
    });

    it('should fail decryption with tampered ciphertext', () => {
      const plaintext = Buffer.from('Secret message');
      const ad = Buffer.from('additional data');
      
      const ciphertext = cipher.encryptWithAd(ad, plaintext);
      ciphertext[0] ^= 0xFF; // Tamper with ciphertext
      
      cipher.setNonce(0n);
      expect(() => cipher.decryptWithAd(ad, ciphertext))
        .toThrow('Decryption failed: invalid ciphertext or authentication tag');
    });

    it('should fail decryption with wrong nonce', () => {
      const plaintext = Buffer.from('Secret message');
      const ad = Buffer.from('additional data');
      
      const ciphertext = cipher.encryptWithAd(ad, plaintext);
      
      cipher.setNonce(1n); // Wrong nonce (should be 0)
      expect(() => cipher.decryptWithAd(ad, ciphertext))
        .toThrow('Decryption failed: invalid ciphertext or authentication tag');
    });

    it('should throw when not initialized', () => {
      const uninitializedCipher = new CipherState();
      const plaintext = Buffer.from('Test');
      const ad = Buffer.alloc(0);
      
      expect(() => uninitializedCipher.encryptWithAd(ad, plaintext))
        .toThrow('CipherState not initialized');
      
      expect(() => uninitializedCipher.decryptWithAd(ad, Buffer.alloc(20)))
        .toThrow('CipherState not initialized');
    });
  });

  describe('Rekey Operation', () => {
    beforeEach(() => {
      cipher.initializeKey(key);
    });

    it('should perform rekey operation', () => {
      const plaintext = Buffer.from('Test before rekey');
      const ad = Buffer.alloc(0);
      
      // Encrypt with original key
      const ciphertext1 = cipher.encryptWithAd(ad, plaintext);
      
      // Rekey
      cipher.rekey();
      expect(cipher.hasKey()).toBe(true);
      expect(cipher.getNonce()).toBe(0n);
      
      // Encrypt with new key
      const ciphertext2 = cipher.encryptWithAd(ad, plaintext);
      
      // Ciphertexts should be different
      expect(ciphertext1).not.toEqual(ciphertext2);
    });

    it('should throw rekey when not initialized', () => {
      const uninitializedCipher = new CipherState();
      expect(() => uninitializedCipher.rekey())
        .toThrow('CipherState not initialized');
    });
  });

  describe('Clear Operation', () => {
    it('should clear sensitive data', () => {
      cipher.initializeKey(key);
      cipher.setNonce(42n);
      
      expect(cipher.hasKey()).toBe(true);
      expect(cipher.getNonce()).toBe(42n);
      
      cipher.clear();
      
      expect(cipher.hasKey()).toBe(false);
      expect(cipher.getNonce()).toBe(0n);
    });
  });
});

describe('SymmetricState', () => {
  let symmetricState: SymmetricState;
  const protocolName = 'Noise_XX_25519_ChaChaPoly_SHA256';

  beforeEach(() => {
    symmetricState = new SymmetricState(protocolName);
  });

  describe('Initialization', () => {
    it('should initialize with protocol name', () => {
      const hash = symmetricState.getHandshakeHash();
      expect(hash).toBeInstanceOf(Buffer);
      expect(hash.length).toBe(32);
    });

    it('should handle short protocol names', () => {
      const shortState = new SymmetricState('Test');
      const hash = shortState.getHandshakeHash();
      expect(hash.length).toBe(32);
      expect(hash.slice(0, 4).toString()).toBe('Test');
      
      // Rest should be zeros
      for (let i = 4; i < 32; i++) {
        expect(hash[i]).toBe(0);
      }
    });

    it('should hash long protocol names', () => {
      const longName = 'This is a very long protocol name that exceeds 32 bytes';
      const longState = new SymmetricState(longName);
      const hash = longState.getHandshakeHash();
      expect(hash.length).toBe(32);
      
      // Should not contain the raw name
      expect(hash.toString()).not.toContain(longName);
    });
  });

  describe('Mix Operations', () => {
    it('should mix key material', () => {
      const keyMaterial = randomBytes(32);
      symmetricState.mixKey(keyMaterial);
      
      // Should have initialized cipher
      expect(symmetricState.getCipherState().hasKey()).toBe(true);
    });

    it('should mix hash data', () => {
      const initialHash = Buffer.from(symmetricState.getHandshakeHash());
      const data = Buffer.from('some data to hash');
      
      symmetricState.mixHash(data);
      
      const newHash = symmetricState.getHandshakeHash();
      expect(newHash).not.toEqual(initialHash);
      expect(newHash.length).toBe(32);
    });

    it('should mix key and hash', () => {
      const initialHash = Buffer.from(symmetricState.getHandshakeHash());
      const keyMaterial = randomBytes(32);
      
      symmetricState.mixKeyAndHash(keyMaterial);
      
      expect(symmetricState.getCipherState().hasKey()).toBe(true);
      expect(symmetricState.getHandshakeHash()).not.toEqual(initialHash);
    });
  });

  describe('Encrypt and Hash', () => {
    it('should encrypt when key is set', () => {
      const keyMaterial = randomBytes(32);
      symmetricState.mixKey(keyMaterial);
      
      const plaintext = Buffer.from('Test message');
      const ciphertext = symmetricState.encryptAndHash(plaintext);
      
      expect(ciphertext.length).toBe(plaintext.length + 16);
      expect(ciphertext).not.toEqual(plaintext);
    });

    it('should return plaintext when no key', () => {
      const plaintext = Buffer.from('Test message');
      const result = symmetricState.encryptAndHash(plaintext);
      
      expect(result).toEqual(plaintext);
    });

    it('should update hash with ciphertext', () => {
      const keyMaterial = randomBytes(32);
      symmetricState.mixKey(keyMaterial);
      
      const initialHash = Buffer.from(symmetricState.getHandshakeHash());
      const plaintext = Buffer.from('Test message');
      
      symmetricState.encryptAndHash(plaintext);
      
      const newHash = symmetricState.getHandshakeHash();
      expect(newHash).not.toEqual(initialHash);
    });
  });

  describe('Decrypt and Hash', () => {
    it('should decrypt when key is set', () => {
      const keyMaterial = randomBytes(32);
      symmetricState.mixKey(keyMaterial);
      
      const plaintext = Buffer.from('Test message');
      const ciphertext = symmetricState.encryptAndHash(plaintext);
      
      // Create new state with same initial conditions
      const symmetricState2 = new SymmetricState(protocolName);
      symmetricState2.mixKey(keyMaterial);
      
      const decrypted = symmetricState2.decryptAndHash(ciphertext);
      expect(decrypted).toEqual(plaintext);
    });

    it('should return ciphertext as plaintext when no key', () => {
      const data = Buffer.from('Test data');
      const result = symmetricState.decryptAndHash(data);
      
      expect(result).toEqual(data);
    });

    it('should update hash with ciphertext during decrypt', () => {
      const keyMaterial = randomBytes(32);
      symmetricState.mixKey(keyMaterial);
      
      const plaintext = Buffer.from('Test message');
      const ciphertext = symmetricState.encryptAndHash(plaintext);
      
      const symmetricState2 = new SymmetricState(protocolName);
      symmetricState2.mixKey(keyMaterial);
      
      const initialHash = Buffer.from(symmetricState2.getHandshakeHash());
      symmetricState2.decryptAndHash(ciphertext);
      
      const newHash = symmetricState2.getHandshakeHash();
      expect(newHash).not.toEqual(initialHash);
    });
  });

  describe('Split Operation', () => {
    it('should split into two cipher states', () => {
      const keyMaterial = randomBytes(32);
      symmetricState.mixKey(keyMaterial);
      
      const [c1, c2] = symmetricState.split();
      
      expect(c1.hasKey()).toBe(true);
      expect(c2.hasKey()).toBe(true);
      
      // Should have different keys
      const plaintext = Buffer.from('Test');
      const ad = Buffer.alloc(0);
      
      const ciphertext1 = c1.encryptWithAd(ad, plaintext);
      const ciphertext2 = c2.encryptWithAd(ad, plaintext);
      
      expect(ciphertext1).not.toEqual(ciphertext2);
    });

    it('should create bidirectional ciphers', () => {
      const keyMaterial = randomBytes(32);
      symmetricState.mixKey(keyMaterial);
      
      const [c1, c2] = symmetricState.split();
      
      const plaintext1 = Buffer.from('Message from A to B');
      const plaintext2 = Buffer.from('Message from B to A');
      const ad = Buffer.alloc(0);
      
      // For Noise protocol split():
      // Initiator uses c1 for sending, c2 for receiving
      // Responder uses c2 for sending, c1 for receiving
      
      // Test A->B direction (c1 encrypts, c1 decrypts on other side)
      const encrypted1 = c1.encryptWithAd(ad, plaintext1);
      
      // Test B->A direction (c2 encrypts, c2 decrypts on other side)
      const encrypted2 = c2.encryptWithAd(ad, plaintext2);
      
      // Create new ciphers for the "other side"
      const keyMaterial2 = randomBytes(32);
      const symmetricState2 = new SymmetricState('Noise_XX_25519_ChaChaPoly_SHA256');
      symmetricState2.mixKey(keyMaterial);
      const [c1_recv, c2_recv] = symmetricState2.split();
      
      // Decrypt A->B message with c1_recv
      const decrypted1 = c1_recv.decryptWithAd(ad, encrypted1);
      expect(decrypted1).toEqual(plaintext1);
      
      // Decrypt B->A message with c2_recv
      const decrypted2 = c2_recv.decryptWithAd(ad, encrypted2);
      expect(decrypted2).toEqual(plaintext2);
    });
  });

  describe('Clear Operation', () => {
    it('should clear all sensitive data', () => {
      const keyMaterial = randomBytes(32);
      symmetricState.mixKey(keyMaterial);
      
      expect(symmetricState.getCipherState().hasKey()).toBe(true);
      
      symmetricState.clear();
      
      expect(symmetricState.getCipherState().hasKey()).toBe(false);
      
      // Hash should be cleared (all zeros)
      const hash = symmetricState.getHandshakeHash();
      expect(hash.every(b => b === 0)).toBe(true);
    });
  });
});