import { Message } from '../renderer/components/MessageThread';
import { Contact } from '../renderer/components/ContactList';

// IPC Channel Names
export const IPC_CHANNELS = {
  // App
  APP_GET_VERSION: 'app:getVersion',
  APP_GET_USER_ID: 'app:getUserId',
  
  // Messages
  MESSAGE_SEND: 'message:send',
  MESSAGE_RECEIVED: 'message:received',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  
  // Peers/Contacts
  PEERS_LIST: 'peers:list',
  PEER_CONNECTED: 'peer:connected',
  PEER_DISCONNECTED: 'peer:disconnected',
  PEER_FAVORITE: 'peer:favorite',
  PEER_UNFAVORITE: 'peer:unfavorite',
  PEER_BLOCK: 'peer:block',
  PEER_UNBLOCK: 'peer:unblock',
  
  // Noise Protocol
  NOISE_SESSION_ESTABLISHED: 'noise:sessionEstablished',
  NOISE_SESSION_CLOSED: 'noise:sessionClosed',
  NOISE_HANDSHAKE_FAILED: 'noise:handshakeFailed',
  
  // Commands
  COMMAND_NICK: 'command:nick',
  COMMAND_WHO: 'command:who',
  COMMAND_CLEAR: 'command:clear',
  
  // Connection
  CONNECTION_STATUS: 'connection:status',
  CONNECTION_STATS: 'connection:stats',
  
  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  
  // Transport Preferences
  TRANSPORT_PREFERENCES_GET: 'transport:preferences:get',
  TRANSPORT_PREFERENCES_SET: 'transport:preferences:set',
  TRANSPORT_PREFERENCES_RESET: 'transport:preferences:reset',
  
  // Nostr Relay Management
  NOSTR_RELAY_ADD: 'nostr:relay:add',
  NOSTR_RELAY_REMOVE: 'nostr:relay:remove',
  NOSTR_RELAY_CONNECT: 'nostr:relay:connect',
  NOSTR_RELAY_DISCONNECT: 'nostr:relay:disconnect',
  
  // Errors
  ERROR_OCCURRED: 'error:occurred'
} as const;

// IPC Request/Response Types
export interface IPCRequest<T = any> {
  id: string;
  timestamp: number;
  data: T;
}

export interface IPCResponse<T = any> {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
}

// Message Types
export interface SendMessageRequest {
  content: string;
  recipientId?: string;
}

export interface MessageDeliveryUpdate {
  messageId: string;
  delivered: boolean;
  timestamp: number;
}

export interface MessageReadUpdate {
  messageId: string;
  read: boolean;
  timestamp: number;
}

// Peer Types
export interface PeerInfo {
  id: string;
  nickname?: string;
  fingerprint?: string;
  isConnected: boolean;
  isFavorite: boolean;
  isBlocked: boolean;
  lastSeen?: string;
  sessionEstablished: boolean;
  transport: 'ble' | 'nostr' | 'both';
  nostrPublicKey?: string;
  bleAddress?: string;
}

export interface PeerConnectionEvent {
  peer: PeerInfo;
  timestamp: number;
}

export interface PeerDisconnectionEvent {
  peerId: string;
  reason?: string;
  timestamp: number;
}

// Noise Session Types
export interface NoiseSessionEvent {
  peerID: string;
  fingerprint: string;
  isInitiator: boolean;
  timestamp: number;
}

export interface NoiseHandshakeFailedEvent {
  peerID: string;
  reason: string;
  timestamp: number;
}

// Command Types
export interface NickCommand {
  nickname: string;
}

export interface WhoCommandResponse {
  peers: PeerInfo[];
  totalCount: number;
}

// Connection Types
export interface ConnectionStatus {
  isConnected: boolean;
  connectedPeers: number;
  uptime: number;
  transport: 'ble' | 'nostr' | 'hybrid';
  ble: BLEStatus;
  nostr: NostrStatus;
}

export interface BLEStatus {
  isEnabled: boolean;
  isAdvertising: boolean;
  isConnected: boolean;
  deviceName?: string;
  connectedDevice?: {
    address: string;
    rssi?: number;
    connectedAt: string;
  };
}

