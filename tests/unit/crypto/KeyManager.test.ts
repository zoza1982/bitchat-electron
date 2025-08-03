import { KeyManager } from '../../../src/main/crypto/KeyManager';

describe('KeyManager', () => {
  describe('Key Generation', () => {
    it('should generate valid Curve25519 key pairs', () => {
      const keyPair = KeyManager.generateCurve25519KeyPair();
      
      expect(keyPair.publicKey).toBeInstanceOf(Buffer);
      expect(keyPair.privateKey).toBeInstanceOf(Buffer);
      expect(keyPair.publicKey.length).toBe(32);
      expect(keyPair.privateKey.length).toBe(32);
      
      // Keys should be different
      expect(keyPair.publicKey).not.toEqual(keyPair.privateKey);
    });

    it('should generate valid Ed25519 key pairs', () => {
      const keyPair = KeyManager.generateEd25519KeyPair();
      
      expect(keyPair.publicKey).toBeInstanceOf(Buffer);
      expect(keyPair.privateKey).toBeInstanceOf(Buffer);
      expect(keyPair.publicKey.length).toBe(32);
      expect(keyPair.privateKey.length).toBe(64);
      
      // Keys should be different
      expect(keyPair.publicKey).not.toEqual(keyPair.privateKey.slice(0, 32));
    });

    it('should generate unique key pairs', () => {
      const keyPair1 = KeyManager.generateCurve25519KeyPair();
      const keyPair2 = KeyManager.generateCurve25519KeyPair();
      
      expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toEqual(keyPair2.privateKey);
    });

    it('should generate ephemeral key pairs', () => {
      const ephemeral = KeyManager.generateEphemeralKeyPair();
      
      expect(ephemeral.publicKey).toBeInstanceOf(Buffer);
      expect(ephemeral.privateKey).toBeInstanceOf(Buffer);
      expect(ephemeral.publicKey.length).toBe(32);
      expect(ephemeral.privateKey.length).toBe(32);
    });
  });

  describe('Diffie-Hellman', () => {
    it('should perform DH key exchange correctly', () => {
      const alice = KeyManager.generateCurve25519KeyPair();
      const bob = KeyManager.generateCurve25519KeyPair();
      
      // Both sides should derive the same shared secret
      const aliceShared = KeyManager.dh(alice.privateKey, bob.publicKey);
      const bobShared = KeyManager.dh(bob.privateKey, alice.publicKey);
      
      expect(aliceShared).toBeInstanceOf(Buffer);
      expect(aliceShared.length).toBe(32);
      expect(aliceShared).toEqual(bobShared);
    });

    it('should produce different shared secrets for different key pairs', () => {
      const alice = KeyManager.generateCurve25519KeyPair();
      const bob = KeyManager.generateCurve25519KeyPair();
      const carol = KeyManager.generateCurve25519KeyPair();
      
      const aliceBobShared = KeyManager.dh(alice.privateKey, bob.publicKey);
      const aliceCarolShared = KeyManager.dh(alice.privateKey, carol.publicKey);
      
      expect(aliceBobShared).not.toEqual(aliceCarolShared);
    });
  });

  describe('Signatures', () => {
    it('should sign and verify messages correctly', () => {
      const keyPair = KeyManager.generateEd25519KeyPair();
      const message = Buffer.from('Test message to sign');
      
      const signature = KeyManager.sign(message, keyPair.privateKey);
      
      expect(signature).toBeInstanceOf(Buffer);
      expect(signature.length).toBe(64);
      
      const isValid = KeyManager.verify(message, signature, keyPair.publicKey);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong public key', () => {
      const keyPair1 = KeyManager.generateEd25519KeyPair();
      const keyPair2 = KeyManager.generateEd25519KeyPair();
      const message = Buffer.from('Test message');
      
      const signature = KeyManager.sign(message, keyPair1.privateKey);
      const isValid = KeyManager.verify(message, signature, keyPair2.publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should fail verification with tampered message', () => {
      const keyPair = KeyManager.generateEd25519KeyPair();
      const message = Buffer.from('Original message');
      const tamperedMessage = Buffer.from('Tampered message');
      
      const signature = KeyManager.sign(message, keyPair.privateKey);
      const isValid = KeyManager.verify(tamperedMessage, signature, keyPair.publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should fail verification with tampered signature', () => {
      const keyPair = KeyManager.generateEd25519KeyPair();
      const message = Buffer.from('Test message');
      
      const signature = KeyManager.sign(message, keyPair.privateKey);
      signature[0] ^= 0xFF; // Flip some bits
      
      const isValid = KeyManager.verify(message, signature, keyPair.publicKey);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Fingerprints', () => {
    it('should generate valid fingerprints', () => {
      const keyPair = KeyManager.generateCurve25519KeyPair();
      const fingerprint = KeyManager.generateFingerprint(keyPair.publicKey);
      
      // Should be formatted as colon-separated hex
      expect(fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    });

    it('should generate consistent fingerprints', () => {
      const keyPair = KeyManager.generateCurve25519KeyPair();
      const fingerprint1 = KeyManager.generateFingerprint(keyPair.publicKey);
      const fingerprint2 = KeyManager.generateFingerprint(keyPair.publicKey);
      
      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should generate different fingerprints for different keys', () => {
      const keyPair1 = KeyManager.generateCurve25519KeyPair();
      const keyPair2 = KeyManager.generateCurve25519KeyPair();
      
      const fingerprint1 = KeyManager.generateFingerprint(keyPair1.publicKey);
      const fingerprint2 = KeyManager.generateFingerprint(keyPair2.publicKey);
      
      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });

  describe('Identity Creation', () => {
    it('should create complete identity with all keys', async () => {
      const identity = await KeyManager.createIdentity('Alice');
      
      expect(identity.nickname).toBe('Alice');
      expect(identity.staticKeyPair).toBeDefined();
      expect(identity.signingKeyPair).toBeDefined();
      expect(identity.nostrKeyPair).toBeDefined();
      expect(identity.createdAt).toBeInstanceOf(Date);
      
      // Check key formats
      expect(identity.staticKeyPair.publicKey.length).toBe(32);
      expect(identity.staticKeyPair.privateKey.length).toBe(32);
      expect(identity.signingKeyPair.publicKey.length).toBe(32);
      expect(identity.signingKeyPair.privateKey.length).toBe(64);
      expect(identity.nostrKeyPair!.publicKey).toMatch(/^[0-9a-f]{64}$/);
      expect(identity.nostrKeyPair!.privateKey).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should create unique identities', async () => {
      const identity1 = await KeyManager.createIdentity('Alice');
      const identity2 = await KeyManager.createIdentity('Bob');
      
      expect(identity1.staticKeyPair.publicKey).not.toEqual(identity2.staticKeyPair.publicKey);
      expect(identity1.signingKeyPair.publicKey).not.toEqual(identity2.signingKeyPair.publicKey);
      expect(identity1.nostrKeyPair!.publicKey).not.toBe(identity2.nostrKeyPair!.publicKey);
    });
  });

  describe('Utility Functions', () => {
    it('should perform constant-time comparison correctly', () => {
      const buffer1 = Buffer.from('test data');
      const buffer2 = Buffer.from('test data');
      const buffer3 = Buffer.from('different');
      
      expect(KeyManager.constantTimeEqual(buffer1, buffer2)).toBe(true);
      expect(KeyManager.constantTimeEqual(buffer1, buffer3)).toBe(false);
      
      // Different lengths
      const buffer4 = Buffer.from('test');
      expect(KeyManager.constantTimeEqual(buffer1, buffer4)).toBe(false);
    });

    it('should generate random nonces', () => {
      const nonce1 = KeyManager.generateNonce();
      const nonce2 = KeyManager.generateNonce();
      
      expect(nonce1).toBeInstanceOf(Buffer);
      expect(nonce1.length).toBe(24); // NaCl box nonce length
      expect(nonce1).not.toEqual(nonce2);
    });

    it('should generate random bytes', () => {
      const random1 = KeyManager.randomBytes(32);
      const random2 = KeyManager.randomBytes(32);
      
      expect(random1).toBeInstanceOf(Buffer);
      expect(random1.length).toBe(32);
      expect(random1).not.toEqual(random2);
      
      // Different lengths
      const random3 = KeyManager.randomBytes(16);
      expect(random3.length).toBe(16);
    });

    it('should encrypt and decrypt with NaCl box', () => {
      const alice = KeyManager.generateCurve25519KeyPair();
      const bob = KeyManager.generateCurve25519KeyPair();
      const nonce = KeyManager.generateNonce();
      const message = Buffer.from('Secret message');
      
      // Alice encrypts for Bob
      const encrypted = KeyManager.encrypt(
        message,
        nonce,
        bob.publicKey,
        alice.privateKey
      );
      
      expect(encrypted).toBeInstanceOf(Buffer);
      expect(encrypted.length).toBeGreaterThan(message.length);
      
      // Bob decrypts
      const decrypted = KeyManager.decrypt(
        encrypted,
        nonce,
        alice.publicKey,
        bob.privateKey
      );
      
      expect(decrypted).toEqual(message);
    });

    it('should fail decryption with wrong key', () => {
      const alice = KeyManager.generateCurve25519KeyPair();
      const bob = KeyManager.generateCurve25519KeyPair();
      const carol = KeyManager.generateCurve25519KeyPair();
      const nonce = KeyManager.generateNonce();
      const message = Buffer.from('Secret message');
      
      const encrypted = KeyManager.encrypt(
        message,
        nonce,
        bob.publicKey,
        alice.privateKey
      );
      
      // Carol tries to decrypt (should fail)
      const decrypted = KeyManager.decrypt(
        encrypted,
        nonce,
        alice.publicKey,
        carol.privateKey
      );
      
      expect(decrypted).toBeNull();
    });
  });

  describe('Nostr Key Derivation', () => {
    it('should derive Nostr keys from Noise keys', () => {
      const noiseKeyPair = KeyManager.generateCurve25519KeyPair();
      const nostrKeys = KeyManager.deriveNostrKeys(noiseKeyPair);
      
      expect(nostrKeys.publicKey).toMatch(/^[0-9a-f]{64}$/);
      expect(nostrKeys.privateKey).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should derive consistent Nostr keys', () => {
      const noiseKeyPair = KeyManager.generateCurve25519KeyPair();
      const nostrKeys1 = KeyManager.deriveNostrKeys(noiseKeyPair);
      const nostrKeys2 = KeyManager.deriveNostrKeys(noiseKeyPair);
      
      expect(nostrKeys1.publicKey).toBe(nostrKeys2.publicKey);
      expect(nostrKeys1.privateKey).toBe(nostrKeys2.privateKey);
    });

    it('should derive different Nostr keys from different Noise keys', () => {
      const noiseKeyPair1 = KeyManager.generateCurve25519KeyPair();
      const noiseKeyPair2 = KeyManager.generateCurve25519KeyPair();
      
      const nostrKeys1 = KeyManager.deriveNostrKeys(noiseKeyPair1);
      const nostrKeys2 = KeyManager.deriveNostrKeys(noiseKeyPair2);
      
      expect(nostrKeys1.publicKey).not.toBe(nostrKeys2.publicKey);
      expect(nostrKeys1.privateKey).not.toBe(nostrKeys2.privateKey);
    });
  });
});