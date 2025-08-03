import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('bitchatAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  
  // Messaging
  sendMessage: (content: string, recipient?: string) => 
    ipcRenderer.invoke('message:send', { content, recipient }),
  
  // Peer management
  getPeers: () => ipcRenderer.invoke('peers:list'),
  
  // Event listeners
  onMessageReceived: (callback: (message: any) => void) => {
    ipcRenderer.on('message:received', (event, message) => callback(message));
  },
  
  onPeerConnected: (callback: (peer: any) => void) => {
    ipcRenderer.on('peer:connected', (event, peer) => callback(peer));
  },
  
  onPeerDisconnected: (callback: (peerId: string) => void) => {
    ipcRenderer.on('peer:disconnected', (event, peerId) => callback(peerId));
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// TypeScript definitions for the exposed API
declare global {
  interface Window {
    bitchatAPI: {
      getVersion: () => Promise<string>;
      sendMessage: (content: string, recipient?: string) => Promise<void>;
      getPeers: () => Promise<any[]>;
      onMessageReceived: (callback: (message: any) => void) => void;
      onPeerConnected: (callback: (peer: any) => void) => void;
      onPeerDisconnected: (callback: (peerId: string) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}