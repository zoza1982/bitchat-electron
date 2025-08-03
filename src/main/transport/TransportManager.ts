import { EventEmitter } from 'events';
import { BLETransport, BLEConnection } from './ble/BLETransport';
import { BinaryProtocol } from '../protocols/BinaryProtocol';
import { BitchatProtocol } from '../protocols/BitchatProtocol';
import { FragmentManager } from '../protocols/FragmentManager';
import { NoiseSessionManager } from '../crypto/NoiseSessionManager';
import { BitchatPacket } from '../../shared/types';
import { MessageType } from '../../shared/constants';

export interface TransportOptions {
  deviceName?: string;
  sessionManager: NoiseSessionManager;
}

interface PeerConnection {
  transport: 'ble' | 'nostr';
  connection: BLEConnection | any; // Will add Nostr connection type later
  fragmentManager: FragmentManager;
}

export class TransportManager extends EventEmitter {
  private bleTransport: BLETransport | null = null;
  private binaryProtocol: BinaryProtocol;
  private bitchatProtocol: BitchatProtocol;
  private sessionManager: NoiseSessionManager;
  private peers: Map<string, PeerConnection> = new Map();
  private deviceName: string;

  constructor(options: TransportOptions) {
    super();
    this.deviceName = options.deviceName || 'BitChat';
    this.sessionManager = options.sessionManager;
    this.binaryProtocol = new BinaryProtocol();
    this.bitchatProtocol = new BitchatProtocol();
  }

  /**
   * Initialize all transports
   */
  async initialize(): Promise<void> {
    // Initialize BLE transport
    await this.initializeBLE();
    
    // TODO: Initialize Nostr transport
  }

  /**
   * Initialize BLE transport
   */
  private async initializeBLE(): Promise<void> {
    try {
      this.bleTransport = new BLETransport({
        deviceName: this.deviceName,
        binaryProtocol: this.binaryProtocol
      });

      // Set up event handlers
      this.bleTransport.on('ready', () => {
        console.log('BLE transport ready');
        this.emit('transport:ready', 'ble');
      });

      this.bleTransport.on('connect', (connection: BLEConnection) => {
        console.log('BLE peer connected:', connection.address);
        
        // Create peer connection entry
        const peerId = connection.address; // Use BLE address as peer ID for now
        this.peers.set(peerId, {
          transport: 'ble',
          connection,
          fragmentManager: new FragmentManager()
        });

        this.emit('peer:connected', {
          id: peerId,
          transport: 'ble',
          address: connection.address
        });
      });

      this.bleTransport.on('disconnect', (address: string) => {
        console.log('BLE peer disconnected:', address);
        
        // Find and remove peer
        for (const [peerId, peer] of this.peers) {
          if (peer.transport === 'ble' && peer.connection.address === address) {
            this.peers.delete(peerId);
            this.emit('peer:disconnected', peerId);
            break;
          }
        }
      });

      this.bleTransport.on('rawData', (data: Buffer) => {
        this.handleIncomingData('ble', data);
      });

      this.bleTransport.on('error', (error: Error) => {
        console.error('BLE transport error:', error);
        this.emit('transport:error', { transport: 'ble', error });
      });

      // Start BLE transport
      await this.bleTransport.start();
    } catch (error) {
      console.error('Failed to initialize BLE transport:', error);
      this.emit('transport:error', { transport: 'ble', error });
    }
  }

  /**
   * Handle incoming data from any transport
   */
  private async handleIncomingData(transport: 'ble' | 'nostr', data: Buffer): Promise<void> {
    try {
      // Try to decode as complete packet
      let packet: BitchatPacket;
      
      try {
        packet = this.binaryProtocol.decode(data);
      } catch (error) {
        // Might be a fragment, handle accordingly
        console.debug('Failed to decode packet, checking if fragment');
        
        // Find peer by transport
        let peerId: string | undefined;
        for (const [id, peer] of this.peers) {
          if (peer.transport === transport) {
            peerId = id;
            break;
          }
        }

        if (!peerId) {
          console.error('Received data from unknown peer');
          return;
        }

        const peer = this.peers.get(peerId);
        if (!peer) return;

        // Try to handle as fragment
        const completeData = peer.fragmentManager.addFragment(data);
        if (!completeData) {
          // Still collecting fragments
          return;
        }

        // Try to decode complete packet
        packet = this.binaryProtocol.decode(completeData);
      }

      // Handle packet based on type
      await this.handlePacket(packet, transport);
    } catch (error) {
      console.error('Error handling incoming data:', error);
      this.emit('error', error);
    }
  }

