import { ipcMain, IpcMainInvokeEvent, app, BrowserWindow } from 'electron';
import { 
  IPC_CHANNELS,
  SendMessageRequest,
  PeerInfo,
  WhoCommandResponse,
  ConnectionStatus,
  ConnectionStats,
  AppSettings,
  AppError
} from '../shared/ipc-types';
import { NoiseSessionManager } from './crypto/NoiseSessionManager';
import { KeyManager } from './crypto/KeyManager';
import { ErrorCodes } from '../shared/constants';

// Mock data for now - will be replaced with actual implementations
let localKeyPair = KeyManager.generateNoiseKeyPair();
let sessionManager: NoiseSessionManager | null = null;
let settings: AppSettings = {
  nickname: 'Anonymous',
  autoConnect: true,
  enableNotifications: true,
  enableSounds: false,
  theme: 'dark',
  fontSize: 'medium',
  blockedPeers: []
};

// Mock peer data
const mockPeers: Map<string, PeerInfo> = new Map();

// Initialize session manager
export function initializeSessionManager(): void {
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
      // TODO: Implement actual message sending
      console.log('Sending message:', request);
      
      // Emit a mock received message for testing
      setTimeout(() => {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(window => {
          window.webContents.send(IPC_CHANNELS.MESSAGE_RECEIVED, {
            id: Date.now().toString(),
            senderId: 'self',
            senderNickname: settings.nickname,
            recipientId: request.recipientId,
            content: request.content,
            timestamp: new Date().toISOString(),
            isPrivate: !!request.recipientId,
            isEncrypted: !!request.recipientId,
            isSent: true,
            isDelivered: false,
            isRead: false
          });
        });
      }, 100);
      
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
    return {
      isConnected: true, // TODO: Get actual status
      connectedPeers: mockPeers.size,
      uptime: process.uptime(),
      transport: 'ble'
    };
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