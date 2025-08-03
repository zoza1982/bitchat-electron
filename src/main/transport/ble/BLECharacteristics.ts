import * as bleno from '@abandonware/bleno';
import { EventEmitter } from 'events';
import { BLE_CHARACTERISTICS } from '../../../shared/constants';

/**
 * Write Characteristic - Receives data from central devices
 */
export class WriteCharacteristic extends bleno.Characteristic {
  private emitter: EventEmitter;
  private buffer: Buffer = Buffer.alloc(0);

  constructor(emitter: EventEmitter) {
    super({
      uuid: BLE_CHARACTERISTICS.WRITE.replace(/-/g, ''),
      properties: ['write', 'writeWithoutResponse'],
      value: null
    });
    this.emitter = emitter;
  }

  onWriteRequest(
    data: Buffer,
    offset: number,
    withoutResponse: boolean,
    callback: (result: number) => void
  ): void {
    if (offset) {
      callback(bleno.Characteristic.RESULT_INVALID_OFFSET);
      return;
    }

    try {
      // Emit the received data
      this.emitter.emit('data', data);
      callback(bleno.Characteristic.RESULT_SUCCESS);
    } catch (error) {
      console.error('BLE Write error:', error);
      callback(bleno.Characteristic.RESULT_UNLIKELY_ERROR);
    }
  }
}

/**
 * Notify Characteristic - Sends data to central devices
 */
export class NotifyCharacteristic extends bleno.Characteristic {
  private updateCallback?: (data: Buffer) => void;
  private isSubscribed: boolean = false;

  constructor() {
    super({
      uuid: BLE_CHARACTERISTICS.NOTIFY.replace(/-/g, ''),
      properties: ['notify', 'indicate'],
      value: null
    });
  }

  onSubscribe(maxValueSize: number, updateValueCallback: (data: Buffer) => void): void {
    console.log('BLE client subscribed to notifications');
    this.updateCallback = updateValueCallback;
    this.isSubscribed = true;
  }

  onUnsubscribe(): void {
    console.log('BLE client unsubscribed from notifications');
    this.updateCallback = undefined;
    this.isSubscribed = false;
  }

  sendData(data: Buffer): boolean {
    if (!this.isSubscribed || !this.updateCallback) {
      return false;
    }

    try {
      this.updateCallback(data);
      return true;
    } catch (error) {
      console.error('BLE Notify error:', error);
      return false;
    }
  }

  isClientSubscribed(): boolean {
    return this.isSubscribed;
  }
}