export interface NostrRelayInfo {
  url: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
  activeSubscriptions: number;
}

export interface NostrStatus {
  isEnabled: boolean;
  isConnected: boolean;
  publicKey?: string;
  connectedRelays: number;
  totalRelays: number;
  relays: NostrRelayInfo[];
  peers: number;
}

export interface ConnectionStats {
  messagesSent: number;
  messagesReceived: number;
  bytesUploaded: number;
  bytesDownloaded: number;
  sessionsEstablished: number;
  handshakeFailures: number;
}

// Settings Types
export interface AppSettings {
  nickname?: string;
  autoConnect: boolean;
  enableNotifications: boolean;
  enableSounds: boolean;
  theme: 'dark' | 'light' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
  blockedPeers: string[];
}

// Transport Preferences Types
export interface TransportPreferences {
  preferredTransport: 'ble' | 'nostr' | 'auto';
  autoConnect: boolean;
  bleSettings: {
    deviceName: string;
    autoAdvertise: boolean;
    discoverabilityTimeout: number; // minutes
  };
  nostrSettings: {
    autoConnectRelays: boolean;
    maxRelayConnections: number;
    defaultRelays: string[];
    reconnectAttempts: number;
  };
  hybridSettings: {
    priority: 'ble' | 'nostr' | 'balanced';
    fallbackBehavior: 'switch' | 'maintain-both';
    connectionTimeout: number; // seconds
  };
}

// Nostr Relay Management Types
export interface NostrRelayRequest {
  url: string;
}

// Error Types
export interface AppError {
  code: number;
  message: string;
  details?: any;
  timestamp: number;
}

// API Interface for Window
export interface BitChatAPI {
  // App
  getVersion: () => Promise<string>;
  getUserId: () => Promise<string>;
  
  // Messages
  sendMessage: (content: string, recipientId?: string) => Promise<void>;
  onMessageReceived: (callback: (message: Message) => void) => void;
  onMessageDelivered: (callback: (update: MessageDeliveryUpdate) => void) => void;
  onMessageRead: (callback: (update: MessageReadUpdate) => void) => void;
  
  // Peers
  getPeers: () => Promise<Contact[]>;
  favoritePeer: (peerId: string) => Promise<void>;
  unfavoritePeer: (peerId: string) => Promise<void>;
  blockPeer: (peerId: string) => Promise<void>;
  unblockPeer: (peerId: string) => Promise<void>;
  onPeerConnected: (callback: (peer: Contact) => void) => void;
  onPeerDisconnected: (callback: (peerId: string) => void) => void;
  
  // Noise Sessions
  onSessionEstablished: (callback: (event: NoiseSessionEvent) => void) => void;
  onSessionClosed: (callback: (peerId: string) => void) => void;
  onHandshakeFailed: (callback: (event: NoiseHandshakeFailedEvent) => void) => void;
  
  // Commands
  setNickname: (nickname: string) => Promise<void>;
  getWhoList: () => Promise<WhoCommandResponse>;
  clearMessages: () => Promise<void>;
  
  // Connection
  getConnectionStatus: () => Promise<ConnectionStatus>;
  getConnectionStats: () => Promise<ConnectionStats>;
  onConnectionStatusChanged: (callback: (status: ConnectionStatus) => void) => void;
  
  // Settings
  getSettings: () => Promise<AppSettings>;
  setSettings: (settings: Partial<AppSettings>) => Promise<void>;
  
  // Transport Preferences
  getTransportPreferences: () => Promise<TransportPreferences>;
  setTransportPreferences: (preferences: Partial<TransportPreferences>) => Promise<void>;
  resetTransportPreferences: () => Promise<void>;
  
  // Nostr Relay Management
  addNostrRelay: (url: string) => Promise<void>;
  removeNostrRelay: (url: string) => Promise<void>;
  connectNostrRelay: (url: string) => Promise<void>;
  disconnectNostrRelay: (url: string) => Promise<void>;
  
  // Errors
  onError: (callback: (error: AppError) => void) => void;
  
  // Cleanup
  removeAllListeners: (channel: string) => void;
}