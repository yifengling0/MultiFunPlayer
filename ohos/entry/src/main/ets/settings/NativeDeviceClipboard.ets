import { pasteboard } from '@kit.BasicServicesKit';
import { DeviceClipboardPort } from '../core/DeviceProfileTransfer';

/** API 26 official pasteboard. Read only within a successful secure PasteButton gesture. */
export class NativeDeviceClipboard implements DeviceClipboardPort {
  async readText(): Promise<string> {
    const data: pasteboard.PasteData = await pasteboard.getSystemPasteboard().getData();
    return data.getPrimaryText();
  }
  async writeText(text: string): Promise<void> {
    await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text));
  }
}
