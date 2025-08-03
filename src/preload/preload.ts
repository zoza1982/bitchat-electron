import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { 
  IPC_CHANNELS,
  BitChatAPI,
  Message,
  Contact,
  MessageDeliveryUpdate,
  MessageReadUpdate,
  NoiseSessionEvent,
  NoiseHandshakeFailedEvent,
  ConnectionStatus,
  AppError
} from '../shared/ipc-types';

// Create a safe wrapper for IPC events
const createSafeListener = <T>(channel: string, callback: (data: T) => void) => {
  const safeCallback = (event: IpcRendererEvent, data: T) => {
    // Validate the event is from main process
    if (event.sender) {
      callback(data);
    }
  };
  ipcRenderer.on(channel, safeCallback);
  return () => ipcRenderer.removeListener(channel, safeCallback);
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const api: BitChatAPI = {
  // App
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  getUserId: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_USER_ID),
  
  // Messages
  sendMessage: (content: string, recipientId?: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.MESSAGE_SEND, { content, recipientId }),
  
  onMessageReceived: (callback: (message: Message) => void) =>
    createSafeListener(IPC_CHANNELS.MESSAGE_RECEIVED, callback),
  
  onMessageDelivered: (callback: (update: MessageDeliveryUpdate) => void) =>
    createSafeListener(IPC_CHANNELS.MESSAGE_DELIVERED, callback),
  
  onMessageRead: (callback: (update: MessageReadUpdate) => void) =>
    createSafeListener(IPC_CHANNELS.MESSAGE_READ, callback),
  
  // Peers
  getPeers: () => ipcRenderer.invoke(IPC_CHANNELS.PEERS_LIST),
  
  favoritePeer: (peerId: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.PEER_FAVORITE, peerId),
  
  unfavoritePeer: (peerId: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.PEER_UNFAVORITE, peerId),
  
  blockPeer: (peerId: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.PEER_BLOCK, peerId),
  
  unblockPeer: (peerId: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.PEER_UNBLOCK, peerId),
  
  onPeerConnected: (callback: (peer: Contact) => void) =>
    createSafeListener(IPC_CHANNELS.PEER_CONNECTED, callback),
  
  onPeerDisconnected: (callback: (peerId: string) => void) =>
    createSafeListener(IPC_CHANNELS.PEER_DISCONNECTED, (event: any) => 
      callback(typeof event === 'string' ? event : event.peerId)
    ),
  
  // Noise Sessions
  onSessionEstablished: (callback: (event: NoiseSessionEvent) => void) =>
    createSafeListener(IPC_CHANNELS.NOISE_SESSION_ESTABLISHED, callback),
  
  onSessionClosed: (callback: (peerId: string) => void) =>
    createSafeListener(IPC_CHANNELS.NOISE_SESSION_CLOSED, callback),
  
  onHandshakeFailed: (callback: (event: NoiseHandshakeFailedEvent) => void) =>
    createSafeListener(IPC_CHANNELS.NOISE_HANDSHAKE_FAILED, callback),
  
  // Commands
  setNickname: (nickname: string) => 
    ipcRenderer.invoke(IPC_CHANNELS.COMMAND_NICK, nickname),
  
  getWhoList: () => ipcRenderer.invoke(IPC_CHANNELS.COMMAND_WHO),
  
  clearMessages: () => ipcRenderer.invoke(IPC_CHANNELS.COMMAND_CLEAR),
  
  // Connection
  getConnectionStatus: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_STATUS),
  
  getConnectionStats: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_STATS),
  
  onConnectionStatusChanged: (callback: (status: ConnectionStatus) => void) =>
    createSafeListener(IPC_CHANNELS.CONNECTION_STATUS, callback),
  
  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  
  setSettings: (settings) => 
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),
  
  // Errors
  onError: (callback: (error: AppError) => void) =>
    createSafeListener(IPC_CHANNELS.ERROR_OCCURRED, callback),
  
  // Cleanup
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('bitchatAPI', api);

// TypeScript definitions for the exposed API
declare global {
  interface Window {
    bitchatAPI: BitChatAPI;
  }
}