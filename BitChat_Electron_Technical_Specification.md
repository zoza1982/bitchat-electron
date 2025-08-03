# BitChat Electron Desktop Client Technical Specification

**Version 1.0**  
**Date: December 3, 2025**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Protocol Specifications](#3-protocol-specifications)
4. [Binary Message Formats](#4-binary-message-formats)
5. [Cryptographic Implementation](#5-cryptographic-implementation)
6. [Transport Layer Implementation](#6-transport-layer-implementation)
7. [Application Layer](#7-application-layer)
8. [Electron-Specific Implementation](#8-electron-specific-implementation)
9. [Data Models and Structures](#9-data-models-and-structures)
10. [Security Requirements](#10-security-requirements)
11. [Development Roadmap](#11-development-roadmap)

---

## 1. Executive Summary

This document provides comprehensive technical specifications for developing an Electron desktop client for BitChat, a decentralized peer-to-peer messaging application. The client must be fully compatible with existing iOS and macOS BitChat clients, implementing the same protocol stack, encryption standards, and networking capabilities.

### Key Requirements

- **Protocol Compatibility**: Implement BitChat binary protocol v1
- **Encryption**: Noise Protocol Framework (XX pattern) with ChaCha20-Poly1305
- **Transports**: Bluetooth Low Energy (BLE) mesh networking and Nostr protocol
- **Platform**: Cross-platform desktop (Windows, macOS, Linux) using Electron
- **Security**: End-to-end encryption, ephemeral identities, no persistent storage

---

## 2. System Architecture Overview

### 2.1 Layered Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                             │
│                    (Electron/React/Vue)                           │
└─────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────┐
│                     Application Services                          │
│  (MessageRetryService, DeliveryTracker, NotificationService)     │
└─────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────┐
│                      Message Router                               │
│         (Transport selection, Favorites integration)              │
└─────────────────────────────────────────────────────────────────┘
                    │                            │
┌───────────────────────────────┐ ┌────────────────────────────────┐
│        Security Layer         │ │      Nostr Protocol Layer      │
│ (NoiseEncryptionService,      │ │  (NostrProtocol, NIP-17,      │
│  SecureIdentityStateManager)  │ │   NostrRelayManager)          │
└───────────────────────────────┘ └────────────────────────────────┘
                    │                            │
┌───────────────────────────────┐ ┌────────────────────────────────┐
│       Protocol Layer          │ │         Transport              │
│ (BitchatProtocol, Binary-     │ │    (WebSocket to Nostr        │
│  Protocol, NoiseProtocol)     │ │      relay servers)           │
└───────────────────────────────┘ └────────────────────────────────┘
                    │
┌─────────────────────────────────────────────────────────────────┐
│                   Bluetooth Transport Layer                       │
│               (Node.js BLE libraries via Electron)                │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Core Components

1. **BluetoothMeshService**: Manages BLE connections and mesh networking
2. **BitchatProtocol**: Implements binary message format and routing
3. **NoiseProtocol**: Provides end-to-end encryption
4. **MessageRouter**: Intelligently selects between Bluetooth and Nostr transports
5. **ChatViewModel**: Central state management and business logic
6. **UI Layer**: Electron-based desktop interface

---

## 3. Protocol Specifications

### 3.1 BitChat Protocol Stack

The protocol consists of four layers:

1. **Application Layer**: User messages, acknowledgments, and commands
2. **Session Layer**: Packet management, routing, and fragmentation
3. **Encryption Layer**: Noise Protocol Framework implementation
4. **Transport Layer**: BLE and Nostr transports

### 3.2 Protocol Constants

```javascript
const PROTOCOL_VERSION = 1;
const MAX_TTL = 7;
const BROADCAST_ID = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const MESSAGE_MAX_SIZE = 65535;
const BLE_MTU = 512;
const STANDARD_BLOCK_SIZES = [256, 512, 1024, 2048];
```

### 3.3 Message Types

```javascript
const MessageType = {
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
};
```

---

## 4. Binary Message Formats

### 4.1 BitchatPacket Structure

```
Header (Fixed 13 bytes):
+--------+------+-----+-----------+-------+----------------+
|Version | Type | TTL | Timestamp | Flags | PayloadLength  |
|1 byte  |1 byte|1byte| 8 bytes   | 1 byte| 2 bytes        |
+--------+------+-----+-----------+-------+----------------+

Variable sections:
+----------+-------------+---------+------------+
| SenderID | RecipientID | Payload | Signature  |
| 8 bytes  | 8 bytes*    | Variable| 64 bytes*  |
+----------+-------------+---------+------------+
* Optional fields based on flags
```

### 4.2 Flag Definitions

```javascript
const PacketFlags = {
  HAS_RECIPIENT: 0x01,
  HAS_SIGNATURE: 0x02,
  IS_COMPRESSED: 0x04
};
```

### 4.3 BitchatMessage Binary Format

```javascript
// Message encoding structure
const MessageStructure = {
  flags: 1,        // Bit 0: isRelay, Bit 1: isPrivate, etc.
  timestamp: 8,    // milliseconds since epoch
  idLength: 1,
  id: 'variable',
  senderLength: 1,
  sender: 'variable',
  contentLength: 2,
  content: 'variable',
  // Optional fields based on flags
  originalSender: 'optional',
  recipientNickname: 'optional',
  senderPeerID: 'optional',
  mentions: 'optional array'
};
```

### 4.4 Encoding/Decoding Implementation

```javascript
class BinaryProtocol {
  static encode(packet) {
    const buffer = Buffer.alloc(65535); // Max packet size
    let offset = 0;
    
    // Write header
    buffer.writeUInt8(packet.version, offset++);
    buffer.writeUInt8(packet.type, offset++);
    buffer.writeUInt8(packet.ttl, offset++);
    buffer.writeBigUInt64BE(BigInt(packet.timestamp), offset);
    offset += 8;
    
    // Flags
    let flags = 0;
    if (packet.recipientID) flags |= PacketFlags.HAS_RECIPIENT;
    if (packet.signature) flags |= PacketFlags.HAS_SIGNATURE;
    if (packet.isCompressed) flags |= PacketFlags.IS_COMPRESSED;
    buffer.writeUInt8(flags, offset++);
    
    // Payload length
    buffer.writeUInt16BE(packet.payload.length, offset);
    offset += 2;
    
    // Variable fields...
    // (Implementation continues...)
    
    return buffer.slice(0, offset);
  }
  
  static decode(data) {
    // Decoding implementation...
  }
}
```

---

## 5. Cryptographic Implementation

### 5.1 Noise Protocol Configuration

```
Protocol: Noise_XX_25519_ChaChaPoly_SHA256
```

- **Pattern**: XX (mutual authentication)
- **DH**: Curve25519
- **Cipher**: ChaCha20-Poly1305
- **Hash**: SHA-256

### 5.2 Key Management

```javascript
class IdentityManager {
  constructor() {
    this.staticKeyPair = null;     // Curve25519 for Noise
    this.signingKeyPair = null;    // Ed25519 for signatures
    this.nostrKeyPair = null;      // Secp256k1 for Nostr
  }
  
  async initialize() {
    // Generate or load keys from secure storage
    this.staticKeyPair = await this.generateCurve25519KeyPair();
    this.signingKeyPair = await this.generateEd25519KeyPair();
    
    // Derive Nostr keys from Noise static key
    this.nostrKeyPair = await this.deriveNostrKeys(this.staticKeyPair);
  }
  
  getFingerprint() {
    // SHA-256 hash of Noise static public key
    return crypto.createHash('sha256')
      .update(this.staticKeyPair.publicKey)
      .digest('hex');
  }
}
```

### 5.3 Noise Handshake Implementation

```javascript
class NoiseSession {
  constructor(role, localStatic, remoteStatic = null) {
    this.role = role;
    this.handshakeState = new HandshakeState('XX', role, localStatic);
    this.sendCipher = null;
    this.receiveCipher = null;
  }
  
  async processHandshakeMessage(message) {
    const [payload, cipherStates] = await this.handshakeState.readMessage(message);
    
    if (cipherStates) {
      // Handshake complete
      [this.sendCipher, this.receiveCipher] = cipherStates;
    }
    
    return payload;
  }
  
  async createHandshakeMessage(payload = Buffer.alloc(0)) {
    return await this.handshakeState.writeMessage(payload);
  }
}
```

### 5.4 Message Encryption/Decryption

```javascript
class NoiseEncryption {
  encryptMessage(plaintext, session) {
    if (!session.sendCipher) {
      throw new Error('Handshake not complete');
    }
    
    return session.sendCipher.encrypt(plaintext);
  }
  
  decryptMessage(ciphertext, session) {
    if (!session.receiveCipher) {
      throw new Error('Handshake not complete');
    }
    
    return session.receiveCipher.decrypt(ciphertext);
  }
}
```

---

## 6. Transport Layer Implementation

### 6.1 Bluetooth Low Energy (BLE) Implementation

#### 6.1.1 Service and Characteristic UUIDs

```javascript
const BLE_SERVICE_UUID = '12345678-1234-5678-1234-56789ABCDEF0';
const BLE_CHARACTERISTICS = {
  WRITE: '12345678-1234-5678-1234-56789ABCDEF1',
  NOTIFY: '12345678-1234-5678-1234-56789ABCDEF2'
};
```

#### 6.1.2 BLE Manager for Electron

```javascript
const noble = require('@abandonware/noble'); // For central mode
const bleno = require('@abandonware/bleno'); // For peripheral mode

class BluetoothMeshService {
  constructor() {
    this.peers = new Map();
    this.messageCache = new BloomFilter(10000, 4);
    this.isScanning = false;
    this.isAdvertising = false;
  }
  
  async startMeshService() {
    // Start both central and peripheral modes
    await this.startScanning();
    await this.startAdvertising();
  }
  
  async startScanning() {
    noble.on('discover', this.handlePeerDiscovery.bind(this));
    await noble.startScanningAsync([BLE_SERVICE_UUID], false);
    this.isScanning = true;
  }
  
  async startAdvertising() {
    const service = new bleno.PrimaryService({
      uuid: BLE_SERVICE_UUID,
      characteristics: [
        new bleno.Characteristic({
          uuid: BLE_CHARACTERISTICS.WRITE,
          properties: ['write', 'writeWithoutResponse'],
          onWriteRequest: this.handleIncomingData.bind(this)
        }),
        new bleno.Characteristic({
          uuid: BLE_CHARACTERISTICS.NOTIFY,
          properties: ['notify'],
          onSubscribe: this.handleSubscription.bind(this)
        })
      ]
    });
    
    await bleno.startAdvertisingAsync('BitChat', [BLE_SERVICE_UUID]);
    await bleno.setServicesAsync([service]);
    this.isAdvertising = true;
  }
}
```

### 6.2 Nostr Protocol Implementation

#### 6.2.1 NIP-17 Private Messages

```javascript
class NostrProtocol {
  static async createPrivateMessage(content, recipientPubkey, senderIdentity) {
    // Create rumor (unsigned inner event)
    const rumor = {
      pubkey: senderIdentity.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: content
    };
    
    // Create ephemeral keys
    const sealKey = generatePrivateKey();
    const giftWrapKey = generatePrivateKey();
    
    // Seal the rumor
    const seal = await this.createSeal(rumor, recipientPubkey, sealKey);
    
    // Gift wrap the seal
    const giftWrap = await this.createGiftWrap(seal, recipientPubkey, giftWrapKey);
    
    return giftWrap;
  }
  
  static async decryptPrivateMessage(giftWrap, recipientIdentity) {
    // Unwrap gift wrap
    const seal = await this.unwrapGiftWrap(giftWrap, recipientIdentity);
    
    // Open seal
    const rumor = await this.openSeal(seal, recipientIdentity);
    
    return {
      content: rumor.content,
      senderPubkey: rumor.pubkey
    };
  }
}
```

#### 6.2.2 Relay Management

```javascript
class NostrRelayManager {
  constructor() {
    this.relays = [
      'wss://relay.damus.io',
      'wss://relay.primal.net',
      'wss://offchain.pub',
      'wss://nostr21.com'
    ];
    this.connections = new Map();
  }
  
  async connect() {
    for (const url of this.relays) {
      const ws = new WebSocket(url);
      
      ws.on('open', () => {
        console.log(`Connected to relay: ${url}`);
        this.connections.set(url, ws);
      });
      
      ws.on('message', (data) => {
        this.handleRelayMessage(JSON.parse(data), url);
      });
    }
  }
  
  async sendEvent(event) {
    const message = JSON.stringify(['EVENT', event]);
    
    for (const [url, ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}
```

### 6.3 Message Router

```javascript
class MessageRouter {
  constructor(meshService, nostrRelay, favoritesService) {
    this.meshService = meshService;
    this.nostrRelay = nostrRelay;
    this.favoritesService = favoritesService;
  }
  
  async sendMessage(content, recipientNoisePublicKey, messageId) {
    const recipientHexID = Buffer.from(recipientNoisePublicKey).toString('hex');
    const peerAvailableOnMesh = this.meshService.isPeerConnected(recipientHexID);
    const isMutualFavorite = this.favoritesService.isMutualFavorite(recipientNoisePublicKey);
    
    // Transport selection logic
    if (peerAvailableOnMesh) {
      // Always prefer mesh when available
      await this.sendViaMesh(content, recipientHexID, messageId);
    } else if (isMutualFavorite) {
      // Use Nostr for mutual favorites when offline
      await this.sendViaNostr(content, recipientNoisePublicKey, messageId);
    } else {
      throw new Error('Peer not reachable');
    }
  }
}
```

---

## 7. Application Layer

### 7.1 State Management

```javascript
class ChatViewModel {
  constructor() {
    this.messages = [];
    this.peers = new Map();
    this.privateChats = new Map();
    this.nickname = '';
    this.favoritesPersistence = new FavoritesPersistenceService();
  }
  
  async processCommand(input) {
    if (!input.startsWith('/')) return false;
    
    const [command, ...args] = input.split(' ');
    
    switch (command) {
      case '/msg':
        await this.sendPrivateMessage(args[0], args.slice(1).join(' '));
        break;
      case '/who':
        this.showConnectedPeers();
        break;
      case '/nick':
        this.changeNickname(args.join(' '));
        break;
      case '/fav':
        await this.toggleFavorite(args[0]);
        break;
      // Additional commands...
    }
    
    return true;
  }
}
```

### 7.2 Message Processing Pipeline

```javascript
class MessageProcessor {
  async handleIncomingMessage(packet, peerID) {
    // 1. Check if from blocked peer
    if (this.isBlocked(peerID)) return;
    
    // 2. Decrypt if encrypted
    let decryptedPacket = packet;
    if (packet.type === MessageType.NOISE_ENCRYPTED) {
      decryptedPacket = await this.decryptPacket(packet, peerID);
    }
    
    // 3. Process based on message type
    switch (decryptedPacket.type) {
      case MessageType.MESSAGE:
        await this.handleChatMessage(decryptedPacket);
        break;
      case MessageType.DELIVERY_ACK:
        await this.handleDeliveryAck(decryptedPacket);
        break;
      // Additional message types...
    }
    
    // 4. Relay if necessary (TTL > 0)
    if (decryptedPacket.ttl > 0 && !this.isForUs(decryptedPacket)) {
      await this.relayPacket(decryptedPacket, peerID);
    }
  }
}
```

---

## 8. Electron-Specific Implementation

### 8.1 Main Process Architecture

```javascript
// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const BluetoothMeshService = require('./services/BluetoothMeshService');
const NostrRelayManager = require('./services/NostrRelayManager');
const MessageRouter = require('./services/MessageRouter');

let mainWindow;
let meshService;
let nostrRelay;
let messageRouter;

app.whenReady().then(async () => {
  // Initialize services
  meshService = new BluetoothMeshService();
  nostrRelay = new NostrRelayManager();
  messageRouter = new MessageRouter(meshService, nostrRelay);
  
  // Create window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  // Set up IPC handlers
  setupIPCHandlers();
  
  // Start services
  await meshService.startMeshService();
  await nostrRelay.connect();
});

function setupIPCHandlers() {
  ipcMain.handle('send-message', async (event, { content, recipient }) => {
    return await messageRouter.sendMessage(content, recipient);
  });
  
  ipcMain.handle('get-peers', async () => {
    return meshService.getConnectedPeers();
  });
  
  // Additional IPC handlers...
}
```

### 8.2 Renderer Process Communication

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bitchatAPI', {
  sendMessage: (content, recipient) => 
    ipcRenderer.invoke('send-message', { content, recipient }),
  
  getPeers: () => 
    ipcRenderer.invoke('get-peers'),
  
  onMessageReceived: (callback) => 
    ipcRenderer.on('message-received', callback),
  
  onPeerConnected: (callback) => 
    ipcRenderer.on('peer-connected', callback)
});
```

### 8.3 UI Framework Integration

```javascript
// React component example
import React, { useState, useEffect } from 'react';

function ChatView() {
  const [messages, setMessages] = useState([]);
  const [peers, setPeers] = useState([]);
  const [inputText, setInputText] = useState('');
  
  useEffect(() => {
    // Set up message listener
    window.bitchatAPI.onMessageReceived((event, message) => {
      setMessages(prev => [...prev, message]);
    });
    
    // Load initial peers
    loadPeers();
  }, []);
  
  const loadPeers = async () => {
    const peerList = await window.bitchatAPI.getPeers();
    setPeers(peerList);
  };
  
  const sendMessage = async () => {
    if (inputText.trim()) {
      await window.bitchatAPI.sendMessage(inputText, null);
      setInputText('');
    }
  };
  
  return (
    <div className="chat-container">
      {/* UI implementation */}
    </div>
  );
}
```

### 8.4 Platform-Specific Considerations

#### 8.4.1 Windows

```javascript
// Windows-specific BLE implementation
if (process.platform === 'win32') {
  // Use WinRT APIs for BLE
  const { BluetoothLEAdvertisementWatcher } = require('windows.devices.bluetooth.advertisement');
  // Implementation...
}
```

#### 8.4.2 macOS

```javascript
// macOS-specific permissions
if (process.platform === 'darwin') {
  // Request Bluetooth permissions
  const { systemPreferences } = require('electron');
  const bluetoothAuthorized = systemPreferences.getMediaAccessStatus('bluetooth');
  // Handle authorization...
}
```

#### 8.4.3 Linux

```javascript
// Linux-specific D-Bus integration
if (process.platform === 'linux') {
  const dbus = require('dbus-native');
  // BlueZ integration...
}
```

---

## 9. Data Models and Structures

### 9.1 Core Data Types

```javascript
// TypeScript interfaces
interface BitchatMessage {
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

interface Peer {
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

interface NoiseSession {
  peerID: string;
  handshakeState: 'none' | 'initiated' | 'completed';
  sendCipher: CipherState;
  receiveCipher: CipherState;
  createdAt: Date;
  lastActivity: Date;
}
```

### 9.2 Storage and Persistence

```javascript
class SecureStorage {
  constructor() {
    this.keytar = require('keytar');
    this.SERVICE_NAME = 'BitChat';
  }
  
  async saveIdentity(identity) {
    const encrypted = await this.encrypt(JSON.stringify(identity));
    await this.keytar.setPassword(this.SERVICE_NAME, 'identity', encrypted);
  }
  
  async loadIdentity() {
    const encrypted = await this.keytar.getPassword(this.SERVICE_NAME, 'identity');
    if (!encrypted) return null;
    
    const decrypted = await this.decrypt(encrypted);
    return JSON.parse(decrypted);
  }
  
  async saveFavorites(favorites) {
    const data = JSON.stringify(Array.from(favorites.entries()));
    await this.keytar.setPassword(this.SERVICE_NAME, 'favorites', data);
  }
}
```

---

## 10. Security Requirements

### 10.1 Cryptographic Requirements

1. **Key Generation**: Use cryptographically secure random number generator
2. **Key Storage**: Store keys in platform-specific secure storage (Keychain, Credential Manager)
3. **Memory Security**: Clear sensitive data from memory after use
4. **No Logging**: Never log keys, passwords, or message content

### 10.2 Protocol Security

1. **Replay Protection**: Implement sliding window nonce tracking
2. **Rate Limiting**: Prevent DoS through handshake flooding
3. **Message Validation**: Validate all incoming messages before processing
4. **Fingerprint Verification**: Provide UI for out-of-band verification

### 10.3 Application Security

1. **Input Validation**: Sanitize all user input
2. **Content Security Policy**: Restrict web content in Electron
3. **Auto-Update Security**: Sign updates and verify signatures
4. **Permission Management**: Request minimal system permissions

### 10.4 Privacy Features

1. **Ephemeral Messages**: No persistent message storage
2. **Identity Rotation**: Support changing ephemeral peer IDs
3. **Traffic Padding**: Pad messages to standard block sizes
4. **Timing Obfuscation**: Add random delays to prevent correlation

---

## 11. Development Roadmap

### Phase 1: Foundation (Weeks 1-4)
- [ ] Set up Electron project structure
- [ ] Implement binary protocol encoder/decoder
- [ ] Create Noise Protocol implementation
- [ ] Build basic UI framework

### Phase 2: Bluetooth Integration (Weeks 5-8)
- [ ] Integrate Noble/Bleno for BLE
- [ ] Implement mesh networking logic
- [ ] Add peer discovery and management
- [ ] Test cross-platform BLE functionality

### Phase 3: Nostr Integration (Weeks 9-10)
- [ ] Implement NIP-17 private messages
- [ ] Build relay management system
- [ ] Create message router
- [ ] Test Nostr fallback functionality

### Phase 4: Application Features (Weeks 11-14)
- [ ] Implement chat UI
- [ ] Add command processing
- [ ] Build favorites system
- [ ] Create notification system

### Phase 5: Security & Polish (Weeks 15-16)
- [ ] Security audit
- [ ] Performance optimization
- [ ] Cross-platform testing
- [ ] Documentation

### Phase 6: Release Preparation (Weeks 17-18)
- [ ] Auto-update system
- [ ] Code signing setup
- [ ] Distribution packaging
- [ ] Beta testing

---

## Appendix A: Dependencies

### Core Dependencies
```json
{
  "dependencies": {
    "electron": "^27.0.0",
    "@abandonware/noble": "^1.9.2",
    "@abandonware/bleno": "^0.5.1",
    "nostr-tools": "^2.0.0",
    "tweetnacl": "^1.0.3",
    "chacha20-poly1305": "^1.0.0",
    "keytar": "^7.9.0"
  }
}
```

### Development Dependencies
```json
{
  "devDependencies": {
    "electron-builder": "^24.0.0",
    "typescript": "^5.0.0",
    "react": "^18.0.0",
    "webpack": "^5.0.0"
  }
}
```

---

## Appendix B: Test Vectors

### Binary Protocol Test Vector
```javascript
// Input message
const message = {
  version: 1,
  type: 0x04, // MESSAGE
  ttl: 7,
  timestamp: 1733251200000,
  senderID: Buffer.from('1234567890ABCDEF', 'hex'),
  recipientID: null,
  payload: Buffer.from('Hello, BitChat!'),
  signature: null
};

// Expected binary output (hex)
const expected = '01047007250D4F3E8000000F1234567890ABCDEF48656C6C6F2C2042697443686174210...';
```

### Noise Handshake Test Vector
```javascript
// Test vectors for Noise_XX_25519_ChaChaPoly_SHA256
// (Include official Noise test vectors)
```

---

## Appendix C: Error Codes

```javascript
const ErrorCodes = {
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
};
```

---

This technical specification provides a comprehensive guide for implementing a BitChat Electron desktop client that is fully compatible with existing iOS and macOS clients. The implementation should strictly follow these specifications to ensure interoperability and maintain the security guarantees of the BitChat protocol.