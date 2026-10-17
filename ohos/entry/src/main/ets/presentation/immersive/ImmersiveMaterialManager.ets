import deviceInfo from '@ohos.deviceInfo';
import { ImmersiveMaterialAdapter, ImmersiveMaterialStatus, ImmersiveMaterialCleanupError } from './ImmersiveMaterialContract';

/** The SDK package maps apiVersion 26 to platformVersion 26.0.0. sdkApiVersion
 * is the numeric API level (deviceInfo, since 6), not a dotted OS/build number.
 * Newer runtimes still have to pass module loading and the native capability probe.
 * Do not use apiAvailable here: that function itself was introduced in API 26. */
export function supportsImmersiveMaterialModule(runtimeApi: number): boolean {
  return Number.isFinite(runtimeApi) && Number.isInteger(runtimeApi) && runtimeApi >= 26;
}

export class ImmersiveMaterialManager {
  static readonly revisionKey: string = 'mfpImmersiveMaterialRevision';
  private static generation: number = 0;
  private static revision: number = 0;
  private static adapter: ImmersiveMaterialAdapter | undefined = undefined;
  private static uncertainControl: SelectAttribute | ToggleAttribute | SliderAttribute | undefined = undefined;
  private static pending: Promise<ImmersiveMaterialStatus> | undefined = undefined;
  private static current: ImmersiveMaterialStatus = new ImmersiveMaterialStatus('uninitialized');

  static status(): ImmersiveMaterialStatus {
    return new ImmersiveMaterialStatus(ImmersiveMaterialManager.current.state,
      ImmersiveMaterialManager.current.runtimeApi, ImmersiveMaterialManager.current.materialLevel);
  }

  private static publish(status: ImmersiveMaterialStatus): void {
    ImmersiveMaterialManager.current = status;
    ImmersiveMaterialManager.revision++;
    AppStorage.setOrCreate<number>(ImmersiveMaterialManager.revisionKey, ImmersiveMaterialManager.revision);
  }

  private static async loadAdapter(): Promise<ImmersiveMaterialAdapter | undefined> {
    // This is the only route into the file that imports @ohos.arkui.uiMaterial.
    const native = await import('./NativeImmersiveMaterialApi26');
    return native.createImmersiveMaterialAdapter();
  }

  static initialize(): Promise<ImmersiveMaterialStatus> {
    if (ImmersiveMaterialManager.pending !== undefined) { return ImmersiveMaterialManager.pending; }
    if (ImmersiveMaterialManager.current.state !== 'uninitialized') {
      return Promise.resolve(ImmersiveMaterialManager.status());
    }
    let runtimeApi: number = 0;
    try { runtimeApi = deviceInfo.sdkApiVersion; } catch (error) {}
    if (!supportsImmersiveMaterialModule(runtimeApi)) {
      ImmersiveMaterialManager.publish(new ImmersiveMaterialStatus('unsupported-runtime', runtimeApi));
      return Promise.resolve(ImmersiveMaterialManager.status());
    }
    const generation: number = ImmersiveMaterialManager.generation;
    ImmersiveMaterialManager.current = new ImmersiveMaterialStatus('loading', runtimeApi);
    const loading: Promise<ImmersiveMaterialStatus> = ImmersiveMaterialManager.loadAdapter()
      .then((adapter: ImmersiveMaterialAdapter | undefined): ImmersiveMaterialStatus => {
        if (generation !== ImmersiveMaterialManager.generation) { return ImmersiveMaterialManager.status(); }
        ImmersiveMaterialManager.adapter = adapter;
        ImmersiveMaterialManager.publish(new ImmersiveMaterialStatus(
          adapter === undefined ? 'unsupported-device' : 'available', runtimeApi,
          adapter === undefined ? undefined : adapter.materialLevel));
        return ImmersiveMaterialManager.status();
      }).catch((): ImmersiveMaterialStatus => {
        if (generation === ImmersiveMaterialManager.generation) {
          ImmersiveMaterialManager.adapter = undefined;
          ImmersiveMaterialManager.publish(new ImmersiveMaterialStatus('unavailable', runtimeApi));
        }
        return ImmersiveMaterialManager.status();
      }).finally((): void => {
        if (generation === ImmersiveMaterialManager.generation) { ImmersiveMaterialManager.pending = undefined; }
      });
    ImmersiveMaterialManager.pending = loading;
    return loading;
  }

  /** Lifecycle/test invalidation only; this never changes media or output state. */
  static reset(): void {
    ImmersiveMaterialManager.generation++;
    ImmersiveMaterialManager.adapter = undefined;
    ImmersiveMaterialManager.uncertainControl = undefined;
    ImmersiveMaterialManager.pending = undefined;
    ImmersiveMaterialManager.publish(new ImmersiveMaterialStatus('uninitialized'));
  }

  private static failed(state: string = 'unavailable'): void {
    ImmersiveMaterialManager.adapter = undefined;
    if (ImmersiveMaterialManager.current.state === state) { return; }
    ImmersiveMaterialManager.publish(new ImmersiveMaterialStatus(state,
      ImmersiveMaterialManager.current.runtimeApi));
  }

  private static failedControl(error: Error, instance: SelectAttribute | ToggleAttribute | SliderAttribute): string {
    if (error instanceof ImmersiveMaterialCleanupError) {
      ImmersiveMaterialManager.uncertainControl = instance;
      ImmersiveMaterialManager.failed('visual-unconfirmed');
      return 'unconfirmed';
    }
    ImmersiveMaterialManager.failed();
    return 'fallback';
  }

  static applySelect(instance: SelectAttribute): string {
    if (instance === ImmersiveMaterialManager.uncertainControl) { return 'unconfirmed'; }
    const adapter = ImmersiveMaterialManager.adapter;
    if (adapter === undefined) { return 'fallback'; }
    try { adapter.applySelect(instance); return 'applied'; } catch (error) {
      return ImmersiveMaterialManager.failedControl(error as Error, instance);
    }
  }
  static applyToggle(instance: ToggleAttribute): string {
    if (instance === ImmersiveMaterialManager.uncertainControl) { return 'unconfirmed'; }
    const adapter = ImmersiveMaterialManager.adapter;
    if (adapter === undefined) { return 'fallback'; }
    try { adapter.applyToggle(instance); return 'applied'; } catch (error) {
      return ImmersiveMaterialManager.failedControl(error as Error, instance);
    }
  }
  static applySlider(instance: SliderAttribute): string {
    if (instance === ImmersiveMaterialManager.uncertainControl) { return 'unconfirmed'; }
    const adapter = ImmersiveMaterialManager.adapter;
    if (adapter === undefined) { return 'fallback'; }
    try { adapter.applySlider(instance); return 'applied'; } catch (error) {
      return ImmersiveMaterialManager.failedControl(error as Error, instance);
    }
  }
  /** Decorates a fresh caller-owned options object in place. Never reuse it. */
  static decorateDialog(options: AlertDialogParamWithButtons): AlertDialogParamWithButtons {
    const adapter = ImmersiveMaterialManager.adapter;
    if (adapter === undefined) { return options; }
    try { return adapter.decorateDialog(options); } catch (error) { ImmersiveMaterialManager.failed(); return options; }
  }
  /** Only systemMaterial may be assigned; builder and lifecycle callbacks are untouched. */
  static decorateCustomDialog(options: CustomDialogControllerOptions): CustomDialogControllerOptions {
    const adapter = ImmersiveMaterialManager.adapter;
    if (adapter === undefined) { return options; }
    try { return adapter.decorateCustomDialog(options); } catch (error) { ImmersiveMaterialManager.failed(); return options; }
  }
}
