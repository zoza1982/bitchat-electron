import { NoiseSessionManager } from '../../../src/main/crypto/NoiseSessionManager';
import { KeyManager } from '../../../src/main/crypto/KeyManager';
import { MessageType } from '../../../src/shared/constants';

describe('NoiseSessionManager', () => {
  let aliceStatic: any;
  let bobStatic: any;
  let aliceManager: NoiseSessionManager;
  let bobManager: NoiseSessionManager;

  beforeEach(() => {
    // Generate static keys
    aliceStatic = KeyManager.generateCurve25519KeyPair();
    bobStatic = KeyManager.generateCurve25519KeyPair();

    // Create managers
    aliceManager = new NoiseSessionManager(aliceStatic);
    bobManager = new NoiseSessionManager(bobStatic);
  });

  afterEach(() => {
    // Clean up
    aliceManager.destroy();
    bobManager.destroy();
  });

  describe('Session Management', () => {
    it('should create and manage a session between two peers', async () => {
      const aliceMessages: any[] = [];
      const bobMessages: any[] = [];

      // Set up message handlers
      aliceManager.on('handshakeMessage', (msg) => aliceMessages.push(msg));
      bobManager.on('handshakeMessage', (msg) => bobMessages.push(msg));

      let aliceSessionEstablished = false;
      let bobSessionEstablished = false;

      aliceManager.on('sessionEstablished', (event) => {
        aliceSessionEstablished = true;
        expect(event.isInitiator).toBe(true);
      });

      bobManager.on('sessionEstablished', (event) => {
        bobSessionEstablished = true;
        expect(event.isInitiator).toBe(false);
      });

      // Alice initiates handshake
      await aliceManager.initiateHandshake('bob-peer-id');
      
      // Check that first message was generated
      expect(aliceMessages).toHaveLength(1);
      expect(aliceMessages[0].type).toBe(MessageType.NOISE_HANDSHAKE_INIT);

      // Bob processes first message
      await bobManager.processHandshakeMessage(
        'alice-peer-id',
        MessageType.NOISE_HANDSHAKE_INIT,
        aliceMessages[0].message
      );

      // Bob should have sent response
      expect(bobMessages).toHaveLength(1);
      expect(bobMessages[0].type).toBe(MessageType.NOISE_HANDSHAKE_RESP);

      // Alice processes response
      await aliceManager.processHandshakeMessage(
        'bob-peer-id',
        MessageType.NOISE_HANDSHAKE_RESP,
        bobMessages[0].message
      );

      // Alice should complete handshake
      expect(aliceMessages).toHaveLength(2);
      expect(aliceMessages[1].type).toBe(MessageType.NOISE_ENCRYPTED);

      // Bob processes final message
      await bobManager.processHandshakeMessage(
        'alice-peer-id',
        MessageType.NOISE_ENCRYPTED,
        aliceMessages[1].message
      );

      // Both should have established sessions
      expect(aliceSessionEstablished).toBe(true);
      expect(bobSessionEstablished).toBe(true);

      // Verify sessions exist
      expect(aliceManager.hasSession('bob-peer-id')).toBe(true);
      expect(bobManager.hasSession('alice-peer-id')).toBe(true);
    });

    it('should encrypt and decrypt messages after session establishment', async () => {
      // Perform handshake (simplified for test)
      const performHandshake = async () => {
        const messages: any[] = [];
        
        aliceManager.on('handshakeMessage', (msg) => messages.push({ from: 'alice', ...msg }));
        bobManager.on('handshakeMessage', (msg) => messages.push({ from: 'bob', ...msg }));

        await aliceManager.initiateHandshake('bob-peer-id');
        const msg1 = messages.find(m => m.from === 'alice' && m.type === MessageType.NOISE_HANDSHAKE_INIT);
        
        await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_HANDSHAKE_INIT, msg1.message);
        const msg2 = messages.find(m => m.from === 'bob' && m.type === MessageType.NOISE_HANDSHAKE_RESP);
        
        await aliceManager.processHandshakeMessage('bob-peer-id', MessageType.NOISE_HANDSHAKE_RESP, msg2.message);
        const msg3 = messages.find(m => m.from === 'alice' && m.type === MessageType.NOISE_ENCRYPTED);
        
        await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_ENCRYPTED, msg3.message);
      };

      await performHandshake();

      // Test encryption/decryption
      const plaintext = Buffer.from('Hello, Bob! This is a secret message.');
      const encrypted = aliceManager.encryptMessage('bob-peer-id', plaintext);
      const decrypted = bobManager.decryptMessage('alice-peer-id', encrypted);

      expect(decrypted).toEqual(plaintext);

      // Test reverse direction
      const plaintext2 = Buffer.from('Hello, Alice! Got your message.');
      const encrypted2 = bobManager.encryptMessage('alice-peer-id', plaintext2);
      const decrypted2 = aliceManager.decryptMessage('bob-peer-id', encrypted2);

      expect(decrypted2).toEqual(plaintext2);
    });

    it('should handle multiple sequential messages', async () => {
      // Perform handshake first
      const performHandshake = async () => {
        const messages: any[] = [];
        
        aliceManager.on('handshakeMessage', (msg) => messages.push({ from: 'alice', ...msg }));
        bobManager.on('handshakeMessage', (msg) => messages.push({ from: 'bob', ...msg }));

        await aliceManager.initiateHandshake('bob-peer-id');
        const msg1 = messages.find(m => m.from === 'alice' && m.type === MessageType.NOISE_HANDSHAKE_INIT);
        
        await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_HANDSHAKE_INIT, msg1.message);
        const msg2 = messages.find(m => m.from === 'bob' && m.type === MessageType.NOISE_HANDSHAKE_RESP);
        
        await aliceManager.processHandshakeMessage('bob-peer-id', MessageType.NOISE_HANDSHAKE_RESP, msg2.message);
        const msg3 = messages.find(m => m.from === 'alice' && m.type === MessageType.NOISE_ENCRYPTED);
        
        await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_ENCRYPTED, msg3.message);
      };

      await performHandshake();

      // Send multiple messages
      const messages = [
        'First message',
        'Second message with more content',
        'Third message with emojis 🔐 🚀',
        'Fourth message with special chars: !@#$%^&*()',
        'Fifth message that is a bit longer to test various message sizes'
      ];

      for (const msg of messages) {
        const plaintext = Buffer.from(msg);
        const encrypted = aliceManager.encryptMessage('bob-peer-id', plaintext);
        const decrypted = bobManager.decryptMessage('alice-peer-id', encrypted);
        expect(decrypted.toString()).toBe(msg);
      }

      // Test reverse direction
      for (const msg of messages) {
        const plaintext = Buffer.from(msg + ' - response');
        const encrypted = bobManager.encryptMessage('alice-peer-id', plaintext);
        const decrypted = aliceManager.decryptMessage('bob-peer-id', encrypted);
        expect(decrypted.toString()).toBe(msg + ' - response');
      }
    });

    it('should handle concurrent handshakes with multiple peers', async () => {
      const carolStatic = KeyManager.generateCurve25519KeyPair();
      const carolManager = new NoiseSessionManager(carolStatic);

      const messages: any[] = [];
      aliceManager.on('handshakeMessage', (msg) => messages.push({ from: 'alice', ...msg }));
      bobManager.on('handshakeMessage', (msg) => messages.push({ from: 'bob', ...msg }));
      carolManager.on('handshakeMessage', (msg) => messages.push({ from: 'carol', ...msg }));

      // Alice initiates with both Bob and Carol
      await aliceManager.initiateHandshake('bob-peer-id');
      await aliceManager.initiateHandshake('carol-peer-id');

      // Process handshakes concurrently
      const bobHandshake = async () => {
        const msg1 = messages.find(m => m.from === 'alice' && m.peerID === 'bob-peer-id' && m.type === MessageType.NOISE_HANDSHAKE_INIT);
        await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_HANDSHAKE_INIT, msg1.message);
        
        const msg2 = messages.find(m => m.from === 'bob' && m.type === MessageType.NOISE_HANDSHAKE_RESP);
        await aliceManager.processHandshakeMessage('bob-peer-id', MessageType.NOISE_HANDSHAKE_RESP, msg2.message);
        
        const msg3 = messages.find(m => m.from === 'alice' && m.peerID === 'bob-peer-id' && m.type === MessageType.NOISE_ENCRYPTED);
        await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_ENCRYPTED, msg3.message);
      };

      const carolHandshake = async () => {
        const msg1 = messages.find(m => m.from === 'alice' && m.peerID === 'carol-peer-id' && m.type === MessageType.NOISE_HANDSHAKE_INIT);
        await carolManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_HANDSHAKE_INIT, msg1.message);
        
        const msg2 = messages.find(m => m.from === 'carol' && m.type === MessageType.NOISE_HANDSHAKE_RESP);
        await aliceManager.processHandshakeMessage('carol-peer-id', MessageType.NOISE_HANDSHAKE_RESP, msg2.message);
        
        const msg3 = messages.find(m => m.from === 'alice' && m.peerID === 'carol-peer-id' && m.type === MessageType.NOISE_ENCRYPTED);
        await carolManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_ENCRYPTED, msg3.message);
      };

      await Promise.all([bobHandshake(), carolHandshake()]);

      // Verify all sessions established
      expect(aliceManager.hasSession('bob-peer-id')).toBe(true);
      expect(aliceManager.hasSession('carol-peer-id')).toBe(true);
      expect(bobManager.hasSession('alice-peer-id')).toBe(true);
      expect(carolManager.hasSession('alice-peer-id')).toBe(true);

      // Test message encryption between different peers
      const msgToBob = Buffer.from('Hello Bob');
      const msgToCarol = Buffer.from('Hello Carol');

      const encryptedForBob = aliceManager.encryptMessage('bob-peer-id', msgToBob);
      const encryptedForCarol = aliceManager.encryptMessage('carol-peer-id', msgToCarol);

      expect(bobManager.decryptMessage('alice-peer-id', encryptedForBob)).toEqual(msgToBob);
      expect(carolManager.decryptMessage('alice-peer-id', encryptedForCarol)).toEqual(msgToCarol);

      // Ensure Bob can't decrypt Carol's message
      expect(() => {
        bobManager.decryptMessage('alice-peer-id', encryptedForCarol);
      }).toThrow();

      carolManager.destroy();
    });
  });

  describe('Session Properties', () => {
    it('should generate and verify fingerprints', async () => {
      // Get local fingerprints
      const aliceFingerprint = aliceManager.getLocalFingerprint();
      const bobFingerprint = bobManager.getLocalFingerprint();

      expect(aliceFingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
      expect(bobFingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
      expect(aliceFingerprint).not.toBe(bobFingerprint);

      // Perform handshake
      const messages: any[] = [];
      aliceManager.on('handshakeMessage', (msg) => messages.push({ from: 'alice', ...msg }));
      bobManager.on('handshakeMessage', (msg) => messages.push({ from: 'bob', ...msg }));

      await aliceManager.initiateHandshake('bob-peer-id');
      const msg1 = messages.find(m => m.from === 'alice' && m.type === MessageType.NOISE_HANDSHAKE_INIT);
      
      await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_HANDSHAKE_INIT, msg1.message);
      const msg2 = messages.find(m => m.from === 'bob' && m.type === MessageType.NOISE_HANDSHAKE_RESP);
      
      await aliceManager.processHandshakeMessage('bob-peer-id', MessageType.NOISE_HANDSHAKE_RESP, msg2.message);
      const msg3 = messages.find(m => m.from === 'alice' && m.type === MessageType.NOISE_ENCRYPTED);
      
      await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_ENCRYPTED, msg3.message);

      // Verify peer fingerprints
      expect(aliceManager.getPeerFingerprint('bob-peer-id')).toBe(bobFingerprint);
      expect(bobManager.getPeerFingerprint('alice-peer-id')).toBe(aliceFingerprint);
    });

    it('should track session activity', async () => {
      // Perform handshake
      const messages: any[] = [];
      aliceManager.on('handshakeMessage', (msg) => messages.push({ from: 'alice', ...msg }));
      bobManager.on('handshakeMessage', (msg) => messages.push({ from: 'bob', ...msg }));

      await aliceManager.initiateHandshake('bob-peer-id');
      const msg1 = messages.find(m => m.from === 'alice' && m.type === MessageType.NOISE_HANDSHAKE_INIT);
      
      await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_HANDSHAKE_INIT, msg1.message);
      const msg2 = messages.find(m => m.from === 'bob' && m.type === MessageType.NOISE_HANDSHAKE_RESP);
      
      await aliceManager.processHandshakeMessage('bob-peer-id', MessageType.NOISE_HANDSHAKE_RESP, msg2.message);
      const msg3 = messages.find(m => m.from === 'alice' && m.type === MessageType.NOISE_ENCRYPTED);
      
      await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_ENCRYPTED, msg3.message);

      // Get session info
      const aliceSession = aliceManager.getSession('bob-peer-id');
      expect(aliceSession).toBeDefined();
      expect(aliceSession!.handshakeState).toBe('completed');

      const lastActivity1 = aliceSession!.lastActivity;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send a message to update activity
      const plaintext = Buffer.from('Test message');
      aliceManager.encryptMessage('bob-peer-id', plaintext);

      const lastActivity2 = aliceManager.getSession('bob-peer-id')!.lastActivity;
      expect(lastActivity2.getTime()).toBeGreaterThan(lastActivity1.getTime());
    });
  });

  describe('Error Handling', () => {
    it('should throw when trying to encrypt without session', () => {
      expect(() => {
        aliceManager.encryptMessage('unknown-peer', Buffer.from('test'));
      }).toThrow('No established session with peer');
    });

    it('should throw when trying to decrypt without session', () => {
      expect(() => {
        aliceManager.decryptMessage('unknown-peer', Buffer.from('test'));
      }).toThrow('No established session with peer');
    });

    it('should handle handshake timeout', (done) => {
      const manager = new NoiseSessionManager(aliceStatic);
      // Set very short timeout for testing
      (manager as any).handshakeTimeout = 100;

      manager.on('handshakeFailed', (event) => {
        expect(event.reason).toContain('timeout');
        manager.destroy();
        done();
      });

      manager.initiateHandshake('timeout-peer');
    });

    it('should handle duplicate handshake initiation', async () => {
      await aliceManager.initiateHandshake('bob-peer-id');
      
      await expect(aliceManager.initiateHandshake('bob-peer-id'))
        .rejects.toThrow('Handshake already in progress');
    });

    it('should close sessions properly', async () => {
      // Establish a session first
      const messages: any[] = [];
      aliceManager.on('handshakeMessage', (msg) => messages.push({ from: 'alice', ...msg }));
      bobManager.on('handshakeMessage', (msg) => messages.push({ from: 'bob', ...msg }));

      await aliceManager.initiateHandshake('bob-peer-id');
      const msg1 = messages.find(m => m.from === 'alice' && m.type === MessageType.NOISE_HANDSHAKE_INIT);
      
      await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_HANDSHAKE_INIT, msg1.message);
      const msg2 = messages.find(m => m.from === 'bob' && m.type === MessageType.NOISE_HANDSHAKE_RESP);
      
      await aliceManager.processHandshakeMessage('bob-peer-id', MessageType.NOISE_HANDSHAKE_RESP, msg2.message);
      const msg3 = messages.find(m => m.from === 'alice' && m.type === MessageType.NOISE_ENCRYPTED);
      
      await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_ENCRYPTED, msg3.message);

      // Verify session exists
      expect(aliceManager.hasSession('bob-peer-id')).toBe(true);

      // Close session
      let sessionClosed = false;
      aliceManager.on('sessionClosed', (event) => {
        expect(event.peerID).toBe('bob-peer-id');
        sessionClosed = true;
      });

      aliceManager.closeSession('bob-peer-id');

      // Verify session is gone
      expect(aliceManager.hasSession('bob-peer-id')).toBe(false);
      expect(sessionClosed).toBe(true);

      // Should not be able to encrypt anymore
      expect(() => {
        aliceManager.encryptMessage('bob-peer-id', Buffer.from('test'));
      }).toThrow('No established session with peer');
    });
  });

  describe('Session Persistence', () => {
    it('should return all active sessions', async () => {
      // Initially no sessions
      expect(aliceManager.getAllSessions().size).toBe(0);

      // Establish sessions with multiple peers
      const bobMessages: any[] = [];
      const carolStatic = KeyManager.generateCurve25519KeyPair();
      const carolManager = new NoiseSessionManager(carolStatic);
      const carolMessages: any[] = [];

      aliceManager.on('handshakeMessage', (msg) => {
        if (msg.peerID === 'bob-peer-id') bobMessages.push(msg);
        else if (msg.peerID === 'carol-peer-id') carolMessages.push(msg);
      });

      bobManager.on('handshakeMessage', (msg) => bobMessages.push(msg));
      carolManager.on('handshakeMessage', (msg) => carolMessages.push(msg));

      // Handshake with Bob
      await aliceManager.initiateHandshake('bob-peer-id');
      await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_HANDSHAKE_INIT, bobMessages[0].message);
      await aliceManager.processHandshakeMessage('bob-peer-id', MessageType.NOISE_HANDSHAKE_RESP, bobMessages[1].message);
      await bobManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_ENCRYPTED, bobMessages[2].message);

      // Handshake with Carol
      await aliceManager.initiateHandshake('carol-peer-id');
      await carolManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_HANDSHAKE_INIT, carolMessages[0].message);
      await aliceManager.processHandshakeMessage('carol-peer-id', MessageType.NOISE_HANDSHAKE_RESP, carolMessages[1].message);
      await carolManager.processHandshakeMessage('alice-peer-id', MessageType.NOISE_ENCRYPTED, carolMessages[2].message);

      // Check all sessions
      const sessions = aliceManager.getAllSessions();
      expect(sessions.size).toBe(2);
      expect(sessions.has('bob-peer-id')).toBe(true);
      expect(sessions.has('carol-peer-id')).toBe(true);

      carolManager.destroy();
    });
  });
});