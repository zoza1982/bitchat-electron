import { ipcMain, IpcMainInvokeEvent, app, BrowserWindow } from 'electron';
import { 
  IPC_CHANNELS,
  SendMessageRequest,
  PeerInfo,
  WhoCommandResponse,
  ConnectionStatus,
  ConnectionStats,
  AppSettings,
  TransportPreferences,
  NostrRelayRequest,
  AppError
} from '../shared/ipc-types';
import { NoiseSessionManager } from './crypto/NoiseSessionManager';
import { KeyManager } from './crypto/KeyManager';
import { TransportManager } from './transport/TransportManager';
import { MessageType, ErrorCodes } from '../shared/constants';

// Core services
let localKeyPair = KeyManager.generateNoiseKeyPair();
let sessionManager: NoiseSessionManager | null = null;
let transportManager: TransportManager | null = null;
let settings: AppSettings = {
  nickname: 'Anonymous',
  autoConnect: true,
  enableNotifications: true,
  enableSounds: false,
  theme: 'dark',
  fontSize: 'medium',
  blockedPeers: []
};

let transportPreferences: TransportPreferences = {
  preferredTransport: 'auto',
  autoConnect: true,
  bleSettings: {
    deviceName: 'BitChat Device',
    autoAdvertise: true,
    discoverabilityTimeout: 15
  },
  nostrSettings: {
    autoConnectRelays: true,
    maxRelayConnections: 5,
    defaultRelays: [
      'wss://relay.damus.io',
      'wss://relay.primal.net',
      'wss://offchain.pub'
    ],
    reconnectAttempts: 3
  },
  hybridSettings: {
    priority: 'balanced',
    fallbackBehavior: 'maintain-both',
    connectionTimeout: 30
  }
};

// Mock peer data
const mockPeers: Map<string, PeerInfo> = new Map();

// Initialize session manager and transport
export async function initializeSessionManager(): Promise<void> {
  sessionManager = new NoiseSessionManager(localKeyPair);
  
  // Set up event listeners
  sessionManager.on('sessionEstablished', (event) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send(IPC_CHANNELS.NOISE_SESSION_ESTABLISHED, event);
    });
  });
  
  sessionManager.on('sessionClosed', (event) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send(IPC_CHANNELS.NOISE_SESSION_CLOSED, event.peerID);
    });
  });
  
  sessionManager.on('handshakeFailed', (event) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send(IPC_CHANNELS.NOISE_HANDSHAKE_FAILED, event);
    });
  });

  // Initialize transport manager
  transportManager = new TransportManager({
    deviceName: settings.nickname || 'BitChat',
    sessionManager
  });

  // Set up transport event listeners
  transportManager.on('transport:ready', (transport: string) => {
    console.log(`Transport ready: ${transport}`);
    broadcastToAllWindows(IPC_CHANNELS.CONNECTION_STATUS, getConnectionStatus());
  });

  transportManager.on('peer:connected', (peer: any) => {
    console.log('Peer connected:', peer);
    const peerInfo: PeerInfo = {
      id: peer.id,
      nickname: undefined,
      fingerprint: undefined,
      isConnected: true,
      isFavorite: false,
      isBlocked: false,
      lastSeen: new Date().toISOString(),
      sessionEstablished: false,
      transport: peer.transport || 'ble',
      nostrPublicKey: peer.publicKey,
      bleAddress: peer.address
    };
    mockPeers.set(peer.id, peerInfo);
    
    broadcastToAllWindows(IPC_CHANNELS.PEER_CONNECTED, {
      id: peer.id,
      isConnected: true,
      isFavorite: false,
      transport: peer.transport || 'ble',
      nostrPublicKey: peer.publicKey,
      bleAddress: peer.address
    });
  });

  transportManager.on('peer:disconnected', (peerId: string) => {
    console.log('Peer disconnected:', peerId);
    const peer = mockPeers.get(peerId);
    if (peer) {
      peer.isConnected = false;
      peer.lastSeen = new Date().toISOString();
    }
    
    broadcastToAllWindows(IPC_CHANNELS.PEER_DISCONNECTED, peerId);
  });

  transportManager.on('packet', (packet: any) => {
    console.log('Received packet:', packet);
    // Handle incoming messages
    if (packet.messageType === MessageType.MESSAGE) {
      const message = {
        id: Date.now().toString(),
        senderId: packet.senderID.toString('hex'),
        senderNickname: mockPeers.get(packet.senderID.toString('hex'))?.nickname,
        content: packet.payload.toString('utf8'),
        timestamp: new Date().toISOString(),
        isPrivate: !!packet.recipientID,
        isEncrypted: packet.isEncrypted || false,
        isSent: false,
        isDelivered: false,
        isRead: false
      };
      
      broadcastToAllWindows(IPC_CHANNELS.MESSAGE_RECEIVED, message);
    }
  });

  // Initialize transport
  try {
    await transportManager.initialize();
  } catch (error) {
    console.error('Failed to initialize transport:', error);
  }
}

