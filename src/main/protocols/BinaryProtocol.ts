import { BitchatPacket, MessageFragment } from '../../shared/types';
import { MessageType, PacketFlags, BLE_MTU, MESSAGE_MAX_SIZE } from '../../shared/constants';

/**
 * BinaryProtocol handles encoding and decoding of BitChat packets
 * according to the protocol specification.
 * 
 * Packet Structure:
 * Header (13 bytes):
 * - Version (1 byte)
 * - Type (1 byte)
 * - TTL (1 byte)
 * - Timestamp (8 bytes)
 * - Flags (1 byte)
 * - PayloadLength (2 bytes)
 * 
 * Variable sections:
 * - SenderID (8 bytes)
 * - RecipientID (8 bytes, optional based on HAS_RECIPIENT flag)
 * - Payload (variable)
 * - Signature (64 bytes, optional based on HAS_SIGNATURE flag)
 */
export class BinaryProtocol {
  /**
   * Encodes a BitchatPacket into a binary buffer
   */
  static encode(packet: BitchatPacket): Buffer {
    // Validate packet size
    if (packet.payload.length > MESSAGE_MAX_SIZE) {
      throw new Error(`Payload size ${packet.payload.length} exceeds maximum ${MESSAGE_MAX_SIZE}`);
    }

    // Calculate total buffer size
    let bufferSize = 13 + 8 + packet.payload.length; // Header + SenderID + Payload
    if (packet.recipientID) {
      bufferSize += 8;
    }
    if (packet.signature) {
      bufferSize += 64;
    }

    const buffer = Buffer.alloc(bufferSize);
    let offset = 0;

    // Write header
    buffer.writeUInt8(packet.version, offset++);
    buffer.writeUInt8(packet.type, offset++);
    buffer.writeUInt8(packet.ttl, offset++);
    buffer.writeBigUInt64BE(BigInt(packet.timestamp), offset);
    offset += 8;

    // Calculate and write flags
    let flags = 0;
    if (packet.recipientID) {
      flags |= PacketFlags.HAS_RECIPIENT;
    }
    if (packet.signature) {
      flags |= PacketFlags.HAS_SIGNATURE;
    }
    if (packet.isCompressed) {
      flags |= PacketFlags.IS_COMPRESSED;
    }
    buffer.writeUInt8(flags, offset++);

    // Write payload length
    buffer.writeUInt16BE(packet.payload.length, offset);
    offset += 2;

    // Write SenderID
    packet.senderID.copy(buffer, offset);
    offset += 8;

    // Write RecipientID if present
    if (packet.recipientID) {
      packet.recipientID.copy(buffer, offset);
      offset += 8;
    }

    // Write payload
    packet.payload.copy(buffer, offset);
    offset += packet.payload.length;

    // Write signature if present
    if (packet.signature) {
      packet.signature.copy(buffer, offset);
      offset += 64;
    }

    return buffer;
  }

  /**
   * Decodes a binary buffer into a BitchatPacket
   */
  static decode(data: Buffer): BitchatPacket {
    if (data.length < 13) {
      throw new Error('Invalid packet: too small for header');
    }

    let offset = 0;

    // Read header
    const version = data.readUInt8(offset++);
    const type = data.readUInt8(offset++);
    const ttl = data.readUInt8(offset++);
    const timestamp = Number(data.readBigUInt64BE(offset));
    offset += 8;
    const flags = data.readUInt8(offset++);
    const payloadLength = data.readUInt16BE(offset);
    offset += 2;

    // Parse flags
    const hasRecipient = (flags & PacketFlags.HAS_RECIPIENT) !== 0;
    const hasSignature = (flags & PacketFlags.HAS_SIGNATURE) !== 0;
    const isCompressed = (flags & PacketFlags.IS_COMPRESSED) !== 0;

    // Calculate expected size
    let expectedSize = 13 + 8 + payloadLength; // Header + SenderID + Payload
    if (hasRecipient) {
      expectedSize += 8;
    }
    if (hasSignature) {
      expectedSize += 64;
    }

    if (data.length < expectedSize) {
      throw new Error(`Invalid packet: expected ${expectedSize} bytes, got ${data.length}`);
    }

    // Read SenderID
    const senderID = Buffer.alloc(8);
    data.copy(senderID, 0, offset, offset + 8);
    offset += 8;

    // Read RecipientID if present
    let recipientID: Buffer | undefined;
    if (hasRecipient) {
      recipientID = Buffer.alloc(8);
      data.copy(recipientID, 0, offset, offset + 8);
      offset += 8;
    }

    // Read payload
    const payload = Buffer.alloc(payloadLength);
    data.copy(payload, 0, offset, offset + payloadLength);
    offset += payloadLength;

    // Read signature if present
    let signature: Buffer | undefined;
    if (hasSignature) {
      signature = Buffer.alloc(64);
      data.copy(signature, 0, offset, offset + 64);
      offset += 64;
    }

    return {
      version,
      type,
      ttl,
      timestamp,
      flags,
      senderID,
      recipientID,
      payload,
      signature,
      isCompressed
    };
  }

