import { NoiseProtocol, HandshakeRole, NoiseSession } from '../../../src/main/crypto/NoiseProtocol';
import { KeyManager } from '../../../src/main/crypto/KeyManager';

describe('NoiseProtocol', () => {
  let aliceStatic: any;
  let bobStatic: any;

  beforeEach(() => {
    // Generate static keys for Alice and Bob
    aliceStatic = KeyManager.generateCurve25519KeyPair();
    bobStatic = KeyManager.generateCurve25519KeyPair();
  });

  describe('XX Handshake Pattern', () => {
    it('should complete a full handshake between initiator and responder', () => {
      // Create handshake states
      const aliceState = NoiseProtocol.createHandshakeState(
        HandshakeRole.INITIATOR,
        aliceStatic
      );
      const bobState = NoiseProtocol.createHandshakeState(
        HandshakeRole.RESPONDER,
        bobStatic
      );

      // Message 1: Alice -> Bob (e)
      const msg1 = NoiseProtocol.writeMessage(aliceState);
      expect(msg1.length).toBe(32); // Just ephemeral key
      
      const { payload: payload1 } = NoiseProtocol.readMessage(bobState, msg1);
      expect(payload1.length).toBe(0);

      // Message 2: Bob -> Alice (e, ee, s, es)
      const msg2 = NoiseProtocol.writeMessage(bobState);
      expect(msg2.length).toBeGreaterThan(32); // ephemeral + encrypted static + tag
      
      const { payload: payload2 } = NoiseProtocol.readMessage(aliceState, msg2);
      expect(payload2.length).toBe(0);

      // Message 3: Alice -> Bob (s, se)
      const msg3 = NoiseProtocol.writeMessage(aliceState);
      expect(msg3.length).toBeGreaterThan(32); // encrypted static + tag
      
      const { payload: payload3, session: bobSession } = NoiseProtocol.readMessage(bobState, msg3);
      expect(payload3.length).toBe(0);
      expect(bobSession).toBeDefined();

      // Alice should also have completed state
      expect(aliceState.isComplete).toBe(true);
      expect(bobState.isComplete).toBe(true);

      // Both should have discovered each other's static keys
      expect(aliceState.remoteStatic).toEqual(bobStatic.publicKey);
      expect(bobState.remoteStatic).toEqual(aliceStatic.publicKey);
    });

    it('should establish symmetric encryption after handshake', () => {
      // Perform handshake
      const aliceState = NoiseProtocol.createHandshakeState(
        HandshakeRole.INITIATOR,
        aliceStatic
      );
      const bobState = NoiseProtocol.createHandshakeState(
        HandshakeRole.RESPONDER,
        bobStatic
      );

      // Complete handshake
      const msg1 = NoiseProtocol.writeMessage(aliceState);
      NoiseProtocol.readMessage(bobState, msg1);
      
      const msg2 = NoiseProtocol.writeMessage(bobState);
      NoiseProtocol.readMessage(aliceState, msg2);
      
      const msg3 = NoiseProtocol.writeMessage(aliceState);
      const { session: bobSession } = NoiseProtocol.readMessage(bobState, msg3);

      // Get Alice's session
      const [aliceSend, aliceReceive] = aliceState.symmetricState.split();
      const aliceSession: NoiseSession = {
        sendCipher: aliceSend,
        receiveCipher: aliceReceive,
        handshakeHash: aliceState.symmetricState.getHandshakeHash(),
        remoteStaticPublicKey: aliceState.remoteStatic!
      };

      // Test encryption/decryption
      const testMessage = Buffer.from('Hello, Bob!');
      const encrypted = NoiseProtocol.encryptMessage(aliceSession, testMessage);
      const decrypted = NoiseProtocol.decryptMessage(bobSession!, encrypted);
      
      expect(decrypted).toEqual(testMessage);

      // Test reverse direction
      const testMessage2 = Buffer.from('Hello, Alice!');
      const encrypted2 = NoiseProtocol.encryptMessage(bobSession!, testMessage2);
      const decrypted2 = NoiseProtocol.decryptMessage(aliceSession, encrypted2);
      
      expect(decrypted2).toEqual(testMessage2);
    });

    it('should handle handshake with payloads', () => {
      const aliceState = NoiseProtocol.createHandshakeState(
        HandshakeRole.INITIATOR,
        aliceStatic
      );
      const bobState = NoiseProtocol.createHandshakeState(
        HandshakeRole.RESPONDER,
        bobStatic
      );

      // Include payloads in handshake messages
      const alicePayload1 = Buffer.from('Alice handshake data 1');
      const bobPayload2 = Buffer.from('Bob handshake data 2');
      const alicePayload3 = Buffer.from('Alice handshake data 3');

      // Message 1 with payload
      const msg1 = NoiseProtocol.writeMessage(aliceState, alicePayload1);
      const { payload: receivedPayload1 } = NoiseProtocol.readMessage(bobState, msg1);
      expect(receivedPayload1).toEqual(alicePayload1);

      // Message 2 with payload
      const msg2 = NoiseProtocol.writeMessage(bobState, bobPayload2);
      const { payload: receivedPayload2 } = NoiseProtocol.readMessage(aliceState, msg2);
      expect(receivedPayload2).toEqual(bobPayload2);

      // Message 3 with payload
      const msg3 = NoiseProtocol.writeMessage(aliceState, alicePayload3);
      const { payload: receivedPayload3 } = NoiseProtocol.readMessage(bobState, msg3);
      expect(receivedPayload3).toEqual(alicePayload3);
    });

    it('should generate consistent fingerprints', () => {
      const aliceState = NoiseProtocol.createHandshakeState(
        HandshakeRole.INITIATOR,
        aliceStatic
      );
      const bobState = NoiseProtocol.createHandshakeState(
        HandshakeRole.RESPONDER,
        bobStatic
      );

      // Complete handshake
      const msg1 = NoiseProtocol.writeMessage(aliceState);
      NoiseProtocol.readMessage(bobState, msg1);
      
      const msg2 = NoiseProtocol.writeMessage(bobState);
      NoiseProtocol.readMessage(aliceState, msg2);
      
      const msg3 = NoiseProtocol.writeMessage(aliceState);
      const { session: bobSession } = NoiseProtocol.readMessage(bobState, msg3);

      // Get Alice's session
      const [aliceSend, aliceReceive] = aliceState.symmetricState.split();
      const aliceSession: NoiseSession = {
        sendCipher: aliceSend,
        receiveCipher: aliceReceive,
        handshakeHash: aliceState.symmetricState.getHandshakeHash(),
        remoteStaticPublicKey: aliceState.remoteStatic!
      };

      // Check fingerprints
      const aliceViewOfBob = NoiseProtocol.getRemoteFingerprint(aliceSession);
      const bobViewOfAlice = NoiseProtocol.getRemoteFingerprint(bobSession!);

      const aliceFingerprint = KeyManager.generateFingerprint(aliceStatic.publicKey);
      const bobFingerprint = KeyManager.generateFingerprint(bobStatic.publicKey);

      expect(aliceViewOfBob).toBe(bobFingerprint);
      expect(bobViewOfAlice).toBe(aliceFingerprint);
    });

    it('should fail on corrupted handshake messages', () => {
      const aliceState = NoiseProtocol.createHandshakeState(
        HandshakeRole.INITIATOR,
        aliceStatic
      );
      const bobState = NoiseProtocol.createHandshakeState(
        HandshakeRole.RESPONDER,
        bobStatic
      );

      // Message 1
      const msg1 = NoiseProtocol.writeMessage(aliceState);
      NoiseProtocol.readMessage(bobState, msg1);

      // Message 2
      const msg2 = NoiseProtocol.writeMessage(bobState);
      
      // Corrupt the message
      msg2[msg2.length - 1] ^= 0xFF;

      // Should fail to read corrupted message
      expect(() => {
        NoiseProtocol.readMessage(aliceState, msg2);
      }).toThrow();
    });

    it('should handle transport message encryption with increasing nonces', () => {
      // Complete handshake first
      const aliceState = NoiseProtocol.createHandshakeState(
        HandshakeRole.INITIATOR,
        aliceStatic
      );
      const bobState = NoiseProtocol.createHandshakeState(
        HandshakeRole.RESPONDER,
        bobStatic
      );

      const msg1 = NoiseProtocol.writeMessage(aliceState);
      NoiseProtocol.readMessage(bobState, msg1);
      
      const msg2 = NoiseProtocol.writeMessage(bobState);
      NoiseProtocol.readMessage(aliceState, msg2);
      
      const msg3 = NoiseProtocol.writeMessage(aliceState);
      const { session: bobSession } = NoiseProtocol.readMessage(bobState, msg3);

      const [aliceSend, aliceReceive] = aliceState.symmetricState.split();
      const aliceSession: NoiseSession = {
        sendCipher: aliceSend,
        receiveCipher: aliceReceive,
        handshakeHash: aliceState.symmetricState.getHandshakeHash(),
        remoteStaticPublicKey: aliceState.remoteStatic!
      };

      // Send multiple messages and verify nonces increment
      const messages = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
      
      for (const msg of messages) {
        const plaintext = Buffer.from(msg);
        const encrypted = NoiseProtocol.encryptMessage(aliceSession, plaintext);
        const decrypted = NoiseProtocol.decryptMessage(bobSession!, encrypted);
        expect(decrypted).toEqual(plaintext);
      }

      // Messages in reverse direction
      for (const msg of messages) {
        const plaintext = Buffer.from(msg + ' response');
        const encrypted = NoiseProtocol.encryptMessage(bobSession!, plaintext);
        const decrypted = NoiseProtocol.decryptMessage(aliceSession, encrypted);
        expect(decrypted).toEqual(plaintext);
      }
    });
  });

  describe('Error handling', () => {
    it('should throw on invalid handshake state transitions', () => {
      const state = NoiseProtocol.createHandshakeState(
        HandshakeRole.INITIATOR,
        aliceStatic
      );

      // Write first message
      NoiseProtocol.writeMessage(state);

      // Try to write again without reading response
      expect(() => {
        NoiseProtocol.writeMessage(state);
      }).toThrow();
    });

    it('should throw on operations after handshake complete', () => {
      const aliceState = NoiseProtocol.createHandshakeState(
        HandshakeRole.INITIATOR,
        aliceStatic
      );
      const bobState = NoiseProtocol.createHandshakeState(
        HandshakeRole.RESPONDER,
        bobStatic
      );

      // Complete handshake
      const msg1 = NoiseProtocol.writeMessage(aliceState);
      NoiseProtocol.readMessage(bobState, msg1);
      
      const msg2 = NoiseProtocol.writeMessage(bobState);
      NoiseProtocol.readMessage(aliceState, msg2);
      
      const msg3 = NoiseProtocol.writeMessage(aliceState);
      NoiseProtocol.readMessage(bobState, msg3);

      // Try to continue handshake
      expect(() => {
        NoiseProtocol.writeMessage(aliceState);
      }).toThrow('Handshake already complete');
    });

    it('should fail decryption with wrong session', () => {
      // Create two separate handshakes
      const aliceState1 = NoiseProtocol.createHandshakeState(
        HandshakeRole.INITIATOR,
        aliceStatic
      );
      const bobState1 = NoiseProtocol.createHandshakeState(
        HandshakeRole.RESPONDER,
        bobStatic
      );

      const aliceState2 = NoiseProtocol.createHandshakeState(
        HandshakeRole.INITIATOR,
        aliceStatic
      );
      const carolStatic = KeyManager.generateCurve25519KeyPair();
      const carolState = NoiseProtocol.createHandshakeState(
        HandshakeRole.RESPONDER,
        carolStatic
      );

      // Complete first handshake (Alice-Bob)
      let msg = NoiseProtocol.writeMessage(aliceState1);
      NoiseProtocol.readMessage(bobState1, msg);
      msg = NoiseProtocol.writeMessage(bobState1);
      NoiseProtocol.readMessage(aliceState1, msg);
      msg = NoiseProtocol.writeMessage(aliceState1);
      NoiseProtocol.readMessage(bobState1, msg);

      // Complete second handshake (Alice-Carol)
      msg = NoiseProtocol.writeMessage(aliceState2);
      NoiseProtocol.readMessage(carolState, msg);
      msg = NoiseProtocol.writeMessage(carolState);
      NoiseProtocol.readMessage(aliceState2, msg);
      msg = NoiseProtocol.writeMessage(aliceState2);
      const { session: carolSession } = NoiseProtocol.readMessage(carolState, msg);

      const [aliceSend1] = aliceState1.symmetricState.split();
      const aliceSession1: NoiseSession = {
        sendCipher: aliceSend1,
        receiveCipher: null as any,
        handshakeHash: aliceState1.symmetricState.getHandshakeHash(),
        remoteStaticPublicKey: aliceState1.remoteStatic!
      };

      // Encrypt with Alice-Bob session
      const plaintext = Buffer.from('Secret message');
      const encrypted = NoiseProtocol.encryptMessage(aliceSession1, plaintext);

      // Try to decrypt with Carol's session (should fail)
      expect(() => {
        NoiseProtocol.decryptMessage(carolSession!, encrypted);
      }).toThrow();
    });
  });
});