// API-26 island: only dynamically imported after the API-20-safe runtime gate.
import uiMaterial from '@ohos.arkui.uiMaterial';
import { ImmersiveMaterialAdapter, ImmersiveMaterialCleanupError } from './ImmersiveMaterialContract';

function knownMaterialLevel(level: number): boolean {
  return level === uiMaterial.MaterialLevel.EXQUISITE || level === uiMaterial.MaterialLevel.GENTLE ||
    level === uiMaterial.MaterialLevel.SMOOTH;
}

class NativeImmersiveMaterialAdapter implements ImmersiveMaterialAdapter {
  materialLevel: number;
  private regular: uiMaterial.ImmersiveMaterial;
  private thick: uiMaterial.ImmersiveMaterial;
  private ultraThin: uiMaterial.ImmersiveMaterial;

  constructor(level: number) {
    // Preserve the system's actual level; there is no app-selected device tier.
    this.materialLevel = level;
    this.regular = new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.REGULAR,
      materialColor: Color.Transparent, colorInvert: false, interactive: true, lightEffect: { color: Color.White } });
    this.thick = new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.THICK,
      materialColor: Color.Transparent, colorInvert: false, interactive: false });
    this.ultraThin = new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.ULTRA_THIN,
      materialColor: Color.Transparent, colorInvert: false, interactive: true, lightEffect: { color: Color.White } });
  }

  applySelect(instance: SelectAttribute): void {
    // Check both methods before touching either one. Partially implemented or
    // unavailable bindings fail closed to the complete ordinary Select surface.
    if (typeof instance.systemMaterial !== 'function' || typeof instance.menuSystemMaterial !== 'function') {
      throw new Error('Native Select material binding unavailable');
    }
    try {
      instance.systemMaterial(this.regular);
      instance.menuSystemMaterial(this.thick);
    } catch (error) {
      let cleared: boolean = true;
      try { instance.systemMaterial(uiMaterial.Material.empty); } catch (ignored) { cleared = false; }
      try { instance.menuSystemMaterial(uiMaterial.Material.empty); } catch (ignored) { cleared = false; }
      if (!cleared) { throw new ImmersiveMaterialCleanupError(); }
      throw new Error('Native Select material unavailable');
    }
  }
  applyToggle(instance: ToggleAttribute): void {
    if (typeof instance.systemMaterial !== 'function') { throw new Error('Native Toggle material binding unavailable'); }
    try { instance.systemMaterial(this.ultraThin); } catch (error) {
      try { instance.systemMaterial(uiMaterial.Material.empty); } catch (ignored) { throw new ImmersiveMaterialCleanupError(); }
      throw new Error('Native Toggle material unavailable');
    }
  }
  applySlider(instance: SliderAttribute): void {
    if (typeof instance.systemMaterial !== 'function') { throw new Error('Native Slider material binding unavailable'); }
    try { instance.systemMaterial(this.ultraThin); } catch (error) {
      try { instance.systemMaterial(uiMaterial.Material.empty); } catch (ignored) { throw new ImmersiveMaterialCleanupError(); }
      throw new Error('Native Slider material unavailable');
    }
  }

  decorateDialog(options: AlertDialogParamWithButtons): AlertDialogParamWithButtons {
    // Explicit surface customization wins. Never silently discard a caller style
    // or combine opaque colors, borders, blur, and shadows with system material.
    if (options.backgroundColor !== undefined || options.backgroundBlurStyle !== undefined ||
      options.backgroundBlurStyleOptions !== undefined || options.backgroundEffect !== undefined ||
      options.borderWidth !== undefined || options.borderColor !== undefined || options.shadow !== undefined ||
      options.systemMaterial !== undefined) { return options; }
    options.systemMaterial = this.thick;
    return options;
  }
  decorateCustomDialog(options: CustomDialogControllerOptions): CustomDialogControllerOptions {
    if (options.backgroundColor !== undefined || options.backgroundBlurStyle !== undefined ||
      options.backgroundBlurStyleOptions !== undefined || options.backgroundEffect !== undefined ||
      options.borderWidth !== undefined || options.borderColor !== undefined || options.shadow !== undefined ||
      options.systemMaterial !== undefined) { return options; }
    // Only the surface changes; builder/cancel/onWillDismiss preserve identity.
    options.systemMaterial = this.thick;
    return options;
  }
}

export function createImmersiveMaterialAdapter(): ImmersiveMaterialAdapter | undefined {
  if (uiMaterial.isImmersiveMaterialSupported() !== true) { return undefined; }
  const level: number = uiMaterial.getGlobalMaterialLevel();
  if (!knownMaterialLevel(level)) { return undefined; }
  return new NativeImmersiveMaterialAdapter(level);
}
