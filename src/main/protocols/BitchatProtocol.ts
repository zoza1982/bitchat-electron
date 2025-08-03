import { randomBytes } from 'crypto';
import { BitchatPacket, BitchatMessage, Peer } from '../../shared/types';
import { 
  MessageType, 
  PROTOCOL_VERSION, 
  MAX_TTL, 
  BROADCAST_ID,
  STANDARD_BLOCK_SIZES 
} from '../../shared/constants';
import { BinaryProtocol } from './BinaryProtocol';

/**
 * BitchatProtocol manages the high-level protocol operations
 * including message creation, routing, and validation.
 */
export class BitchatProtocol {
  private readonly peerID: Buffer;
  private messageCache: Set<string>;
  private fragmentCache: Map<string, any[]>;

  constructor(peerID: Buffer) {
    this.peerID = peerID;
    this.messageCache = new Set();
    this.fragmentCache = new Map();
  }

  /**
   * Creates a chat message packet
   */
  createMessagePacket(
    message: BitchatMessage,
    recipientID?: Buffer,
    privateKey?: Buffer
  ): BitchatPacket {
    // Encode message to binary format
    const messageBuffer = this.encodeMessage(message);
    
    // Apply padding for traffic analysis resistance
    const paddedPayload = this.applyPadding(messageBuffer);

    const packet: BitchatPacket = {
      version: PROTOCOL_VERSION,
      type: MessageType.MESSAGE,
      ttl: MAX_TTL,
      timestamp: Date.now(),
      flags: 0,
      senderID: this.peerID,
      recipientID,
      payload: paddedPayload,
      isCompressed: false
    };

    // Sign packet if private key provided
    if (privateKey) {
      packet.signature = this.signPacket(packet, privateKey);
    }

    return packet;
  }

  /**
   * Creates an announce packet for peer discovery
   */
  createAnnouncePacket(nickname: string, publicKey: Buffer): BitchatPacket {
    const payload = Buffer.concat([
      Buffer.from([nickname.length]),
      Buffer.from(nickname, 'utf8'),
      publicKey
    ]);

    return {
      version: PROTOCOL_VERSION,
      type: MessageType.ANNOUNCE,
      ttl: MAX_TTL,
      timestamp: Date.now(),
      flags: 0,
      senderID: this.peerID,
      recipientID: BROADCAST_ID,
      payload,
      isCompressed: false
    };
  }

  /**
   * Creates a leave packet when disconnecting
   */
  createLeavePacket(): BitchatPacket {
    return {
      version: PROTOCOL_VERSION,
      type: MessageType.LEAVE,
      ttl: MAX_TTL,
      timestamp: Date.now(),
      flags: 0,
      senderID: this.peerID,
      recipientID: BROADCAST_ID,
      payload: Buffer.alloc(0),
      isCompressed: false
    };
  }

  /**
   * Validates an incoming packet
   */
  validatePacket(packet: BitchatPacket): boolean {
    // Check protocol version
    if (packet.version !== PROTOCOL_VERSION) {
      return false;
    }

    // Check TTL
    if (packet.ttl < 0 || packet.ttl > MAX_TTL) {
      return false;
    }

    // Check timestamp (allow 5 minute clock skew)
    const now = Date.now();
    const skew = 5 * 60 * 1000;
    if (packet.timestamp > now + skew || packet.timestamp < now - skew) {
      return false;
    }

    // Check if we've seen this packet before (duplicate detection)
    const packetId = this.getPacketId(packet);
    if (this.messageCache.has(packetId)) {
      return false;
    }

    // Validate signature if present
    if (packet.signature && !this.verifySignature(packet)) {
      return false;
    }

    return true;
  }

