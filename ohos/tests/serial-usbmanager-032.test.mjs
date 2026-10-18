import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../entry/src/main/ets/components/OutputSettingsPanel.ets', import.meta.url), 'utf8');
const backend19 = readFileSync(new URL('../entry/src/main/ets/output/serial/OfficialSerial19Backend.ets', import.meta.url), 'utf8');
const factory = readFileSync(new URL('../entry/src/main/ets/output/serial/NativeSerialFactory.ets', import.meta.url), 'utf8');

test('usbManager.serial backend is the public API 19 route with explicit runtime authorization', () => {
  assert.match(backend19, /from '@ohos\.usbManager\.serial'/);
  assert.match(backend19, /getPortList\(\)/);
  assert.match(backend19, /hasSerialRight\(this\.portId\)/);
  assert.match(backend19, /requestSerialRight\(this\.portId\)/);
  assert.match(backend19, /legacySerial\.setAttribute\(this\.portId/);
  assert.match(backend19, /legacySerial\.read\(this\.portId/);
  assert.match(backend19, /legacySerial\.write\(this\.portId/);
  assert.match(factory, /SystemCapability\.USB\.USBManager\.Serial/);
  assert.match(factory, /SystemCapability\.BusManager\.Serial/);
});

test('switching to usbManager.serial clears unsupported inherited DTR/RTS instead of leaving a hidden blocker', () => {
  assert.match(panel, /if \(value === 'official19'\) \{ this\.serial\.dtr = null; this\.serial\.rts = null; \}/);
  assert.match(panel, /系统串口 19 · usbManager/);
  assert.match(panel, /系统串口 26 · busManager/);
});

test('serial capability diagnostics log only backend names and availability', () => {
  assert.match(factory, /console\.info\('\[MFP serial\] '/);
  assert.doesNotMatch(factory.slice(factory.indexOf('[MFP serial]'), factory.indexOf('[MFP serial]') + 300), /portName|deviceName|serialNumber|host/i);
});
