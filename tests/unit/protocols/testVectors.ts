import { BitchatPacket } from '../../../src/shared/types';
import { MessageType, PROTOCOL_VERSION } from '../../../src/shared/constants';

/**
 * Test vectors for BitChat protocol verification
 * These ensure compatibility with existing iOS and macOS clients
 */

export interface TestVector {
  name: string;
  packet: BitchatPacket;
  expectedHex: string;
  description: string;
}

export const protocolTestVectors: TestVector[] = [
  {
    name: 'Basic MESSAGE packet',
    description: 'Simple message without recipient or signature',
    packet: {
      version: 1,
      type: MessageType.MESSAGE,
      ttl: 7,
      timestamp: 1733251200000, // 2024-12-03 00:00:00 UTC
      flags: 0,
      senderID: Buffer.from('1234567890ABCDEF', 'hex'),
      payload: Buffer.from('Hello, BitChat!', 'utf8'),
      isCompressed: false
    },
    expectedHex: '0104070001927c78380000000f1234567890abcdef48656c6c6f2c20426974436861742100'
  },

  {
    name: 'MESSAGE with recipient',
    description: 'Private message with recipient ID',
    packet: {
      version: 1,
      type: MessageType.MESSAGE,
      ttl: 5,
      timestamp: 1733251200000,
      flags: 0, // Will be set by encoder
      senderID: Buffer.from('1234567890ABCDEF', 'hex'),
      recipientID: Buffer.from('FEDCBA0987654321', 'hex'),
      payload: Buffer.from('Private', 'utf8'),
      isCompressed: false
    },
    expectedHex: '0104050001927c7838000100071234567890abcdeffedcba098765432150726976617465'
  },

  {
    name: 'ANNOUNCE packet',
    description: 'Peer announcement with nickname and public key',
    packet: {
      version: 1,
      type: MessageType.ANNOUNCE,
      ttl: 7,
      timestamp: 1733251200000,
      flags: 0,
      senderID: Buffer.from('1234567890ABCDEF', 'hex'),
      recipientID: Buffer.from('FFFFFFFFFFFFFFFF', 'hex'), // Broadcast
      payload: Buffer.concat([
        Buffer.from([4]), // nickname length
        Buffer.from('Test', 'utf8'),
        Buffer.alloc(32, 0xAA) // dummy public key
      ]),
      isCompressed: false
    },
    expectedHex: '0101070001927c7838000100251234567890abcdefffffffffffffffff0454657374aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  },

  {
    name: 'FRAGMENT_START packet',
    description: 'First fragment of a large message',
    packet: {
      version: 1,
      type: MessageType.FRAGMENT_START,
      ttl: 7,
      timestamp: 1733251200000,
      flags: 0,
      senderID: Buffer.from('1234567890ABCDEF', 'hex'),
      payload: Buffer.concat([
        Buffer.from('0123456789ABCDEF', 'hex'), // messageId
        Buffer.from([0x00, 0x00]), // fragmentIndex = 0
        Buffer.from([0x00, 0x03]), // totalFragments = 3
        Buffer.from('Fragment data...', 'utf8')
      ]),
      isCompressed: false
    },
    expectedHex: '0105070001927c783800001c1234567890abcdef0123456789abcdef00000003467261676d656e7420646174612e2e2e'
  },

  {
    name: 'DELIVERY_ACK packet',
    description: 'Delivery acknowledgment for a message',
    packet: {
      version: 1,
      type: MessageType.DELIVERY_ACK,
      ttl: 7,
      timestamp: 1733251200000,
      flags: 0,
      senderID: Buffer.from('1234567890ABCDEF', 'hex'),
      recipientID: Buffer.from('FEDCBA0987654321', 'hex'),
      payload: Buffer.from('MESSAGE_ID_HERE_', 'utf8'), // 16 byte message ID
      isCompressed: false
    },
    expectedHex: '010a070001927c7838000100101234567890abcdeffedcba09876543214d4553534147455f49445f484552455f'
  },

  {
    name: 'Compressed packet',
    description: 'Message with compression flag set',
    packet: {
      version: 1,
      type: MessageType.MESSAGE,
      ttl: 7,
      timestamp: 1733251200000,
      flags: 0, // Will be set by encoder
      senderID: Buffer.from('1234567890ABCDEF', 'hex'),
      payload: Buffer.from('Compressed', 'utf8'),
      isCompressed: true
    },
    expectedHex: '0104070001927c783800040a1234567890abcdef436f6d7072657373656400'
  },

  {
    name: 'Full featured packet',
    description: 'Message with recipient and signature',
    packet: {
      version: 1,
      type: MessageType.MESSAGE,
      ttl: 7,
      timestamp: 1733251200000,
      flags: 0, // Will be set by encoder
      senderID: Buffer.from('1234567890ABCDEF', 'hex'),
      recipientID: Buffer.from('FEDCBA0987654321', 'hex'),
      payload: Buffer.from('Signed', 'utf8'),
      signature: Buffer.alloc(64, 0xBB),
      isCompressed: false
    },
    expectedHex: '0104070001927c7838000300061234567890abcdeffedcba09876543215369676e6564' + 'bb'.repeat(64)
  }
];

/**
 * Message encoding test vectors
 */
export interface MessageTestVector {
  name: string;
  message: any; // BitchatMessage structure
  expectedBinary: string;
  description: string;
}

export const messageTestVectors: MessageTestVector[] = [
  {
    name: 'Simple message',
    description: 'Basic message with minimal fields',
    message: {
      flags: 0x00,
      timestamp: new Date(1733251200000),
      id: 'msg123',
      sender: 'Alice',
      content: 'Hello World'
    },
    expectedBinary: '000001927c783800066d7367313233054165696365000b48656c6c6f20576f726c64'
  },

  {
    name: 'Private message with mentions',
    description: 'Message with private flag and mentions',
    message: {
      flags: 0x22, // isPrivate + hasMentions
      timestamp: new Date(1733251200000),
      id: 'pm456',
      sender: 'Bob',
      content: 'Hey @Alice @Charlie',
      mentions: ['Alice', 'Charlie']
    },
    expectedBinary: '220001927c78380005706d34353603426f62001348657920404165696365204043686172656965020541656963650743686172656965'
  },

  {
    name: 'Relayed message',
    description: 'Message with relay flag and original sender',
    message: {
      flags: 0x05, // isRelay + hasOriginalSender
      timestamp: new Date(1733251200000),
      id: 'relay789',
      sender: 'Relay',
      content: 'Forwarded message',
      originalSender: 'OriginalUser'
    },
    expectedBinary: '050001927c78380008726564617937383905526564617900114665727761726465642065737361676500c4f726967696e61e5573657200'
  }
];

/**
 * Fragmentation test vectors
 */
export interface FragmentTestVector {
  name: string;
  description: string;
  originalPayload: string;
  messageId: string;
  expectedFragmentCount: number;
  fragmentTypes: number[];
}

export const fragmentTestVectors: FragmentTestVector[] = [
  {
    name: 'Small message no fragmentation',
    description: 'Message smaller than MTU should not fragment',
    originalPayload: 'A'.repeat(400),
    messageId: '0123456789ABCDEF',
    expectedFragmentCount: 1,
    fragmentTypes: [MessageType.MESSAGE]
  },

  {
    name: 'Two fragment message',
    description: 'Message requiring exactly 2 fragments',
    originalPayload: 'B'.repeat(600),
    messageId: 'FEDCBA9876543210',
    expectedFragmentCount: 2,
    fragmentTypes: [MessageType.FRAGMENT_START, MessageType.FRAGMENT_END]
  },

  {
    name: 'Three fragment message',
    description: 'Message requiring 3 fragments',
    originalPayload: 'C'.repeat(1200),
    messageId: '1111222233334444',
    expectedFragmentCount: 3,
    fragmentTypes: [MessageType.FRAGMENT_START, MessageType.FRAGMENT_CONTINUE, MessageType.FRAGMENT_END]
  }
];