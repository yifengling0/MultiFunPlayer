import test from 'node:test';
import assert from 'node:assert/strict';
import { usbVendorChip, usbVendorInitialization } from '../entry/src/main/ets/output/serial/UsbVendorProtocol.ts';

const attrs = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', handshake: 'none', dtr: true, rts: false };

test('CP210x profile uses usbManager vendor interface requests and split baud rate', () => {
  assert.equal(usbVendorChip(0x10c4, 0xea60), 'cp210x');
  const commands = usbVendorInitialization('cp210x', attrs);
  assert.deepEqual(commands.map(command => command.request), [0x00, 0x1e, 0x03, 0x07, 0x13]);
  assert.ok(commands.every(command => command.requestType === 0x41));
  assert.equal(commands[1].value, 115200 & 0xffff);
  assert.equal(commands[1].index, 115200 >>> 16);
  assert.equal(commands[2].value, 0x0008);
  assert.equal(commands[3].value, 0x0301);
});

test('FTDI profile uses device vendor requests and a bounded divisor', () => {
  assert.equal(usbVendorChip(0x0403, 0x6001), 'ftdi');
  const commands = usbVendorInitialization('ftdi', attrs);
  assert.deepEqual(commands.map(command => command.request), [0x00, 0x03, 0x04, 0x02, 0x01, 0x09]);
  assert.ok(commands.every(command => command.requestType === 0x40));
  assert.equal(commands[1].value, Math.round(3000000 / 115200));
  assert.equal(commands[2].value, 0x0008);
  assert.equal(commands[4].value, 1);
});

test('vendor profiles reject unsupported framing and OS-managed control lines', () => {
  assert.throws(() => usbVendorInitialization('cp210x', { ...attrs, dataBits: 7 }));
  assert.throws(() => usbVendorInitialization('ftdi', { ...attrs, baudRate: 115 }));
  assert.throws(() => usbVendorInitialization('cp210x', { ...attrs, dtr: null }));
  assert.equal(usbVendorChip(0x1234, 0x5678), null);
});
