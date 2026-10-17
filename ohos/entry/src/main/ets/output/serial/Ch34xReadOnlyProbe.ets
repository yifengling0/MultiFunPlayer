import usbManager from '@ohos.usbManager';
import { SerialOwnershipLease } from './SerialOwnershipLease';
import { isCh34xUart, parseCh34xUart, ch34xVersionSupported } from './Ch34xProtocol';
import { SerialProbeError } from './SerialProbeTypes';
import type { SerialProbeReport } from './SerialProbeTypes';
/** Explicit user diagnostic only. Exactly one vendor IN version query; no init,
 * baud/line changes, bulk traffic or force takeover. A watchdog never cancels I/O. */
export async function probeCh34xReadOnly(name: string, isCurrent: () => boolean): Promise<SerialProbeReport> {
  if (name.length < 1 || name.length > 1024 || !isCurrent()) { throw new SerialProbeError('invalidSerialProbe', true); }
  const lease: SerialOwnershipLease = new SerialOwnershipLease();
  try { lease.acquire(); } catch { throw new SerialProbeError('serialAlreadyOwned', true); }
  let quarantined: boolean = false;
  let timer: number = -1;
  const live = (): void => { if (quarantined || !isCurrent()) { throw new Error('serialProbeCancelled'); } };
  const operation = async (): Promise<SerialProbeReport> => {
    let pipe: usbManager.USBDevicePipe | null = null;
    let claimed: usbManager.USBInterface | null = null;
    try {
      live();
      const matches: usbManager.USBDevice[] = usbManager.getDevices().filter(device => device.name === name && isCh34xUart(device.vendorId, device.productId));
      if (matches.length !== 1 || matches[0].configs.length !== 1 || matches[0].configs[0].interfaces.length !== 1) { throw new Error('unsupportedCh34xDevice'); }
      const device: usbManager.USBDevice = matches[0];
      const iface: usbManager.USBInterface = device.configs[0].interfaces[0];
      if (iface.clazz !== 255 || iface.alternateSetting !== 0) { throw new Error('unsupportedCh34xInterface'); }
      if (!usbManager.hasRight(name) && !await usbManager.requestRight(name)) { throw new Error('usbPermissionDenied'); }
      live();
      pipe = usbManager.connectDevice(device);
      const raw: Uint8Array = usbManager.getRawDescriptor(pipe);
      const selected = parseCh34xUart(raw, device.vendorId, device.productId);
      if (selected.configuration !== device.configs[0].id || selected.interfaceId !== iface.id) { throw new Error('ch34xDescriptorMismatch'); }
      // Cross-check reported subclass/protocol against the actual interface bytes.
      let matched: boolean = false;
      for (let offset: number = 0; offset < raw.length; offset += raw[offset]) {
        if (raw[offset + 1] === 4 && raw[offset + 2] === iface.id) {
          matched = raw[offset + 5] === iface.clazz && raw[offset + 6] === iface.subClass && raw[offset + 7] === iface.protocol;
        }
      }
      if (!matched) { throw new Error('ch34xDescriptorMismatch'); }
      live();
      if (usbManager.claimInterface(pipe, iface, false) !== 0) { throw new Error('usbInterfaceBusy'); }
      claimed = iface;
      const bytes: Uint8Array = new Uint8Array(2);
      const count: number = await usbManager.usbControlTransfer(pipe, { bmRequestType: 0xc0, bRequest: 0x5f, wValue: 0, wIndex: 0, wLength: 2, data: bytes }, 250);
      live();
      if (count !== 2) { throw new Error('serialProbeVersionReadFailed'); }
      return { status: 'success', closeConfirmed: true, quarantined: false, diagnosticCode: null, readOnly: true, vendorId: device.vendorId, productId: device.productId,
        configuration: selected.configuration, interfaceId: iface.id, interfaceClass: iface.clazz,
        interfaceSubclass: iface.subClass, interfaceProtocol: iface.protocol,
        inputAddress: selected.inputAddress, outputAddress: selected.outputAddress,
        inputPacketSize: selected.inputPacketSize, outputPacketSize: selected.outputPacketSize,
        version: bytes[0], versionExtra: bytes[1], versionSupported: ch34xVersionSupported(bytes),
        api18TransfersPresent: typeof usbManager.usbSubmitTransfer === 'function' && typeof usbManager.usbCancelTransfer === 'function' };
    } finally {
      let confirmed: boolean = true;
      if (pipe !== null) {
        if (claimed !== null) { try { if (usbManager.releaseInterface(pipe, claimed) !== 0) { confirmed = false; } } catch { confirmed = false; } }
        try { if (usbManager.closePipe(pipe) !== 0) { confirmed = false; } } catch { confirmed = false; }
      }
      if (!confirmed) { quarantined = true; throw new Error('serialProbeCloseUnconfirmed'); }
      if (!quarantined) { lease.releaseConfirmed(); }
    }
  };
  const watchdog: Promise<SerialProbeReport> = new Promise<SerialProbeReport>((resolve, reject): void => {
    timer = setTimeout((): void => { quarantined = true; reject(new Error('serialProbeTimedOutQuarantined')); }, 15000);
  });
  try { return await Promise.race([operation(), watchdog]); }
  catch (error) {
    const allowed: string[] = ['serialProbeCancelled', 'unsupportedCh34xDevice', 'unsupportedCh34xInterface', 'usbPermissionDenied', 'ch34xDescriptorMismatch', 'usbInterfaceBusy', 'serialProbeVersionReadFailed', 'serialProbeCloseUnconfirmed', 'serialProbeTimedOutQuarantined'];
    const code: string = error instanceof Error && allowed.indexOf(error.message) >= 0 ? error.message : 'serialProbeFailed';
    throw new SerialProbeError(code, !quarantined);
  }
  finally { clearTimeout(timer); }
}