  /**
   * Processes an incoming packet
   */
  async processPacket(packet: BitchatPacket, fromPeer: string): Promise<void> {
    if (!this.validatePacket(packet)) {
      return;
    }

    // Add to message cache for duplicate detection
    const packetId = this.getPacketId(packet);
    this.messageCache.add(packetId);

    // Clean old cache entries periodically
    if (this.messageCache.size > 10000) {
      this.cleanMessageCache();
    }

    // Handle based on message type
    switch (packet.type) {
      case MessageType.MESSAGE:
        await this.handleMessage(packet, fromPeer);
        break;
      
      case MessageType.ANNOUNCE:
        await this.handleAnnounce(packet, fromPeer);
        break;
      
      case MessageType.LEAVE:
        await this.handleLeave(packet, fromPeer);
        break;
      
      case MessageType.FRAGMENT_START:
      case MessageType.FRAGMENT_CONTINUE:
      case MessageType.FRAGMENT_END:
        await this.handleFragment(packet, fromPeer);
        break;
      
      case MessageType.DELIVERY_ACK:
        await this.handleDeliveryAck(packet, fromPeer);
        break;
      
      // Handle other message types...
    }

    // Relay packet if TTL > 0 and not for us
    if (packet.ttl > 0 && !this.isPacketForUs(packet)) {
      await this.relayPacket(packet, fromPeer);
    }
  }

  /**
   * Encodes a BitchatMessage to binary format
   */
  private encodeMessage(message: BitchatMessage): Buffer {
    const buffers: Buffer[] = [];
    
    // Flags byte
    let flags = 0;
    if (message.isRelay) flags |= 0x01;
    if (message.isPrivate) flags |= 0x02;
    if (message.originalSender) flags |= 0x04;
    if (message.recipientNickname) flags |= 0x08;
    if (message.senderPeerID) flags |= 0x10;
    if (message.mentions && message.mentions.length > 0) flags |= 0x20;
    
    buffers.push(Buffer.from([flags]));
    
    // Timestamp
    const timestampBuffer = Buffer.alloc(8);
    timestampBuffer.writeBigUInt64BE(BigInt(message.timestamp.getTime()));
    buffers.push(timestampBuffer);
    
    // Message ID
    const idBytes = Buffer.from(message.id, 'utf8');
    buffers.push(Buffer.from([idBytes.length]));
    buffers.push(idBytes);
    
    // Sender
    const senderBytes = Buffer.from(message.sender, 'utf8');
    buffers.push(Buffer.from([senderBytes.length]));
    buffers.push(senderBytes);
    
    // Content
    const contentBytes = Buffer.from(message.content, 'utf8');
    const contentLengthBuffer = Buffer.alloc(2);
    contentLengthBuffer.writeUInt16BE(contentBytes.length);
    buffers.push(contentLengthBuffer);
    buffers.push(contentBytes);
    
    // Optional fields based on flags
    if (message.originalSender) {
      const originalSenderBytes = Buffer.from(message.originalSender, 'utf8');
      buffers.push(Buffer.from([originalSenderBytes.length]));
      buffers.push(originalSenderBytes);
    }
    
    if (message.recipientNickname) {
      const recipientNicknameBytes = Buffer.from(message.recipientNickname, 'utf8');
      buffers.push(Buffer.from([recipientNicknameBytes.length]));
      buffers.push(recipientNicknameBytes);
    }
    
    if (message.senderPeerID) {
      const senderPeerIDBytes = Buffer.from(message.senderPeerID, 'utf8');
      buffers.push(Buffer.from([senderPeerIDBytes.length]));
      buffers.push(senderPeerIDBytes);
    }
    
    if (message.mentions && message.mentions.length > 0) {
      buffers.push(Buffer.from([message.mentions.length]));
      for (const mention of message.mentions) {
        const mentionBytes = Buffer.from(mention, 'utf8');
        buffers.push(Buffer.from([mentionBytes.length]));
        buffers.push(mentionBytes);
      }
    }
    
    return Buffer.concat(buffers);
  }

