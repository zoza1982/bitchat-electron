import { KeyManager } from './KeyManager';
import { CipherState, SymmetricState } from './CipherState';
import { KeyPair } from '../../shared/types';

/**
 * Noise Protocol Framework implementation
 * Pattern: Noise_XX_25519_ChaChaPoly_SHA256
 * 
 * XX Pattern (mutual authentication):
 * -> e
 * <- e, ee, s, es
 * -> s, se
 */

export enum HandshakeRole {
  INITIATOR = 'initiator',
  RESPONDER = 'responder'
}

export enum HandshakeMessageType {
  HANDSHAKE_INIT = 0,
  HANDSHAKE_RESP = 1,
  HANDSHAKE_COMPLETE = 2
}

export interface HandshakeState {
  symmetricState: SymmetricState;
  localStatic: KeyPair;
  localEphemeral: KeyPair | null;
  remoteStatic: Buffer | null;
  remoteEphemeral: Buffer | null;
  role: HandshakeRole;
  messagePatterns: string[][];
  messageIndex: number;
  isComplete: boolean;
}

export interface NoiseSession {
  sendCipher: CipherState;
  receiveCipher: CipherState;
  handshakeHash: Buffer;
  remoteStaticPublicKey: Buffer;
}

export class NoiseProtocol {
  private static readonly PROTOCOL_NAME = 'Noise_XX_25519_ChaChaPoly_SHA256';
  
  // XX pattern message sequences
  private static readonly XX_PATTERN = [
    ['e'],                    // -> e
    ['e', 'ee', 's', 'es'],  // <- e, ee, s, es
    ['s', 'se']               // -> s, se
  ];

  /**
   * Creates a new handshake state
   */
  static createHandshakeState(
    role: HandshakeRole,
    localStatic: KeyPair,
    remoteStatic?: Buffer
  ): HandshakeState {
    const symmetricState = new SymmetricState(this.PROTOCOL_NAME);
    
    return {
      symmetricState,
      localStatic,
      localEphemeral: null,
      remoteStatic: remoteStatic || null,
      remoteEphemeral: null,
      role,
      messagePatterns: this.XX_PATTERN,
      messageIndex: 0,
      isComplete: false
    };
  }

  /**
   * Writes a handshake message
   */
  static writeMessage(
    state: HandshakeState,
    payload: Buffer = Buffer.alloc(0)
  ): Buffer {
    if (state.isComplete) {
      throw new Error('Handshake already complete');
    }

    const messageBuffer: Buffer[] = [];
    const isInitiator = state.role === HandshakeRole.INITIATOR;
    // For XX pattern:
    // Initiator writes messages 0 and 2
    // Responder writes message 1
    let patternIndex: number;
    if (isInitiator) {
      // Initiator writes message 0, then message 2
      patternIndex = state.messageIndex === 0 ? 0 : 2;
    } else {
      // Responder writes message 1
      patternIndex = 1;
    }

    if (patternIndex >= state.messagePatterns.length) {
      throw new Error('No more messages in handshake pattern');
    }

    const pattern = state.messagePatterns[patternIndex];

    for (const token of pattern) {
      switch (token) {
        case 'e':
          // Generate and send ephemeral public key
          state.localEphemeral = KeyManager.generateEphemeralKeyPair();
          messageBuffer.push(state.localEphemeral.publicKey);
          state.symmetricState.mixHash(state.localEphemeral.publicKey);
          break;

        case 's':
          // Encrypt and send static public key
          const encryptedStatic = state.symmetricState.encryptAndHash(
            state.localStatic.publicKey
          );
          messageBuffer.push(encryptedStatic);
          break;

        case 'ee':
          // Perform ee DH
          if (!state.localEphemeral || !state.remoteEphemeral) {
            throw new Error('Missing ephemeral keys for ee');
          }
          const eeShared = KeyManager.dh(
            state.localEphemeral.privateKey,
            state.remoteEphemeral
          );
          state.symmetricState.mixKey(eeShared);
          break;

        case 'es':
          // Perform es DH (initiator e, responder s)
          if (isInitiator) {
            if (!state.localEphemeral || !state.remoteStatic) {
              throw new Error('Missing keys for es');
            }
            const esShared = KeyManager.dh(
              state.localEphemeral.privateKey,
              state.remoteStatic
            );
            state.symmetricState.mixKey(esShared);
          } else {
            if (!state.remoteEphemeral) {
              throw new Error('Missing remote ephemeral for es');
            }
            const esShared = KeyManager.dh(
              state.localStatic.privateKey,
              state.remoteEphemeral
            );
            state.symmetricState.mixKey(esShared);
          }
          break;

        case 'se':
          // Perform se DH (initiator s, responder e)
          if (isInitiator) {
            if (!state.remoteEphemeral) {
              throw new Error('Missing remote ephemeral for se');
            }
            const seShared = KeyManager.dh(
              state.localStatic.privateKey,
              state.remoteEphemeral
            );
            state.symmetricState.mixKey(seShared);
          } else {
            if (!state.localEphemeral || !state.remoteStatic) {
              throw new Error('Missing keys for se');
            }
            const seShared = KeyManager.dh(
              state.localEphemeral.privateKey,
              state.remoteStatic
            );
            state.symmetricState.mixKey(seShared);
          }
          break;

        default:
          throw new Error(`Unknown token: ${token}`);
      }
    }

    // Encrypt payload
    const encryptedPayload = state.symmetricState.encryptAndHash(payload);
    messageBuffer.push(encryptedPayload);

    // Update message index
    state.messageIndex += 1;

    // Check if handshake is complete
    // For XX pattern: 3 messages total
    // Initiator completes after sending message 3 (index 2)
    // Responder completes after receiving message 3 (index 2)
    if (state.messageIndex >= 3) {
      state.isComplete = true;
    }

    return Buffer.concat(messageBuffer);
  }

