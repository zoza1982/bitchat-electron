import { WriteCharacteristic, NotifyCharacteristic } from '../../../../src/main/transport/ble/BLECharacteristics';
import { EventEmitter } from 'events';

// Mock bleno module
jest.mock('@abandonware/bleno', () => ({
  Characteristic: class MockCharacteristic {
    static RESULT_SUCCESS = 0;
    static RESULT_INVALID_OFFSET = 1;
    static RESULT_UNLIKELY_ERROR = 2;
    
    constructor(public options: any) {}
  }
}));

describe('BLECharacteristics', () => {
  describe('WriteCharacteristic', () => {
    let emitter: EventEmitter;
    let writeChar: WriteCharacteristic;

    beforeEach(() => {
      emitter = new EventEmitter();
      writeChar = new WriteCharacteristic(emitter);
    });

    it('should be created with correct properties', () => {
      expect(writeChar.options.uuid).toBe('123456781234567812345678ABCDEF1');
      expect(writeChar.options.properties).toEqual(['write', 'writeWithoutResponse']);
      expect(writeChar.options.value).toBeNull();
    });

    it('should emit data on successful write', (done) => {
      const testData = Buffer.from('test data');
      
      emitter.on('data', (data) => {
        expect(data).toEqual(testData);
        done();
      });

      const callback = jest.fn();
      writeChar.onWriteRequest(testData, 0, false, callback);
      
      expect(callback).toHaveBeenCalledWith(0); // RESULT_SUCCESS
    });

    it('should reject writes with offset', () => {
      const callback = jest.fn();
      writeChar.onWriteRequest(Buffer.from('test'), 10, false, callback);
      
      expect(callback).toHaveBeenCalledWith(1); // RESULT_INVALID_OFFSET
    });

    it('should handle errors gracefully', () => {
      // Make emit throw an error
      emitter.emit = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      const callback = jest.fn();
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      
      writeChar.onWriteRequest(Buffer.from('test'), 0, false, callback);
      
      expect(callback).toHaveBeenCalledWith(2); // RESULT_UNLIKELY_ERROR
      expect(consoleError).toHaveBeenCalled();
      
      consoleError.mockRestore();
    });
  });

  describe('NotifyCharacteristic', () => {
    let notifyChar: NotifyCharacteristic;

    beforeEach(() => {
      notifyChar = new NotifyCharacteristic();
    });

    it('should be created with correct properties', () => {
      expect(notifyChar.options.uuid).toBe('123456781234567812345678ABCDEF2');
      expect(notifyChar.options.properties).toEqual(['notify', 'indicate']);
      expect(notifyChar.options.value).toBeNull();
    });

    it('should handle subscription', () => {
      const updateCallback = jest.fn();
      const consoleLog = jest.spyOn(console, 'log').mockImplementation();
      
      notifyChar.onSubscribe(512, updateCallback);
      
      expect(notifyChar.isClientSubscribed()).toBe(true);
      expect(consoleLog).toHaveBeenCalledWith('BLE client subscribed to notifications');
      
      consoleLog.mockRestore();
    });

    it('should handle unsubscription', () => {
      const updateCallback = jest.fn();
      const consoleLog = jest.spyOn(console, 'log').mockImplementation();
      
      notifyChar.onSubscribe(512, updateCallback);
      notifyChar.onUnsubscribe();
      
      expect(notifyChar.isClientSubscribed()).toBe(false);
      expect(consoleLog).toHaveBeenCalledWith('BLE client unsubscribed from notifications');
      
      consoleLog.mockRestore();
    });

    it('should send data when subscribed', () => {
      const updateCallback = jest.fn();
      const testData = Buffer.from('test notification');
      
      notifyChar.onSubscribe(512, updateCallback);
      const result = notifyChar.sendData(testData);
      
      expect(result).toBe(true);
      expect(updateCallback).toHaveBeenCalledWith(testData);
    });

    it('should not send data when not subscribed', () => {
      const testData = Buffer.from('test notification');
      const result = notifyChar.sendData(testData);
      
      expect(result).toBe(false);
    });

    it('should handle send errors gracefully', () => {
      const updateCallback = jest.fn().mockImplementation(() => {
        throw new Error('Send error');
      });
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      
      notifyChar.onSubscribe(512, updateCallback);
      const result = notifyChar.sendData(Buffer.from('test'));
      
      expect(result).toBe(false);
      expect(consoleError).toHaveBeenCalled();
      
      consoleError.mockRestore();
    });
  });
});