// Helper function to get connection status
function getConnectionStatus(): ConnectionStatus {
  const transportStatus = transportManager?.getStatus() || {
    ble: { isEnabled: false, isAdvertising: false, isConnected: false, connections: [] },
    nostr: { isEnabled: false, isConnected: false, publicKey: '', relays: [], peers: 0 },
    peers: []
  };

  // Determine transport type based on what's connected
  let transportType: 'ble' | 'nostr' | 'hybrid' = 'ble';
  if (transportStatus.ble.isConnected && transportStatus.nostr.isConnected) {
    transportType = 'hybrid';
  } else if (transportStatus.nostr.isConnected) {
    transportType = 'nostr';
  }

  return {
    isConnected: transportStatus.peers.length > 0,
    connectedPeers: transportStatus.peers.length,
    uptime: process.uptime(),
    transport: transportType,
    ble: {
      isEnabled: transportStatus.ble.isEnabled || false,
      isAdvertising: transportStatus.ble.isAdvertising || false,
      isConnected: transportStatus.ble.isConnected || false,
      deviceName: settings.nickname || 'BitChat',
      connectedDevice: transportStatus.ble.connections && transportStatus.ble.connections.length > 0 ? {
        address: transportStatus.ble.connections[0].address || 'Unknown',
        rssi: transportStatus.ble.connections[0].rssi,
        connectedAt: transportStatus.ble.connections[0].connectedAt || new Date().toISOString()
      } : undefined
    },
    nostr: {
      isEnabled: transportStatus.nostr.isEnabled || false,
      isConnected: transportStatus.nostr.isConnected || false,
      publicKey: transportStatus.nostr.publicKey,
      connectedRelays: transportStatus.nostr.relays?.filter(r => r.status === 'connected').length || 0,
      totalRelays: transportStatus.nostr.relays?.length || 0,
      relays: transportStatus.nostr.relays?.map(relay => ({
        url: relay.url,
        status: relay.status,
        error: relay.error,
        activeSubscriptions: relay.activeSubscriptions || 0
      })) || [],
      peers: transportStatus.nostr.peers || 0
    }
  };
}