  /**
   * Fragments a large message into multiple packets for BLE transmission
   */
  static fragmentMessage(
    messageId: string,
    payload: Buffer,
    createPacket: (type: number, fragmentPayload: Buffer) => BitchatPacket
  ): BitchatPacket[] {
    if (payload.length <= BLE_MTU) {
      // No fragmentation needed
      return [createPacket(MessageType.MESSAGE, payload)];
    }

    const packets: BitchatPacket[] = [];
    const totalFragments = Math.ceil(payload.length / BLE_MTU);
    
    // Create message ID buffer (8 bytes)
    const messageIdBuffer = Buffer.from(messageId, 'hex').slice(0, 8);
    
    for (let i = 0; i < totalFragments; i++) {
      const start = i * BLE_MTU;
      const end = Math.min(start + BLE_MTU, payload.length);
      const fragment = payload.slice(start, end);

      // Fragment payload structure:
      // - MessageID (8 bytes)
      // - FragmentIndex (2 bytes)
      // - TotalFragments (2 bytes)
      // - Data (remaining bytes)
      const fragmentPayload = Buffer.alloc(12 + fragment.length);
      messageIdBuffer.copy(fragmentPayload, 0);
      fragmentPayload.writeUInt16BE(i, 8);
      fragmentPayload.writeUInt16BE(totalFragments, 10);
      fragment.copy(fragmentPayload, 12);

      let fragmentType: number;
      if (i === 0) {
        fragmentType = MessageType.FRAGMENT_START;
      } else if (i === totalFragments - 1) {
        fragmentType = MessageType.FRAGMENT_END;
      } else {
        fragmentType = MessageType.FRAGMENT_CONTINUE;
      }

      packets.push(createPacket(fragmentType, fragmentPayload));
    }

    return packets;
  }

  /**
   * Reassembles fragments into a complete message
   */
  static reassembleFragments(fragments: MessageFragment[]): Buffer | null {
    if (fragments.length === 0) {
      return null;
    }

    // Sort fragments by index
    fragments.sort((a, b) => a.fragmentIndex - b.fragmentIndex);

    // Verify we have all fragments
    const totalFragments = fragments[0].totalFragments;
    if (fragments.length !== totalFragments) {
      return null; // Missing fragments
    }

    // Verify all fragments belong to same message
    const messageId = fragments[0].messageId;
    if (!fragments.every(f => f.messageId === messageId)) {
      return null; // Mixed messages
    }

    // Concatenate fragment data
    return Buffer.concat(fragments.map(f => f.data));
  }

  /**
   * Extracts fragment information from a fragment packet payload
   */
  static parseFragment(payload: Buffer): MessageFragment {
    if (payload.length < 12) {
      throw new Error('Invalid fragment: too small');
    }

    const messageId = payload.slice(0, 8).toString('hex');
    const fragmentIndex = payload.readUInt16BE(8);
    const totalFragments = payload.readUInt16BE(10);
    const data = payload.slice(12);

    return {
      messageId,
      fragmentIndex,
      totalFragments,
      data
    };
  }
}