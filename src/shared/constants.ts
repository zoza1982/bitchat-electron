// Protocol Constants
export const PROTOCOL_VERSION = 1;
export const MAX_TTL = 7;
export const BROADCAST_ID = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
export const MESSAGE_MAX_SIZE = 65535;
export const BLE_MTU = 512;
export const STANDARD_BLOCK_SIZES = [256, 512, 1024, 2048];

// Message Types
export const MessageType = {
  ANNOUNCE: 0x01,
  LEAVE: 0x03,
  MESSAGE: 0x04,
  FRAGMENT_START: 0x05,
  FRAGMENT_CONTINUE: 0x06,
  FRAGMENT_END: 0x07,
  DELIVERY_ACK: 0x0A,
  DELIVERY_STATUS_REQUEST: 0x0B,
  READ_RECEIPT: 0x0C,
  NOISE_HANDSHAKE_INIT: 0x10,
  NOISE_HANDSHAKE_RESP: 0x11,
  NOISE_ENCRYPTED: 0x12,
  NOISE_IDENTITY_ANNOUNCE: 0x13,
  VERSION_HELLO: 0x20,
  VERSION_ACK: 0x21,
  PROTOCOL_ACK: 0x22,
  PROTOCOL_NACK: 0x23,
  SYSTEM_VALIDATION: 0x24,
  HANDSHAKE_REQUEST: 0x25,
  FAVORITED: 0x30,
  UNFAVORITED: 0x31
} as const;

// Packet Flags
export const PacketFlags = {
  HAS_RECIPIENT: 0x01,
  HAS_SIGNATURE: 0x02,
  IS_COMPRESSED: 0x04
} as const;

// BLE Service and Characteristic UUIDs
export const BLE_SERVICE_UUID = '12345678-1234-5678-1234-56789ABCDEF0';
export const BLE_CHARACTERISTICS = {
  WRITE: '12345678-1234-5678-1234-56789ABCDEF1',
  NOTIFY: '12345678-1234-5678-1234-56789ABCDEF2'
} as const;

// Nostr Configuration
export const NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://offchain.pub',
  'wss://nostr21.com'
];

// Error Codes
export const ErrorCodes = {
  // Protocol errors (1000-1999)
  INVALID_PROTOCOL_VERSION: 1001,
  MALFORMED_PACKET: 1002,
  INVALID_MESSAGE_TYPE: 1003,
  
  // Crypto errors (2000-2999)
  HANDSHAKE_FAILED: 2001,
  DECRYPTION_FAILED: 2002,
  INVALID_SIGNATURE: 2003,
  
  // Transport errors (3000-3999)
  BLUETOOTH_UNAVAILABLE: 3001,
  PEER_NOT_FOUND: 3002,
  CONNECTION_LOST: 3003,
  
  // Application errors (4000-4999)
  INVALID_COMMAND: 4001,
  PEER_BLOCKED: 4002,
  MESSAGE_TOO_LARGE: 4003
} as const;