// Register all IPC handlers
export function registerIPCHandlers(): void {
  // App handlers
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion();
  });
  
  ipcMain.handle(IPC_CHANNELS.APP_GET_USER_ID, () => {
    return localKeyPair.publicKey.toString('hex').slice(0, 16);
  });
  
  // Message handlers
  ipcMain.handle(IPC_CHANNELS.MESSAGE_SEND, async (event: IpcMainInvokeEvent, request: SendMessageRequest) => {
    try {
      const payload = Buffer.from(request.content, 'utf8');
      
      if (request.recipientId && transportManager) {
        // Send private message
        const success = await transportManager.sendPacket(
          request.recipientId,
          MessageType.MESSAGE,
          payload
        );
        
        if (!success) {
          throw new Error('Failed to send message');
        }
      } else if (transportManager) {
        // Broadcast message
        await transportManager.broadcastPacket(
          MessageType.MESSAGE,
          payload
        );
      }
      
      // Echo back to sender
      const message = {
        id: Date.now().toString(),
        senderId: localKeyPair.publicKey.toString('hex').slice(0, 16),
        senderNickname: settings.nickname,
        recipientId: request.recipientId,
        content: request.content,
        timestamp: new Date().toISOString(),
        isPrivate: !!request.recipientId,
        isEncrypted: !!request.recipientId,
        isSent: true,
        isDelivered: false,
        isRead: false
      };
      
      broadcastToAllWindows(IPC_CHANNELS.MESSAGE_RECEIVED, message);
      
      return;
    } catch (error) {
      throw new Error(`Failed to send message: ${error}`);
    }
  });
  
  // Peer handlers
  ipcMain.handle(IPC_CHANNELS.PEERS_LIST, async () => {
    const peers = Array.from(mockPeers.values()).map(peer => ({
      id: peer.id,
      nickname: peer.nickname,
      fingerprint: peer.fingerprint,
      isConnected: peer.isConnected,
      isFavorite: peer.isFavorite,
      lastSeen: peer.lastSeen
    }));
    return peers;
  });
  
  ipcMain.handle(IPC_CHANNELS.PEER_FAVORITE, async (event: IpcMainInvokeEvent, peerId: string) => {
    const peer = mockPeers.get(peerId);
    if (peer) {
      peer.isFavorite = true;
      mockPeers.set(peerId, peer);
    }
  });
  
  ipcMain.handle(IPC_CHANNELS.PEER_UNFAVORITE, async (event: IpcMainInvokeEvent, peerId: string) => {
    const peer = mockPeers.get(peerId);
    if (peer) {
      peer.isFavorite = false;
      mockPeers.set(peerId, peer);
    }
  });
  
  ipcMain.handle(IPC_CHANNELS.PEER_BLOCK, async (event: IpcMainInvokeEvent, peerId: string) => {
    const peer = mockPeers.get(peerId);
    if (peer) {
      peer.isBlocked = true;
      mockPeers.set(peerId, peer);
      settings.blockedPeers.push(peerId);
    }
  });
  
  ipcMain.handle(IPC_CHANNELS.PEER_UNBLOCK, async (event: IpcMainInvokeEvent, peerId: string) => {
    const peer = mockPeers.get(peerId);
    if (peer) {
      peer.isBlocked = false;
      mockPeers.set(peerId, peer);
      settings.blockedPeers = settings.blockedPeers.filter(id => id !== peerId);
    }
  });
  
  // Command handlers
  ipcMain.handle(IPC_CHANNELS.COMMAND_NICK, async (event: IpcMainInvokeEvent, nickname: string) => {
    settings.nickname = nickname;
    // TODO: Broadcast nickname change
  });
  
  ipcMain.handle(IPC_CHANNELS.COMMAND_WHO, async (): Promise<WhoCommandResponse> => {
    const peers = Array.from(mockPeers.values());
    return {
      peers,
      totalCount: peers.length
    };
  });
  
  ipcMain.handle(IPC_CHANNELS.COMMAND_CLEAR, async () => {
    // TODO: Clear message history
    console.log('Clearing message history');
  });
  
  // Connection handlers
  ipcMain.handle(IPC_CHANNELS.CONNECTION_STATUS, async (): Promise<ConnectionStatus> => {
    return getConnectionStatus();
  });
  
  ipcMain.handle(IPC_CHANNELS.CONNECTION_STATS, async (): Promise<ConnectionStats> => {
    return {
      messagesSent: 0, // TODO: Track actual stats
      messagesReceived: 0,
      bytesUploaded: 0,
      bytesDownloaded: 0,
      sessionsEstablished: 0,
      handshakeFailures: 0
    };
  });
  
  // Settings handlers
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<AppSettings> => {
    return settings;
  });
  
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (event: IpcMainInvokeEvent, newSettings: Partial<AppSettings>) => {
    settings = { ...settings, ...newSettings };
    // TODO: Persist settings
  });
  
  // Transport Preferences handlers
  ipcMain.handle(IPC_CHANNELS.TRANSPORT_PREFERENCES_GET, async (): Promise<TransportPreferences> => {
    return transportPreferences;
  });
  
  ipcMain.handle(IPC_CHANNELS.TRANSPORT_PREFERENCES_SET, async (event: IpcMainInvokeEvent, newPreferences: Partial<TransportPreferences>) => {
    transportPreferences = { ...transportPreferences, ...newPreferences };
    
    // Apply changes to transport manager if available
    if (transportManager && newPreferences.bleSettings?.deviceName) {
      // TODO: Update BLE device name
      console.log('Updating BLE device name to:', newPreferences.bleSettings.deviceName);
    }
    
    // TODO: Persist transport preferences
    console.log('Updated transport preferences:', transportPreferences);
  });
  
  ipcMain.handle(IPC_CHANNELS.TRANSPORT_PREFERENCES_RESET, async () => {
    transportPreferences = {
      preferredTransport: 'auto',
      autoConnect: true,
      bleSettings: {
        deviceName: 'BitChat Device',
        autoAdvertise: true,
        discoverabilityTimeout: 15
      },
      nostrSettings: {
        autoConnectRelays: true,
        maxRelayConnections: 5,
        defaultRelays: [
          'wss://relay.damus.io',
          'wss://relay.primal.net',
          'wss://offchain.pub'
        ],
        reconnectAttempts: 3
      },
      hybridSettings: {
        priority: 'balanced',
        fallbackBehavior: 'maintain-both',
        connectionTimeout: 30
      }
    };
    
    console.log('Reset transport preferences to defaults');
  });
  
  // Nostr Relay Management handlers
  ipcMain.handle(IPC_CHANNELS.NOSTR_RELAY_ADD, async (event: IpcMainInvokeEvent, url: string) => {
    try {
      if (transportManager) {
        // TODO: Add relay to transport manager
        console.log('Adding Nostr relay:', url);
        
        // Add to default relays if not already present
        if (!transportPreferences.nostrSettings.defaultRelays.includes(url)) {
          transportPreferences.nostrSettings.defaultRelays.push(url);
        }
      }
    } catch (error) {
      throw new Error(`Failed to add relay: ${error}`);
    }
  });
  
  ipcMain.handle(IPC_CHANNELS.NOSTR_RELAY_REMOVE, async (event: IpcMainInvokeEvent, url: string) => {
    try {
      if (transportManager) {
        // TODO: Remove relay from transport manager
        console.log('Removing Nostr relay:', url);
        
        // Remove from default relays
        transportPreferences.nostrSettings.defaultRelays = 
          transportPreferences.nostrSettings.defaultRelays.filter(relay => relay !== url);
      }
    } catch (error) {
      throw new Error(`Failed to remove relay: ${error}`);
    }
  });
  
  ipcMain.handle(IPC_CHANNELS.NOSTR_RELAY_CONNECT, async (event: IpcMainInvokeEvent, url: string) => {
    try {
      if (transportManager) {
        // TODO: Connect to specific relay
        console.log('Connecting to Nostr relay:', url);
      }
    } catch (error) {
      throw new Error(`Failed to connect to relay: ${error}`);
    }
  });
  
  ipcMain.handle(IPC_CHANNELS.NOSTR_RELAY_DISCONNECT, async (event: IpcMainInvokeEvent, url: string) => {
    try {
      if (transportManager) {
        // TODO: Disconnect from specific relay
        console.log('Disconnecting from Nostr relay:', url);
      }
    } catch (error) {
      throw new Error(`Failed to disconnect from relay: ${error}`);
    }
  });
}

