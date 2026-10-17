import { systemDateTime } from '@kit.BasicServicesKit';
import { SerialOwnershipLease } from './SerialOwnershipLease';
import { SerialTransport } from './SerialTransport';
import type { SerialAttributes, SerialBackend, SerialClock, SerialLimits } from './SerialTransport';
import type { SerialBackendKind, SerialSelection, SerialPortOption } from './SerialDiscoveryTypes';
import { SerialProbeError } from './SerialProbeTypes';
import type { SerialProbeReport } from './SerialProbeTypes';
export type { SerialBackendKind, SerialSelection, SerialPortOption } from './SerialDiscoveryTypes';
export { SerialProbeError } from './SerialProbeTypes';
export type { SerialProbeReport } from './SerialProbeTypes';
export interface SerialCapability { backend: SerialBackendKind; available: boolean; controlLines: boolean; diagnostic: string; automaticConnection: false; deviceExecutionAck: false; }
class PlatformSerialClock implements SerialClock {
  nowMs(): number { return systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, false); }
  schedule(callback: () => void, delayMs: number): number { return setTimeout(callback, delayMs); }
  cancel(id: number): void { clearTimeout(id); }
}
/** Does not enumerate devices, request permission, instantiate handles or register
 * native admission. Integrator must explicitly register only this factory's port
 * with the shared output admission registry, then retain session Connect/Arm gates.
 * Dynamic imports avoid loading an unsupported native serial module on phone.
 */
export class NativeSerialFactory {
  inspect(backend: SerialBackendKind): SerialCapability {
    // SDK26 flags=0 is documented SHORT_NOT_OK. OpenHarmony master ignores
    // flags, but that is not a commercial HarmonyOS compatibility guarantee.
    // Keep CDC non-admissible until short-packet semantics are verified.
    if (backend === 'ch34xWriteOnly') {
      let supported: boolean = false;
      try { supported = canIUse('SystemCapability.USB.USBManager'); } catch { supported = false; }
      return { backend: backend, available: supported, controlLines: true, diagnostic: supported ? 'experimentalWriteOnlyNotDeviceVerified' : 'unsupportedSystemCapability', automaticConnection: false, deviceExecutionAck: false };
    }
    if (backend === 'usbCdc') { return { backend: backend, available: false, controlLines: true,
      diagnostic: 'cdcShortPacketContractUnverified', automaticConnection: false, deviceExecutionAck: false }; }
    let available: boolean = false;
    try {
      available = backend === 'official26' ? canIUse('SystemCapability.BusManager.Serial') :
        backend === 'official19' ? canIUse('SystemCapability.USB.USBManager.Serial') :
          canIUse('SystemCapability.USB.USBManager');
    } catch { available = false; }
    return { backend: backend, available: available, controlLines: backend !== 'official19',
      diagnostic: available ? 'capabilityPresentNotDeviceVerified' : 'unsupportedSystemCapability', automaticConnection: false, deviceExecutionAck: false };
  }
  inspectAll(): SerialCapability[] { return [this.inspect('official26'), this.inspect('official19'), this.inspect('ch34xWriteOnly'), this.inspect('usbCdc')]; }
  /** Explicit refresh only. Never request a right or open a device here. */
  async listPortsExplicit(backend: SerialBackendKind): Promise<SerialPortOption[]> {
    if (backend === 'official19' && this.inspect(backend).available) {
      const module = await import('./OfficialSerial19Backend'); return this.boundedOptions(module.listOfficial19Ports());
    }
    if (backend === 'official26' && this.inspect(backend).available) {
      const module = await import('./OfficialSerial26Backend'); return this.boundedOptions(await module.listOfficial26Ports());
    }
    if (backend === 'ch34xWriteOnly' && canIUse('SystemCapability.USB.USBManager')) {
      const module = await import('./Ch34xWriteOnlyBackend'); return this.boundedOptions(module.listCh34xPorts());
    }
    return [];
  }
  /** User-clicked diagnostic only; does not make CH34x output available. */
  async probeReadOnly(selection: SerialSelection, isCurrent: () => boolean): Promise<SerialProbeReport> {
    if (selection.backend !== 'ch34xWriteOnly' || !canIUse('SystemCapability.USB.USBManager') || !isCurrent()) { throw new SerialProbeError('unsupportedSerialProbe', true); }
    try {
      const module = await import('./Ch34xReadOnlyProbe');
      return await module.probeCh34xReadOnly(selection.portName, isCurrent);
    } catch (error) {
      if (error instanceof SerialProbeError) { throw error; }
      throw new SerialProbeError('serialProbeUnavailable', false);
    }
  }
  private boundedOptions(options: SerialPortOption[]): SerialPortOption[] {
    return options.filter(option => option.portName.length > 0 && option.portName.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(option.portName))
      .slice(0, 64).map((option): SerialPortOption => ({ backend: option.backend, portName: option.portName,
        portId: option.portId, label: option.label.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 128),
        vendorId: option.vendorId, productId: option.productId, writeOnly: option.writeOnly, controlLines: option.controlLines }));
  }
  async create(selection: SerialSelection, attributes: SerialAttributes, limits: SerialLimits): Promise<SerialTransport> {
    if (selection.backend !== 'official19' && selection.backend !== 'official26' && selection.backend !== 'usbCdc' && selection.backend !== 'ch34xWriteOnly') { throw new Error('invalidSerialBackend'); }
    if (selection.backend === 'official19' ? (!Number.isSafeInteger(selection.portId) || selection.portId < 0) : (selection.portName.length < 1 || selection.portName.length > 1024)) { throw new Error('invalidSerialSelection'); }
    if (!this.inspect(selection.backend).available) { throw new Error('unsupportedSystemCapability'); }
    let backend: SerialBackend;
    if (selection.backend === 'official26') {
      const module = await import('./OfficialSerial26Backend'); backend = new module.OfficialSerial26Backend(selection.portName);
    } else if (selection.backend === 'official19') {
      const module = await import('./OfficialSerial19Backend'); backend = new module.OfficialSerial19Backend(selection.portId, selection.portName);
    } else if (selection.backend === 'ch34xWriteOnly') {
      const module = await import('./Ch34xWriteOnlyBackend'); if (!module.ch34xTransfersAvailable()) { throw new Error('usbApi18TransfersUnavailable'); } backend = new module.Ch34xWriteOnlyBackend(selection.portName);
    } else {
      const module = await import('./UsbCdcBackend'); backend = new module.UsbCdcBackend(selection.portName);
    }
    return new SerialTransport(backend, attributes, limits, new PlatformSerialClock(), new SerialOwnershipLease());
  }
}