  /**
   * Reads a handshake message
   */
  static readMessage(
    state: HandshakeState,
    message: Buffer
  ): { payload: Buffer; session?: NoiseSession } {
    if (state.isComplete) {
      throw new Error('Handshake already complete');
    }

    let offset = 0;
    const isInitiator = state.role === HandshakeRole.INITIATOR;
    // For XX pattern:
    // Initiator reads message 1
    // Responder reads messages 0 and 2
    let patternIndex: number;
    if (isInitiator) {
      // Initiator reads message 1
      patternIndex = 1;
    } else {
      // Responder reads message 0, then message 2
      patternIndex = state.messageIndex === 0 ? 0 : 2;
    }

    if (patternIndex >= state.messagePatterns.length) {
      throw new Error('No more messages in handshake pattern');
    }

    const pattern = state.messagePatterns[patternIndex];

    for (const token of pattern) {
      switch (token) {
        case 'e':
          // Read ephemeral public key
          if (message.length < offset + 32) {
            throw new Error('Message too short for ephemeral key');
          }
          state.remoteEphemeral = message.slice(offset, offset + 32);
          offset += 32;
          state.symmetricState.mixHash(state.remoteEphemeral);
          break;

        case 's':
          // Decrypt static public key
          const encryptedStaticLength = state.symmetricState.getCipherState().hasKey() ? 
            32 + 16 : 32; // 32 bytes key + 16 bytes auth tag if encrypted
          
          if (message.length < offset + encryptedStaticLength) {
            throw new Error('Message too short for static key');
          }
          
          const encryptedStatic = message.slice(offset, offset + encryptedStaticLength);
          offset += encryptedStaticLength;
          
          state.remoteStatic = state.symmetricState.decryptAndHash(encryptedStatic);
          break;

        case 'ee':
          // Perform ee DH
          if (!state.localEphemeral || !state.remoteEphemeral) {
            throw new Error('Missing ephemeral keys for ee');
          }
          const eeShared = KeyManager.dh(
            state.localEphemeral.privateKey,
            state.remoteEphemeral
          );
          state.symmetricState.mixKey(eeShared);
          break;

        case 'es':
          // Perform es DH
          if (isInitiator) {
            if (!state.localEphemeral || !state.remoteStatic) {
              throw new Error('Missing keys for es');
            }
            const esShared = KeyManager.dh(
              state.localEphemeral.privateKey,
              state.remoteStatic
            );
            state.symmetricState.mixKey(esShared);
          } else {
            if (!state.remoteEphemeral) {
              throw new Error('Missing remote ephemeral for es');
            }
            const esShared = KeyManager.dh(
              state.localStatic.privateKey,
              state.remoteEphemeral
            );
            state.symmetricState.mixKey(esShared);
          }
          break;

        case 'se':
          // Perform se DH
          if (isInitiator) {
            if (!state.remoteEphemeral) {
              throw new Error('Missing remote ephemeral for se');
            }
            const seShared = KeyManager.dh(
              state.localStatic.privateKey,
              state.remoteEphemeral
            );
            state.symmetricState.mixKey(seShared);
          } else {
            if (!state.localEphemeral || !state.remoteStatic) {
              throw new Error('Missing keys for se');
            }
            const seShared = KeyManager.dh(
              state.localEphemeral.privateKey,
              state.remoteStatic
            );
            state.symmetricState.mixKey(seShared);
          }
          break;

        default:
          throw new Error(`Unknown token: ${token}`);
      }
    }

    // Decrypt payload
    const encryptedPayload = message.slice(offset);
    const payload = state.symmetricState.decryptAndHash(encryptedPayload);

    // Update message index
    state.messageIndex += 1;

    // Check if handshake is complete
    // For XX pattern: 3 messages total
    // Both sides complete after all 3 messages are exchanged
    if (state.messageIndex >= 3) {
      state.isComplete = true;

      // Split the symmetric state into transport ciphers
      const [c1, c2] = state.symmetricState.split();
      
      const session: NoiseSession = {
        sendCipher: isInitiator ? c1 : c2,
        receiveCipher: isInitiator ? c2 : c1,
        handshakeHash: state.symmetricState.getHandshakeHash(),
        remoteStaticPublicKey: state.remoteStatic!
      };

      return { payload, session };
    }

    return { payload };
  }