  /**
   * Handle decoded packet
   */
  private async handlePacket(packet: BitchatPacket, transport: 'ble' | 'nostr'): Promise<void> {
    const senderId = packet.senderID.toString('hex');

    // Special handling for Noise handshake messages
    if (packet.messageType === MessageType.NOISE_HANDSHAKE_INIT ||
        packet.messageType === MessageType.NOISE_HANDSHAKE_RESP ||
        packet.messageType === MessageType.NOISE_ENCRYPTED) {
      
      try {
        await this.sessionManager.processHandshakeMessage(
          senderId,
          packet.messageType,
          packet.payload
        );
      } catch (error) {
        console.error('Handshake processing error:', error);
      }
      return;
    }

    // For other message types, check if we have an encrypted session
    const session = this.sessionManager.getSession(senderId);
    let decryptedPayload = packet.payload;

    if (session && session.handshakeState === 'completed') {
      try {
        decryptedPayload = this.sessionManager.decryptMessage(senderId, packet.payload);
      } catch (error) {
        console.error('Decryption error:', error);
        return;
      }
    }

    // Emit packet for application layer
    this.emit('packet', {
      ...packet,
      payload: decryptedPayload,
      transport,
      isEncrypted: !!session
    });
  }

  /**
   * Send packet to a peer
   */
  async sendPacket(
    recipientId: string,
    messageType: number,
    payload: Buffer,
    ttl: number = 7
  ): Promise<boolean> {
    const peer = this.peers.get(recipientId);
    if (!peer) {
      console.error('Peer not found:', recipientId);
      return false;
    }

    try {
      // Check if we need to encrypt
      const session = this.sessionManager.getSession(recipientId);
      let finalPayload = payload;

      if (session && session.handshakeState === 'completed' && 
          messageType !== MessageType.NOISE_HANDSHAKE_INIT &&
          messageType !== MessageType.NOISE_HANDSHAKE_RESP) {
        finalPayload = this.sessionManager.encryptMessage(recipientId, payload);
      }

      // Create packet
      const packet = this.bitchatProtocol.createPacket(
        messageType,
        finalPayload,
        Buffer.from(recipientId, 'hex'),
        ttl
      );

      // Encode packet
      const encodedData = this.binaryProtocol.encode(packet);

      // Send based on transport
      if (peer.transport === 'ble' && this.bleTransport) {
        return await this.bleTransport.sendData(encodedData);
      }

      // TODO: Add Nostr transport sending

      return false;
    } catch (error) {
      console.error('Error sending packet:', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Broadcast packet to all peers
   */
  async broadcastPacket(
    messageType: number,
    payload: Buffer,
    ttl: number = 7
  ): Promise<void> {
    // Create broadcast packet
    const packet = this.bitchatProtocol.createPacket(
      messageType,
      payload,
      undefined, // No recipient for broadcast
      ttl
    );

    const encodedData = this.binaryProtocol.encode(packet);

    // Send to all connected peers
    for (const [peerId, peer] of this.peers) {
      try {
        if (peer.transport === 'ble' && this.bleTransport) {
          await this.bleTransport.sendData(encodedData);
        }
        // TODO: Add Nostr broadcast
      } catch (error) {
        console.error(`Error broadcasting to peer ${peerId}:`, error);
      }
    }
  }

  /**
   * Get transport status
   */
  getStatus(): {
    ble: any;
    nostr: any;
    peers: Array<{
      id: string;
      transport: string;
      connected: boolean;
    }>;
  } {
    const bleStatus = this.bleTransport?.getConnectionStatus() || {
      isEnabled: false,
      isAdvertising: false,
      isConnected: false,
      connection: null
    };

    const peers = Array.from(this.peers.entries()).map(([id, peer]) => ({
      id,
      transport: peer.transport,
      connected: true
    }));

    return {
      ble: bleStatus,
      nostr: { isEnabled: false }, // TODO: Add Nostr status
      peers
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.bleTransport) {
      this.bleTransport.destroy();
    }
    this.peers.clear();
    this.removeAllListeners();
  }
}