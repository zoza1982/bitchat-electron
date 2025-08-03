import { BLETransport } from '../../../../src/main/transport/ble/BLETransport';
import { EventEmitter } from 'events';

// Create mock bleno
const mockBleno = new EventEmitter();
(mockBleno as any).startAdvertising = jest.fn((name, uuids, callback) => {
  if (callback) callback();
});
(mockBleno as any).stopAdvertising = jest.fn();
(mockBleno as any).setServices = jest.fn((services, callback) => {
  if (callback) callback();
});
(mockBleno as any).disconnect = jest.fn();
(mockBleno as any).updateRssi = jest.fn();

// Mock the bleno module
jest.mock('@abandonware/bleno', () => mockBleno);

describe('BLETransport', () => {
  let transport: BLETransport;

  beforeEach(() => {
    transport = new BLETransport({ deviceName: 'TestDevice' });
    jest.clearAllMocks();
  });

  afterEach(() => {
    transport.destroy();
    mockBleno.removeAllListeners();
  });

  describe('State Management', () => {
    it('should initialize with unknown state', () => {
      const status = transport.getConnectionStatus();
      expect(status.isEnabled).toBe(false);
      expect(status.isAdvertising).toBe(false);
      expect(status.isConnected).toBe(false);
    });

    it('should handle poweredOn state', (done) => {
      transport.on('stateChange', (state) => {
        if (state === 'poweredOn') {
          expect(transport.getConnectionStatus().isEnabled).toBe(true);
          done();
        }
      });

      mockBleno.emit('stateChange', 'poweredOn');
    });

    it('should handle poweredOff state', () => {
      mockBleno.emit('stateChange', 'poweredOn');
      mockBleno.emit('stateChange', 'poweredOff');

      expect(transport.getConnectionStatus().isEnabled).toBe(false);
      expect(mockBleno.stopAdvertising).toHaveBeenCalled();
    });
  });

  describe('Advertising', () => {
    beforeEach(() => {
      mockBleno.emit('stateChange', 'poweredOn');
    });

    it('should start advertising when powered on', (done) => {
      transport.on('ready', () => {
        expect(transport.getConnectionStatus().isAdvertising).toBe(true);
        expect(mockBleno.startAdvertising).toHaveBeenCalledWith(
          'TestDevice',
          [],
          expect.any(Function)
        );
        done();
      });

      mockBleno.emit('advertisingStart');
    });

    it('should handle advertising errors', (done) => {
      const error = new Error('Advertising failed');
      
      transport.on('error', (err) => {
        expect(err).toBe(error);
        done();
      });

      mockBleno.emit('advertisingStart', error);
    });

    it('should stop advertising', () => {
      mockBleno.emit('advertisingStart');
      mockBleno.emit('advertisingStop');

      expect(transport.getConnectionStatus().isAdvertising).toBe(false);
    });
  });

  describe('Connection Handling', () => {
    beforeEach(() => {
      mockBleno.emit('stateChange', 'poweredOn');
      mockBleno.emit('advertisingStart');
    });

    it('should handle client connection', (done) => {
      const clientAddress = '11:22:33:44:55:66';

      transport.on('connect', (connection) => {
        expect(connection.address).toBe(clientAddress);
        expect(connection.connectedAt).toBeInstanceOf(Date);
        expect(transport.getConnectionStatus().isConnected).toBe(true);
        done();
      });

      mockBleno.emit('accept', clientAddress);
    });

    it('should handle client disconnection', (done) => {
      const clientAddress = '11:22:33:44:55:66';

      mockBleno.emit('accept', clientAddress);

      transport.on('disconnect', (address) => {
        expect(address).toBe(clientAddress);
        expect(transport.getConnectionStatus().isConnected).toBe(false);
        done();
      });

      mockBleno.emit('disconnect', clientAddress);
    });

    it('should update RSSI', (done) => {
      const clientAddress = '11:22:33:44:55:66';
      const rssiValue = -65;

      mockBleno.emit('accept', clientAddress);

      transport.on('rssiUpdate', (rssi) => {
        expect(rssi).toBe(rssiValue);
        const status = transport.getConnectionStatus();
        expect(status.connection?.rssi).toBe(rssiValue);
        done();
      });

      mockBleno.emit('rssiUpdate', rssiValue);
    });
  });

  describe('Data Transmission', () => {
    let mockService: any;

    beforeEach(() => {
      mockBleno.emit('stateChange', 'poweredOn');
      
      // Capture the service when it's created
      (mockBleno.setServices as jest.Mock).mockImplementation((services, callback) => {
        mockService = services[0];
        mockService.sendData = jest.fn().mockReturnValue(true);
        if (callback) callback();
      });

      mockBleno.emit('advertisingStart');
      mockBleno.emit('accept', '11:22:33:44:55:66');
    });

    it('should send data when connected', async () => {
      const testData = Buffer.from('Hello BLE');
      
      const result = await transport.sendData(testData);
      
      expect(result).toBe(true);
      expect(mockService.sendData).toHaveBeenCalledWith(testData);
    });

    it('should fragment large data', async () => {
      const largeData = Buffer.alloc(1024, 0xFF); // Larger than BLE_MTU (512)
      
      const result = await transport.sendData(largeData);
      
      expect(result).toBe(true);
      expect(mockService.sendData).toHaveBeenCalledTimes(2); // Should be fragmented into 2 pieces
    });

    it('should not send data when not connected', async () => {
      mockBleno.emit('disconnect', '11:22:33:44:55:66');
      
      const result = await transport.sendData(Buffer.from('test'));
      
      expect(result).toBe(false);
    });

    it('should handle send failures', async () => {
      mockService.sendData = jest.fn().mockReturnValue(false);
      
      const result = await transport.sendData(Buffer.from('test'));
      
      expect(result).toBe(false);
    });
  });

  describe('Data Reception', () => {
    beforeEach(() => {
      mockBleno.emit('stateChange', 'poweredOn');
      mockBleno.emit('advertisingStart');
    });

    it('should emit raw data', (done) => {
      const testData = Buffer.from('Incoming data');

      transport.on('rawData', (data) => {
        expect(data).toEqual(testData);
        done();
      });

      // Simulate data reception by emitting on transport
      // (In real implementation, this would come from WriteCharacteristic)
      transport.emit('data', testData);
    });

    it('should handle data errors', (done) => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      transport.on('error', (error) => {
        expect(error).toBeInstanceOf(Error);
        consoleError.mockRestore();
        done();
      });

      // Force an error in data handling
      transport.on('rawData', () => {
        throw new Error('Data processing error');
      });

      transport.emit('data', Buffer.from('test'));
    });
  });

  describe('Lifecycle Management', () => {
    it('should start transport', async () => {
      const promise = transport.start();
      mockBleno.emit('stateChange', 'poweredOn');
      
      await expect(promise).resolves.toBeUndefined();
      expect(mockBleno.startAdvertising).toHaveBeenCalled();
    });

    it('should timeout if not powered on', async () => {
      await expect(transport.start()).rejects.toThrow('BLE failed to power on');
    }, 6000);

    it('should stop transport', async () => {
      mockBleno.emit('stateChange', 'poweredOn');
      mockBleno.emit('advertisingStart');
      mockBleno.emit('accept', '11:22:33:44:55:66');

      await transport.stop();

      expect(mockBleno.stopAdvertising).toHaveBeenCalled();
      expect(mockBleno.disconnect).toHaveBeenCalled();
    });

    it('should update RSSI on demand', () => {
      mockBleno.emit('stateChange', 'poweredOn');
      mockBleno.emit('accept', '11:22:33:44:55:66');

      transport.updateRSSI();

      expect(mockBleno.updateRssi).toHaveBeenCalled();
    });

    it('should clean up on destroy', () => {
      const stopSpy = jest.spyOn(transport, 'stop');
      const removeListenersSpy = jest.spyOn(transport, 'removeAllListeners');

      transport.destroy();

      expect(stopSpy).toHaveBeenCalled();
      expect(removeListenersSpy).toHaveBeenCalled();
    });
  });
});