  /**
   * Decodes a binary buffer to BitchatMessage
   */
  private decodeMessage(buffer: Buffer): BitchatMessage {
    let offset = 0;
    
    // Read flags
    const flags = buffer.readUInt8(offset++);
    const isRelay = (flags & 0x01) !== 0;
    const isPrivate = (flags & 0x02) !== 0;
    const hasOriginalSender = (flags & 0x04) !== 0;
    const hasRecipientNickname = (flags & 0x08) !== 0;
    const hasSenderPeerID = (flags & 0x10) !== 0;
    const hasMentions = (flags & 0x20) !== 0;
    
    // Read timestamp
    const timestamp = new Date(Number(buffer.readBigUInt64BE(offset)));
    offset += 8;
    
    // Read ID
    const idLength = buffer.readUInt8(offset++);
    const id = buffer.slice(offset, offset + idLength).toString('utf8');
    offset += idLength;
    
    // Read sender
    const senderLength = buffer.readUInt8(offset++);
    const sender = buffer.slice(offset, offset + senderLength).toString('utf8');
    offset += senderLength;
    
    // Read content
    const contentLength = buffer.readUInt16BE(offset);
    offset += 2;
    const content = buffer.slice(offset, offset + contentLength).toString('utf8');
    offset += contentLength;
    
    const message: BitchatMessage = {
      id,
      sender,
      content,
      timestamp,
      isRelay,
      isPrivate
    };
    
    // Read optional fields
    if (hasOriginalSender) {
      const originalSenderLength = buffer.readUInt8(offset++);
      message.originalSender = buffer.slice(offset, offset + originalSenderLength).toString('utf8');
      offset += originalSenderLength;
    }
    
    if (hasRecipientNickname) {
      const recipientNicknameLength = buffer.readUInt8(offset++);
      message.recipientNickname = buffer.slice(offset, offset + recipientNicknameLength).toString('utf8');
      offset += recipientNicknameLength;
    }
    
    if (hasSenderPeerID) {
      const senderPeerIDLength = buffer.readUInt8(offset++);
      message.senderPeerID = buffer.slice(offset, offset + senderPeerIDLength).toString('utf8');
      offset += senderPeerIDLength;
    }
    
    if (hasMentions) {
      const mentionsCount = buffer.readUInt8(offset++);
      message.mentions = [];
      for (let i = 0; i < mentionsCount; i++) {
        const mentionLength = buffer.readUInt8(offset++);
        const mention = buffer.slice(offset, offset + mentionLength).toString('utf8');
        offset += mentionLength;
        message.mentions.push(mention);
      }
    }
    
    return message;
  }

  /**
   * Applies padding to payload for traffic analysis resistance
   */
  private applyPadding(payload: Buffer): Buffer {
    // Find the next standard block size
    let targetSize = payload.length;
    for (const blockSize of STANDARD_BLOCK_SIZES) {
      if (blockSize >= payload.length) {
        targetSize = blockSize;
        break;
      }
    }
    
    // If larger than all standard sizes, pad to nearest 256 bytes
    if (targetSize === payload.length && payload.length > STANDARD_BLOCK_SIZES[STANDARD_BLOCK_SIZES.length - 1]) {
      targetSize = Math.ceil(payload.length / 256) * 256;
    }
    
    // Add random padding
    const paddingSize = targetSize - payload.length;
    const padding = randomBytes(paddingSize);
    
    // Format: [payload length (2 bytes)] [payload] [padding]
    const result = Buffer.alloc(targetSize + 2);
    result.writeUInt16BE(payload.length, 0);
    payload.copy(result, 2);
    padding.copy(result, 2 + payload.length);
    
    return result;
  }

  /**
   * Removes padding from payload
   */
  private removePadding(paddedPayload: Buffer): Buffer {
    if (paddedPayload.length < 2) {
      throw new Error('Invalid padded payload: too small');
    }
    
    const payloadLength = paddedPayload.readUInt16BE(0);
    if (payloadLength > paddedPayload.length - 2) {
      throw new Error('Invalid padded payload: length mismatch');
    }
    
    return paddedPayload.slice(2, 2 + payloadLength);
  }

  /**
   * Generates a unique packet ID for duplicate detection
   */
  private getPacketId(packet: BitchatPacket): string {
    // Use combination of senderID, timestamp, and first 8 bytes of payload
    const parts = [
      packet.senderID.toString('hex'),
      packet.timestamp.toString(),
      packet.payload.slice(0, 8).toString('hex')
    ];
    return parts.join(':');
  }

