import { BinaryProtocol } from '../../../src/main/protocols/BinaryProtocol';
import { BitchatPacket, MessageFragment } from '../../../src/shared/types';
import { MessageType, PacketFlags, PROTOCOL_VERSION, BLE_MTU } from '../../../src/shared/constants';

describe('BinaryProtocol', () => {
  describe('encode/decode', () => {
    it('should encode and decode a basic packet', () => {
      const packet: BitchatPacket = {
        version: PROTOCOL_VERSION,
        type: MessageType.MESSAGE,
        ttl: 7,
        timestamp: 1733251200000,
        flags: 0,
        senderID: Buffer.from('1234567890ABCDEF', 'hex'),
        payload: Buffer.from('Hello, BitChat!', 'utf8'),
        isCompressed: false
      };

      const encoded = BinaryProtocol.encode(packet);
      const decoded = BinaryProtocol.decode(encoded);

      expect(decoded.version).toBe(packet.version);
      expect(decoded.type).toBe(packet.type);
      expect(decoded.ttl).toBe(packet.ttl);
      expect(decoded.timestamp).toBe(packet.timestamp);
      expect(decoded.flags).toBe(packet.flags);
      expect(decoded.senderID).toEqual(packet.senderID);
      expect(decoded.payload).toEqual(packet.payload);
      expect(decoded.recipientID).toBeUndefined();
      expect(decoded.signature).toBeUndefined();
    });

    it('should encode and decode a packet with recipient', () => {
      const packet: BitchatPacket = {
        version: PROTOCOL_VERSION,
        type: MessageType.MESSAGE,
        ttl: 5,
        timestamp: Date.now(),
        flags: 0,
        senderID: Buffer.from('1234567890ABCDEF', 'hex'),
        recipientID: Buffer.from('FEDCBA0987654321', 'hex'),
        payload: Buffer.from('Private message', 'utf8'),
        isCompressed: false
      };

      const encoded = BinaryProtocol.encode(packet);
      const decoded = BinaryProtocol.decode(encoded);

      expect(decoded.recipientID).toEqual(packet.recipientID);
      expect(decoded.flags & PacketFlags.HAS_RECIPIENT).toBeTruthy();
    });

    it('should encode and decode a packet with signature', () => {
      const signature = Buffer.alloc(64);
      signature.fill(0xFF);

      const packet: BitchatPacket = {
        version: PROTOCOL_VERSION,
        type: MessageType.MESSAGE,
        ttl: 7,
        timestamp: Date.now(),
        flags: 0,
        senderID: Buffer.from('1234567890ABCDEF', 'hex'),
        payload: Buffer.from('Signed message', 'utf8'),
        signature,
        isCompressed: false
      };

      const encoded = BinaryProtocol.encode(packet);
      const decoded = BinaryProtocol.decode(encoded);

      expect(decoded.signature).toEqual(signature);
      expect(decoded.flags & PacketFlags.HAS_SIGNATURE).toBeTruthy();
    });

    it('should handle compressed flag', () => {
      const packet: BitchatPacket = {
        version: PROTOCOL_VERSION,
        type: MessageType.MESSAGE,
        ttl: 7,
        timestamp: Date.now(),
        flags: 0,
        senderID: Buffer.from('1234567890ABCDEF', 'hex'),
        payload: Buffer.from('Compressed', 'utf8'),
        isCompressed: true
      };

      const encoded = BinaryProtocol.encode(packet);
      const decoded = BinaryProtocol.decode(encoded);

      expect(decoded.isCompressed).toBe(true);
      expect(decoded.flags & PacketFlags.IS_COMPRESSED).toBeTruthy();
    });

    it('should throw on oversized payload', () => {
      const packet: BitchatPacket = {
        version: PROTOCOL_VERSION,
        type: MessageType.MESSAGE,
        ttl: 7,
        timestamp: Date.now(),
        flags: 0,
        senderID: Buffer.from('1234567890ABCDEF', 'hex'),
        payload: Buffer.alloc(65536), // Too large
        isCompressed: false
      };

      expect(() => BinaryProtocol.encode(packet)).toThrow(/exceeds maximum/);
    });

    it('should throw on invalid packet size', () => {
      const tooSmall = Buffer.alloc(10);
      expect(() => BinaryProtocol.decode(tooSmall)).toThrow(/too small/);

      // Valid header but truncated
      const truncated = Buffer.alloc(20);
      truncated.writeUInt8(PROTOCOL_VERSION, 0);
      truncated.writeUInt8(MessageType.MESSAGE, 1);
      truncated.writeUInt8(7, 2);
      truncated.writeBigUInt64BE(BigInt(Date.now()), 3);
      truncated.writeUInt8(0, 11);
      truncated.writeUInt16BE(100, 12); // Claims 100 byte payload

      expect(() => BinaryProtocol.decode(truncated)).toThrow(/Invalid packet/);
    });
  });

  describe('fragmentMessage', () => {
    const createPacket = (type: number, payload: Buffer): BitchatPacket => ({
      version: PROTOCOL_VERSION,
      type,
      ttl: 7,
      timestamp: Date.now(),
      flags: 0,
      senderID: Buffer.from('1234567890ABCDEF', 'hex'),
      payload,
      isCompressed: false
    });

    it('should not fragment small messages', () => {
      const smallPayload = Buffer.alloc(400);
      smallPayload.fill('A');
      const messageId = '0123456789ABCDEF';

      const fragments = BinaryProtocol.fragmentMessage(messageId, smallPayload, createPacket);

      expect(fragments).toHaveLength(1);
      expect(fragments[0].type).toBe(MessageType.MESSAGE);
      expect(fragments[0].payload).toEqual(smallPayload);
    });

    it('should fragment large messages', () => {
      const largePayload = Buffer.alloc(1500);
      largePayload.fill('B');
      const messageId = '0123456789ABCDEF';

      const fragments = BinaryProtocol.fragmentMessage(messageId, largePayload, createPacket);

      expect(fragments).toHaveLength(3);
      expect(fragments[0].type).toBe(MessageType.FRAGMENT_START);
      expect(fragments[1].type).toBe(MessageType.FRAGMENT_CONTINUE);
      expect(fragments[2].type).toBe(MessageType.FRAGMENT_END);

      // Check fragment payloads
      fragments.forEach((fragment, index) => {
        const parsed = BinaryProtocol.parseFragment(fragment.payload);
        expect(parsed.messageId).toBe(messageId.toLowerCase());
        expect(parsed.fragmentIndex).toBe(index);
        expect(parsed.totalFragments).toBe(3);
      });
    });

    it('should handle exact MTU boundary', () => {
      const exactPayload = Buffer.alloc(BLE_MTU);
      exactPayload.fill('C');
      const messageId = '0123456789ABCDEF';

      const fragments = BinaryProtocol.fragmentMessage(messageId, exactPayload, createPacket);

      expect(fragments).toHaveLength(1);
      expect(fragments[0].type).toBe(MessageType.MESSAGE);
    });
  });

  describe('reassembleFragments', () => {
    it('should reassemble fragments correctly', () => {
      const originalData = Buffer.from('This is a test message that will be fragmented and reassembled');
      const messageId = '0123456789ABCDEF';

      const fragments: MessageFragment[] = [
        {
          messageId,
          fragmentIndex: 0,
          totalFragments: 3,
          data: originalData.slice(0, 20)
        },
        {
          messageId,
          fragmentIndex: 1,
          totalFragments: 3,
          data: originalData.slice(20, 40)
        },
        {
          messageId,
          fragmentIndex: 2,
          totalFragments: 3,
          data: originalData.slice(40)
        }
      ];

      const reassembled = BinaryProtocol.reassembleFragments(fragments);
      expect(reassembled).toEqual(originalData);
    });

    it('should handle out-of-order fragments', () => {
      const originalData = Buffer.from('Test data');
      const messageId = '0123456789ABCDEF';

      const fragments: MessageFragment[] = [
        {
          messageId,
          fragmentIndex: 2,
          totalFragments: 3,
          data: originalData.slice(6)
        },
        {
          messageId,
          fragmentIndex: 0,
          totalFragments: 3,
          data: originalData.slice(0, 3)
        },
        {
          messageId,
          fragmentIndex: 1,
          totalFragments: 3,
          data: originalData.slice(3, 6)
        }
      ];

      const reassembled = BinaryProtocol.reassembleFragments(fragments);
      expect(reassembled).toEqual(originalData);
    });

    it('should return null for incomplete fragments', () => {
      const fragments: MessageFragment[] = [
        {
          messageId: '0123456789ABCDEF',
          fragmentIndex: 0,
          totalFragments: 3,
          data: Buffer.from('part1')
        },
        {
          messageId: '0123456789ABCDEF',
          fragmentIndex: 1,
          totalFragments: 3,
          data: Buffer.from('part2')
        }
        // Missing fragment 2
      ];

      const result = BinaryProtocol.reassembleFragments(fragments);
      expect(result).toBeNull();
    });

    it('should return null for mixed message fragments', () => {
      const fragments: MessageFragment[] = [
        {
          messageId: '0123456789ABCDEF',
          fragmentIndex: 0,
          totalFragments: 2,
          data: Buffer.from('msg1')
        },
        {
          messageId: 'FEDCBA9876543210',
          fragmentIndex: 1,
          totalFragments: 2,
          data: Buffer.from('msg2')
        }
      ];

      const result = BinaryProtocol.reassembleFragments(fragments);
      expect(result).toBeNull();
    });

    it('should return null for empty fragments', () => {
      const result = BinaryProtocol.reassembleFragments([]);
      expect(result).toBeNull();
    });
  });

  describe('parseFragment', () => {
    it('should parse fragment payload correctly', () => {
      const messageId = '0123456789ABCDEF';
      const fragmentData = Buffer.from('Hello, fragment!');
      
      const payload = Buffer.alloc(12 + fragmentData.length);
      Buffer.from(messageId, 'hex').copy(payload, 0);
      payload.writeUInt16BE(1, 8); // fragmentIndex
      payload.writeUInt16BE(3, 10); // totalFragments
      fragmentData.copy(payload, 12);

      const parsed = BinaryProtocol.parseFragment(payload);

      expect(parsed.messageId).toBe(messageId.toLowerCase());
      expect(parsed.fragmentIndex).toBe(1);
      expect(parsed.totalFragments).toBe(3);
      expect(parsed.data).toEqual(fragmentData);
    });

    it('should throw on invalid fragment payload', () => {
      const tooSmall = Buffer.alloc(10);
      expect(() => BinaryProtocol.parseFragment(tooSmall)).toThrow(/too small/);
    });
  });
});