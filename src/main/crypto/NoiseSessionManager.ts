import { EventEmitter } from 'events';
import { NoiseProtocol, NoiseSession, HandshakeRole, HandshakeState } from './NoiseProtocol';
import { KeyManager } from './KeyManager';
import { KeyPair, NoiseSession as NoiseSessionType } from '../../shared/types';
import { MessageType } from '../../shared/constants';

export interface SessionInfo {
  peerID: string;
  session: NoiseSession;
  createdAt: Date;
  lastActivity: Date;
  handshakeState: 'none' | 'initiated' | 'completed';
  fingerprint: string;
}

export interface HandshakeInfo {
  peerID: string;
  state: HandshakeState;
  createdAt: Date;
  timeoutTimer?: NodeJS.Timeout;
}

export class NoiseSessionManager extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private pendingHandshakes: Map<string, HandshakeInfo> = new Map();
  private localStatic: KeyPair;
  private handshakeTimeout: number = 30000; // 30 seconds
  private sessionTimeout: number = 3600000; // 1 hour
  private cleanupTimer?: NodeJS.Timeout;

  constructor(localStatic: KeyPair) {
    super();
    this.localStatic = localStatic;
    
    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Gets or creates a session with a peer
   */
  async getOrCreateSession(peerID: string): Promise<SessionInfo | null> {
    // Check if we already have a session
    const existing = this.sessions.get(peerID);
    if (existing && existing.handshakeState === 'completed') {
      existing.lastActivity = new Date();
      return existing;
    }

    // Check if handshake is in progress
    if (this.pendingHandshakes.has(peerID)) {
      return null; // Handshake in progress
    }

    // Start new handshake as initiator
    await this.initiateHandshake(peerID);
    return null;
  }

  /**
   * Initiates a Noise handshake with a peer
   */
  async initiateHandshake(peerID: string): Promise<void> {
    if (this.pendingHandshakes.has(peerID)) {
      throw new Error('Handshake already in progress');
    }

    const state = NoiseProtocol.createHandshakeState(
      HandshakeRole.INITIATOR,
      this.localStatic
    );

    const handshakeInfo: HandshakeInfo = {
      peerID,
      state,
      createdAt: new Date()
    };

    // Set timeout
    handshakeInfo.timeoutTimer = setTimeout(() => {
      this.cancelHandshake(peerID, 'Handshake timeout');
    }, this.handshakeTimeout);

    this.pendingHandshakes.set(peerID, handshakeInfo);

    // Generate first message
    try {
      const message = NoiseProtocol.writeMessage(state);
      this.emit('handshakeMessage', {
        peerID,
        type: MessageType.NOISE_HANDSHAKE_INIT,
        message
      });
    } catch (error) {
      this.cancelHandshake(peerID, `Handshake initiation failed: ${error}`);
      throw error;
    }
  }

  /**
   * Processes an incoming handshake message
   */
  async processHandshakeMessage(
    peerID: string,
    messageType: number,
    message: Buffer
  ): Promise<void> {
    let handshakeInfo = this.pendingHandshakes.get(peerID);

    if (!handshakeInfo && messageType === MessageType.NOISE_HANDSHAKE_INIT) {
      // New handshake from peer, we're the responder
      const state = NoiseProtocol.createHandshakeState(
        HandshakeRole.RESPONDER,
        this.localStatic
      );

      handshakeInfo = {
        peerID,
        state,
        createdAt: new Date()
      };

      handshakeInfo.timeoutTimer = setTimeout(() => {
        this.cancelHandshake(peerID, 'Handshake timeout');
      }, this.handshakeTimeout);

      this.pendingHandshakes.set(peerID, handshakeInfo);
    }

    if (!handshakeInfo) {
      throw new Error('No handshake in progress');
    }

    try {
      const result = NoiseProtocol.readMessage(handshakeInfo.state, message);

      if (result.session) {
        // Handshake complete
        this.completeHandshake(peerID, result.session);
      } else {
        // Need to send next message
        // For XX pattern:
        // Initiator sends: INIT (message 0), ENCRYPTED (message 2)
        // Responder sends: RESP (message 1)
        const nextMessageType = handshakeInfo.state.role === HandshakeRole.INITIATOR ?
          MessageType.NOISE_ENCRYPTED :
          MessageType.NOISE_HANDSHAKE_RESP;

        const nextMessage = NoiseProtocol.writeMessage(handshakeInfo.state);
        
        this.emit('handshakeMessage', {
          peerID,
          type: nextMessageType,
          message: nextMessage
        });

        // Check if we're now complete (for initiator)
        if (handshakeInfo.state.isComplete) {
          const [c1, c2] = handshakeInfo.state.symmetricState.split();
          const session: NoiseSession = {
            sendCipher: c1,
            receiveCipher: c2,
            handshakeHash: handshakeInfo.state.symmetricState.getHandshakeHash(),
            remoteStaticPublicKey: handshakeInfo.state.remoteStatic!
          };
          this.completeHandshake(peerID, session);
        }
      }
    } catch (error) {
      this.cancelHandshake(peerID, `Handshake processing failed: ${error}`);
      throw error;
    }
  }

  /**
   * Completes a handshake and creates a session
   */
  private completeHandshake(peerID: string, session: NoiseSession): void {
    const handshakeInfo = this.pendingHandshakes.get(peerID);
    if (!handshakeInfo) {
      return;
    }

    // Clear timeout
    if (handshakeInfo.timeoutTimer) {
      clearTimeout(handshakeInfo.timeoutTimer);
    }

    // Clear handshake state
    NoiseProtocol.clearHandshakeState(handshakeInfo.state);
    this.pendingHandshakes.delete(peerID);

    // Create session
    const fingerprint = NoiseProtocol.getRemoteFingerprint(session);
    const sessionInfo: SessionInfo = {
      peerID,
      session,
      createdAt: new Date(),
      lastActivity: new Date(),
      handshakeState: 'completed',
      fingerprint
    };

    this.sessions.set(peerID, sessionInfo);

    // Emit event
    this.emit('sessionEstablished', {
      peerID,
      fingerprint,
      isInitiator: handshakeInfo.state.role === HandshakeRole.INITIATOR
    });

    // Send identity announce
    this.emit('identityAnnounce', { peerID });
  }

  /**
   * Cancels a handshake
   */
  private cancelHandshake(peerID: string, reason: string): void {
    const handshakeInfo = this.pendingHandshakes.get(peerID);
    if (!handshakeInfo) {
      return;
    }

    // Clear timeout
    if (handshakeInfo.timeoutTimer) {
      clearTimeout(handshakeInfo.timeoutTimer);
    }

    // Clear handshake state
    NoiseProtocol.clearHandshakeState(handshakeInfo.state);
    this.pendingHandshakes.delete(peerID);

    // Emit event
    this.emit('handshakeFailed', { peerID, reason });
  }

  /**
   * Encrypts a message for a peer
   */
  encryptMessage(peerID: string, plaintext: Buffer): Buffer {
    const sessionInfo = this.sessions.get(peerID);
    if (!sessionInfo || sessionInfo.handshakeState !== 'completed') {
      throw new Error('No established session with peer');
    }

    sessionInfo.lastActivity = new Date();
    return NoiseProtocol.encryptMessage(sessionInfo.session, plaintext);
  }

  /**
   * Decrypts a message from a peer
   */
  decryptMessage(peerID: string, ciphertext: Buffer): Buffer {
    const sessionInfo = this.sessions.get(peerID);
    if (!sessionInfo || sessionInfo.handshakeState !== 'completed') {
      throw new Error('No established session with peer');
    }

    sessionInfo.lastActivity = new Date();
    return NoiseProtocol.decryptMessage(sessionInfo.session, ciphertext);
  }

  /**
   * Gets session information for a peer
   */
  getSession(peerID: string): SessionInfo | undefined {
    return this.sessions.get(peerID);
  }

  /**
   * Gets all active sessions
   */
  getAllSessions(): Map<string, SessionInfo> {
    return new Map(this.sessions);
  }

  /**
   * Checks if we have an established session with a peer
   */
  hasSession(peerID: string): boolean {
    const session = this.sessions.get(peerID);
    return session !== undefined && session.handshakeState === 'completed';
  }

  /**
   * Gets the fingerprint for a peer
   */
  getPeerFingerprint(peerID: string): string | null {
    const session = this.sessions.get(peerID);
    return session ? session.fingerprint : null;
  }

  /**
   * Gets our own fingerprint
   */
  getLocalFingerprint(): string {
    return KeyManager.generateFingerprint(this.localStatic.publicKey);
  }

  /**
   * Closes a session with a peer
   */
  closeSession(peerID: string): void {
    const sessionInfo = this.sessions.get(peerID);
    if (sessionInfo) {
      NoiseProtocol.clearSession(sessionInfo.session);
      this.sessions.delete(peerID);
      this.emit('sessionClosed', { peerID });
    }

    // Also cancel any pending handshake
    this.cancelHandshake(peerID, 'Session closed');
  }

  /**
   * Cleans up expired sessions and handshakes
   */
  private cleanup(): void {
    const now = Date.now();

    // Clean up expired sessions
    for (const [peerID, sessionInfo] of this.sessions) {
      const lastActivity = sessionInfo.lastActivity.getTime();
      if (now - lastActivity > this.sessionTimeout) {
        this.closeSession(peerID);
      }
    }

    // Clean up stale handshakes
    for (const [peerID, handshakeInfo] of this.pendingHandshakes) {
      const created = handshakeInfo.createdAt.getTime();
      if (now - created > this.handshakeTimeout) {
        this.cancelHandshake(peerID, 'Handshake expired');
      }
    }
  }

  /**
   * Starts the cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 60000); // Run every minute
  }

  /**
   * Converts to interface type for IPC
   */
  sessionToInterface(sessionInfo: SessionInfo): NoiseSessionType {
    return {
      peerID: sessionInfo.peerID,
      handshakeState: sessionInfo.handshakeState,
      sendCipher: null as any, // Don't expose cipher internals
      receiveCipher: null as any,
      createdAt: sessionInfo.createdAt,
      lastActivity: sessionInfo.lastActivity
    };
  }

  /**
   * Clears all sessions and sensitive data
   */
  destroy(): void {
    // Clear cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Clear all sessions
    for (const [peerID] of this.sessions) {
      this.closeSession(peerID);
    }

    // Clear all handshakes
    for (const [peerID] of this.pendingHandshakes) {
      this.cancelHandshake(peerID, 'Manager destroyed');
    }

    // Clear local keys
    this.localStatic.privateKey.fill(0);
  }
}