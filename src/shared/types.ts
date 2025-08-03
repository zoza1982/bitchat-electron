// Core Data Types

export interface BitchatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  isRelay: boolean;
  originalSender?: string;
  isPrivate: boolean;
  recipientNickname?: string;
  senderPeerID?: string;
  mentions?: string[];
  deliveryStatus?: DeliveryStatus;
}

export interface BitchatPacket {
  version: number;
  type: number;
  ttl: number;
  timestamp: number;
  flags: number;
  senderID: Buffer;
  recipientID?: Buffer;
  payload: Buffer;
  signature?: Buffer;
  isCompressed?: boolean;
}

export interface Peer {
  id: string;
  nickname: string;
  noisePublicKey: Buffer;
  signingPublicKey: Buffer;
  fingerprint: string;
  trustLevel: 'untrusted' | 'verified' | 'trusted' | 'blocked';
  isConnected: boolean;
  lastSeen: Date;
  nostrPublicKey?: string;
}

export interface NoiseSession {
  peerID: string;
  handshakeState: 'none' | 'initiated' | 'completed';
  sendCipher: any; // CipherState
  receiveCipher: any; // CipherState
  createdAt: Date;
  lastActivity: Date;
}

export interface PrivateChat {
  peerID: string;
  messages: BitchatMessage[];
  unreadCount: number;
  lastMessage?: BitchatMessage;
}

export enum DeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

export interface KeyPair {
  publicKey: Buffer;
  privateKey: Buffer;
}

export interface Identity {
  nickname: string;
  staticKeyPair: KeyPair; // Curve25519 for Noise
  signingKeyPair: KeyPair; // Ed25519 for signatures
  nostrKeyPair?: {
    publicKey: string;
    privateKey: string;
  };
  createdAt: Date;
}

export interface NostrEvent {
  id?: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}

export interface MessageFragment {
  messageId: string;
  fragmentIndex: number;
  totalFragments: number;
  data: Buffer;
}

export interface FavoriteEntry {
  peerID: string;
  nickname: string;
  noisePublicKey: string;
  nostrPublicKey?: string;
  addedAt: Date;
}

// IPC Message Types

export interface SendMessageRequest {
  content: string;
  recipient?: string;
}

export interface MessageReceivedEvent {
  message: BitchatMessage;
  fromPeer: string;
}

export interface PeerConnectedEvent {
  peer: Peer;
}

export interface PeerDisconnectedEvent {
  peerId: string;
  reason?: string;
}

// Configuration Types

export interface AppConfig {
  bluetoothEnabled: boolean;
  nostrEnabled: boolean;
  nostrRelays: string[];
  autoConnect: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
}

export interface BluetoothConfig {
  serviceUUID: string;
  characteristics: {
    write: string;
    notify: string;
  };
  scanInterval: number;
  connectionTimeout: number;
}