import * as bleno from '@abandonware/bleno';
import { EventEmitter } from 'events';
import { BLE_SERVICE_UUID } from '../../../shared/constants';
import { WriteCharacteristic, NotifyCharacteristic } from './BLECharacteristics';

/**
 * BitChat BLE Service
 * Provides read/write characteristics for peer communication
 */
export class BitChatBLEService extends bleno.PrimaryService {
  private writeCharacteristic: WriteCharacteristic;
  private notifyCharacteristic: NotifyCharacteristic;
  private emitter: EventEmitter;

  constructor(emitter: EventEmitter) {
    const writeChar = new WriteCharacteristic(emitter);
    const notifyChar = new NotifyCharacteristic();

    super({
      uuid: BLE_SERVICE_UUID.replace(/-/g, ''),
      characteristics: [writeChar, notifyChar]
    });

    this.writeCharacteristic = writeChar;
    this.notifyCharacteristic = notifyChar;
    this.emitter = emitter;
  }

  /**
   * Send data to connected central device
   */
  sendData(data: Buffer): boolean {
    return this.notifyCharacteristic.sendData(data);
  }

  /**
   * Check if a client is subscribed to notifications
   */
  hasSubscriber(): boolean {
    return this.notifyCharacteristic.isClientSubscribed();
  }
}