// Helper function to broadcast to all windows
export function broadcastToAllWindows(channel: string, data: any): void {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(window => {
    window.webContents.send(channel, data);
  });
}

// Helper function to send error to renderer
export function sendError(error: AppError): void {
  broadcastToAllWindows(IPC_CHANNELS.ERROR_OCCURRED, error);
}

// Mock functions for testing
export function simulatePeerConnection(peerId: string, nickname?: string): void {
  const peer: PeerInfo = {
    id: peerId,
    nickname: nickname || `User-${peerId.slice(0, 6)}`,
    fingerprint: KeyManager.generateFingerprint(Buffer.from(peerId, 'hex')),
    isConnected: true,
    isFavorite: false,
    isBlocked: false,
    lastSeen: new Date().toISOString(),
    sessionEstablished: false
  };
  
  mockPeers.set(peerId, peer);
  
  broadcastToAllWindows(IPC_CHANNELS.PEER_CONNECTED, {
    id: peer.id,
    nickname: peer.nickname,
    fingerprint: peer.fingerprint,
    isConnected: peer.isConnected,
    isFavorite: peer.isFavorite
  });
  
  // Simulate session establishment after 1 second
  setTimeout(() => {
    if (sessionManager) {
      peer.sessionEstablished = true;
      mockPeers.set(peerId, peer);
      
      broadcastToAllWindows(IPC_CHANNELS.NOISE_SESSION_ESTABLISHED, {
        peerID: peerId,
        fingerprint: peer.fingerprint,
        isInitiator: true,
        timestamp: Date.now()
      });
    }
  }, 1000);
}

export function simulatePeerDisconnection(peerId: string): void {
  const peer = mockPeers.get(peerId);
  if (peer) {
    peer.isConnected = false;
    peer.lastSeen = new Date().toISOString();
    mockPeers.set(peerId, peer);
    
    broadcastToAllWindows(IPC_CHANNELS.PEER_DISCONNECTED, {
      peerId,
      reason: 'Connection lost',
      timestamp: Date.now()
    });
  }
}

export function simulateIncomingMessage(senderId: string, content: string, isPrivate: boolean = false): void {
  const sender = mockPeers.get(senderId);
  
  broadcastToAllWindows(IPC_CHANNELS.MESSAGE_RECEIVED, {
    id: Date.now().toString(),
    senderId,
    senderNickname: sender?.nickname,
    content,
    timestamp: new Date().toISOString(),
    isPrivate,
    isEncrypted: isPrivate && sender?.sessionEstablished,
    isSent: false,
    isDelivered: false,
    isRead: false
  });
}