  /**
   * Checks if a packet is intended for us
   */
  private isPacketForUs(packet: BitchatPacket): boolean {
    if (!packet.recipientID) {
      return true; // Broadcast message
    }
    
    return packet.recipientID.equals(this.peerID) || 
           packet.recipientID.equals(BROADCAST_ID);
  }

  /**
   * Signs a packet (placeholder - actual implementation would use Ed25519)
   */
  private signPacket(packet: BitchatPacket, privateKey: Buffer): Buffer {
    // TODO: Implement actual Ed25519 signing
    // For now, return a dummy signature
    return Buffer.alloc(64);
  }

  /**
   * Verifies a packet signature (placeholder)
   */
  private verifySignature(packet: BitchatPacket): boolean {
    // TODO: Implement actual Ed25519 verification
    return true;
  }

  /**
   * Handles incoming message packets
   */
  private async handleMessage(packet: BitchatPacket, fromPeer: string): Promise<void> {
    const unpaddedPayload = this.removePadding(packet.payload);
    const message = this.decodeMessage(unpaddedPayload);
    
    // Emit message event for application layer
    // TODO: Implement event emitter
    console.log('Received message:', message);
  }

  /**
   * Handles announce packets
   */
  private async handleAnnounce(packet: BitchatPacket, fromPeer: string): Promise<void> {
    // Parse announce payload
    const nicknameLength = packet.payload.readUInt8(0);
    const nickname = packet.payload.slice(1, 1 + nicknameLength).toString('utf8');
    const publicKey = packet.payload.slice(1 + nicknameLength);
    
    // Emit peer discovered event
    // TODO: Implement event emitter
    console.log('Peer announced:', nickname, publicKey.toString('hex'));
  }

  /**
   * Handles leave packets
   */
  private async handleLeave(packet: BitchatPacket, fromPeer: string): Promise<void> {
    // Emit peer left event
    // TODO: Implement event emitter
    console.log('Peer left:', packet.senderID.toString('hex'));
  }

  /**
   * Handles fragment packets
   */
  private async handleFragment(packet: BitchatPacket, fromPeer: string): Promise<void> {
    const fragment = BinaryProtocol.parseFragment(packet.payload);
    
    // Store fragment
    if (!this.fragmentCache.has(fragment.messageId)) {
      this.fragmentCache.set(fragment.messageId, []);
    }
    
    const fragments = this.fragmentCache.get(fragment.messageId)!;
    fragments.push(fragment);
    
    // Check if we have all fragments
    if (fragments.length === fragment.totalFragments) {
      const reassembled = BinaryProtocol.reassembleFragments(fragments);
      if (reassembled) {
        // Create a new packet with reassembled payload
        const reassembledPacket: BitchatPacket = {
          ...packet,
          type: MessageType.MESSAGE,
          payload: reassembled
        };
        
        // Process the reassembled message
        await this.handleMessage(reassembledPacket, fromPeer);
        
        // Clean up fragment cache
        this.fragmentCache.delete(fragment.messageId);
      }
    }
  }

  /**
   * Handles delivery acknowledgment packets
   */
  private async handleDeliveryAck(packet: BitchatPacket, fromPeer: string): Promise<void> {
    // Extract message ID from payload
    const messageId = packet.payload.toString('hex');
    
    // Emit delivery confirmation event
    // TODO: Implement event emitter
    console.log('Delivery confirmed for message:', messageId);
  }

  /**
   * Relays a packet to other peers
   */
  private async relayPacket(packet: BitchatPacket, fromPeer: string): Promise<void> {
    // Decrease TTL
    const relayPacket: BitchatPacket = {
      ...packet,
      ttl: packet.ttl - 1
    };
    
    // Emit relay event for transport layer
    // TODO: Implement event emitter
    console.log('Relaying packet with TTL:', relayPacket.ttl);
  }

  /**
   * Cleans old entries from message cache
   */
  private cleanMessageCache(): void {
    // Simple cleanup: clear half the cache
    // In production, would use LRU or time-based eviction
    const entries = Array.from(this.messageCache);
    const toKeep = entries.slice(entries.length / 2);
    this.messageCache = new Set(toKeep);
  }
}