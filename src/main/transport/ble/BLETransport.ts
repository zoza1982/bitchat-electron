import * as bleno from '@abandonware/bleno';
import { EventEmitter } from 'events';
import { BitChatBLEService } from './BLEService';
import { BLE_MTU } from '../../../shared/constants';
import { FragmentManager } from '../../protocols/FragmentManager';
import { BinaryProtocol } from '../../protocols/BinaryProtocol';

export interface BLEConnection {
  address: string;
  rssi?: number;
  connectedAt: Date;
}

export interface BLETransportOptions {
  deviceName?: string;
  fragmentManager?: FragmentManager;
  binaryProtocol?: BinaryProtocol;
}

export class BLETransport extends EventEmitter {
  private service: BitChatBLEService | null = null;
  private isAdvertising: boolean = false;
  private isEnabled: boolean = false;
  private deviceName: string;
  private currentConnection: BLEConnection | null = null;
  private fragmentManager: FragmentManager;
  private binaryProtocol: BinaryProtocol;
  private state: string = 'unknown';

  constructor(options: BLETransportOptions = {}) {
    super();
    this.deviceName = options.deviceName || 'BitChat';
    this.fragmentManager = options.fragmentManager || new FragmentManager();
    this.binaryProtocol = options.binaryProtocol || new BinaryProtocol();

    // Set up bleno event handlers
    this.setupBlenoEvents();
  }

  private setupBlenoEvents(): void {
    bleno.on('stateChange', (state: string) => {
      console.log(`BLE state changed: ${state}`);
      this.state = state;
      this.emit('stateChange', state);

      if (state === 'poweredOn') {
        this.isEnabled = true;
        this.startAdvertising();
      } else {
        this.isEnabled = false;
        this.stopAdvertising();
      }
    });

    bleno.on('advertisingStart', (error?: Error) => {
      if (error) {
        console.error('BLE advertising start error:', error);
        this.emit('error', error);
        return;
      }

      console.log('BLE advertising started');
      this.isAdvertising = true;
      
      // Set up the service
      if (!this.service) {
        this.service = new BitChatBLEService(this);
        
        // Listen for incoming data
        this.on('data', (data: Buffer) => {
          this.handleIncomingData(data);
        });
      }

      bleno.setServices([this.service], (error?: Error) => {
        if (error) {
          console.error('BLE setServices error:', error);
          this.emit('error', error);
        } else {
          console.log('BLE services set successfully');
          this.emit('ready');
        }
      });
    });

    bleno.on('advertisingStop', () => {
      console.log('BLE advertising stopped');
      this.isAdvertising = false;
    });

    bleno.on('accept', (clientAddress: string) => {
      console.log(`BLE client connected: ${clientAddress}`);
      this.currentConnection = {
        address: clientAddress,
        connectedAt: new Date()
      };
      this.emit('connect', this.currentConnection);
    });

    bleno.on('disconnect', (clientAddress: string) => {
      console.log(`BLE client disconnected: ${clientAddress}`);
      this.currentConnection = null;
      this.emit('disconnect', clientAddress);
    });

    bleno.on('rssiUpdate', (rssi: number) => {
      if (this.currentConnection) {
        this.currentConnection.rssi = rssi;
        this.emit('rssiUpdate', rssi);
      }
    });
  }

  /**
   * Start BLE transport
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state === 'poweredOn') {
        this.startAdvertising();
        resolve();
      } else {
        // Wait for power on
        const timeout = setTimeout(() => {
          reject(new Error('BLE failed to power on'));
        }, 5000);

        const stateHandler = (state: string) => {
          if (state === 'poweredOn') {
            clearTimeout(timeout);
            this.removeListener('stateChange', stateHandler);
            resolve();
          }
        };

        this.on('stateChange', stateHandler);
      }
    });
  }

  /**
   * Stop BLE transport
   */
  async stop(): Promise<void> {
    this.stopAdvertising();
    if (this.currentConnection) {
      bleno.disconnect();
    }
  }

  /**
   * Start advertising
   */
  private startAdvertising(): void {
    if (!this.isEnabled || this.isAdvertising) {
      return;
    }

    const advertisementData = Buffer.from([
      0x02, 0x01, 0x06, // Flags
      0x03, 0x03, 0x12, 0x34, // Service UUID (partial)
      this.deviceName.length + 1, 0x09, // Local name
      ...Buffer.from(this.deviceName, 'utf8')
    ]);

    bleno.startAdvertising(this.deviceName, [], (error?: Error) => {
      if (error) {
        console.error('BLE advertising error:', error);
        this.emit('error', error);
      }
    });
  }

  /**
   * Stop advertising
   */
  private stopAdvertising(): void {
    if (this.isAdvertising) {
      bleno.stopAdvertising();
    }
  }

  /**
   * Send data to connected peer
   */
  async sendData(data: Buffer): Promise<boolean> {
    if (!this.service || !this.currentConnection) {
      return false;
    }

    try {
      // Fragment if necessary
      const fragments = this.fragmentData(data);
      
      for (const fragment of fragments) {
        const success = this.service.sendData(fragment);
        if (!success) {
          return false;
        }
        
        // Small delay between fragments to avoid overwhelming the connection
        if (fragments.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      return true;
    } catch (error) {
      console.error('BLE send error:', error);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Handle incoming data from BLE
   */
  private handleIncomingData(data: Buffer): void {
    try {
      // Emit raw data for protocol layer to handle
      this.emit('rawData', data);
      
      // Try to decode as BitChat packet
      try {
        const packet = this.binaryProtocol.decode(data);
        this.emit('packet', packet);
      } catch (error) {
        // Not a valid packet, might be a fragment
        console.debug('BLE received non-packet data, might be fragment');
      }
    } catch (error) {
      console.error('BLE data handling error:', error);
      this.emit('error', error);
    }
  }

  /**
   * Fragment data for BLE transmission
   */
  private fragmentData(data: Buffer): Buffer[] {
    if (data.length <= BLE_MTU) {
      return [data];
    }

    const fragments: Buffer[] = [];
    let offset = 0;

    while (offset < data.length) {
      const fragmentSize = Math.min(BLE_MTU, data.length - offset);
      fragments.push(data.slice(offset, offset + fragmentSize));
      offset += fragmentSize;
    }

    return fragments;
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): {
    isEnabled: boolean;
    isAdvertising: boolean;
    isConnected: boolean;
    connection: BLEConnection | null;
  } {
    return {
      isEnabled: this.isEnabled,
      isAdvertising: this.isAdvertising,
      isConnected: !!this.currentConnection,
      connection: this.currentConnection
    };
  }

  /**
   * Update RSSI for current connection
   */
  updateRSSI(): void {
    if (this.currentConnection) {
      bleno.updateRssi();
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
  }
}