  /**
   * Performs a complete handshake as initiator
   */
  static async performHandshakeAsInitiator(
    localStatic: KeyPair,
    sendMessage: (message: Buffer) => Promise<void>,
    receiveMessage: () => Promise<Buffer>
  ): Promise<NoiseSession> {
    const state = this.createHandshakeState(HandshakeRole.INITIATOR, localStatic);

    // Message 1: -> e
    const msg1 = this.writeMessage(state);
    await sendMessage(msg1);

    // Message 2: <- e, ee, s, es
    const msg2 = await receiveMessage();
    const { payload: payload2 } = this.readMessage(state, msg2);

    // Message 3: -> s, se
    const msg3 = this.writeMessage(state);
    await sendMessage(msg3);

    // Get the session
    const [c1, c2] = state.symmetricState.split();
    
    return {
      sendCipher: c1,
      receiveCipher: c2,
      handshakeHash: state.symmetricState.getHandshakeHash(),
      remoteStaticPublicKey: state.remoteStatic!
    };
  }

  /**
   * Performs a complete handshake as responder
   */
  static async performHandshakeAsResponder(
    localStatic: KeyPair,
    sendMessage: (message: Buffer) => Promise<void>,
    receiveMessage: () => Promise<Buffer>
  ): Promise<NoiseSession> {
    const state = this.createHandshakeState(HandshakeRole.RESPONDER, localStatic);

    // Message 1: -> e
    const msg1 = await receiveMessage();
    const { payload: payload1 } = this.readMessage(state, msg1);

    // Message 2: <- e, ee, s, es
    const msg2 = this.writeMessage(state);
    await sendMessage(msg2);

    // Message 3: -> s, se
    const msg3 = await receiveMessage();
    const { payload: payload3, session } = this.readMessage(state, msg3);

    return session!;
  }

  /**
   * Encrypts a message using an established session
   */
  static encryptMessage(session: NoiseSession, plaintext: Buffer): Buffer {
    return session.sendCipher.encryptWithAd(Buffer.alloc(0), plaintext);
  }

  /**
   * Decrypts a message using an established session
   */
  static decryptMessage(session: NoiseSession, ciphertext: Buffer): Buffer {
    return session.receiveCipher.decryptWithAd(Buffer.alloc(0), ciphertext);
  }

  /**
   * Gets the remote peer's fingerprint from a session
   */
  static getRemoteFingerprint(session: NoiseSession): string {
    return KeyManager.generateFingerprint(session.remoteStaticPublicKey);
  }

  /**
   * Clears sensitive data from a handshake state
   */
  static clearHandshakeState(state: HandshakeState): void {
    state.symmetricState.clear();
    if (state.localEphemeral) {
      state.localEphemeral.privateKey.fill(0);
    }
  }

  /**
   * Clears sensitive data from a session
   */
  static clearSession(session: NoiseSession): void {
    session.sendCipher.clear();
    session.receiveCipher.clear();
    session.handshakeHash.fill(0);
  }
}