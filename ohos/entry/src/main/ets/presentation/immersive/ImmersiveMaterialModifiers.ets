import { UiStyle } from '../UiStyle';
import { ImmersiveMaterialManager } from './ImmersiveMaterialManager';

/** Each modifier owns only its visual surface. The revision is deliberately a
 * constructor input: @StorageLink changes reapply styles without remounting the
 * control, replacing its callbacks, or rebuilding a media/navigation subtree.
 * The official ArkUI engine clears stage values after each ViewPU update and
 * resets omitted modifier properties in the following pass (ArkComponent.ts,
 * cleanStageValue/applyStage; pu_view.ts, observeComponentCreation2). This is a
 * source-level expectation, not device-rendering validation. Never layer the
 * fallback background/border/shadow over systemMaterial in the same pass. */
export class MfpSelectMaterialModifier implements AttributeModifier<SelectAttribute> {
  private revision: number;
  constructor(revision: number) { this.revision = revision; }
  applyNormalAttribute(instance: SelectAttribute): void {
    const result: string = ImmersiveMaterialManager.applySelect(instance);
    if (result === 'applied') {
      instance.borderRadius(UiStyle.radius);
      return;
    }
    if (result === 'unconfirmed') { return; }
    instance.backgroundColor(UiStyle.field).border({ width: 1, color: UiStyle.edge })
      .borderRadius(UiStyle.radius).menuBackgroundColor(UiStyle.field);
  }
}

export class MfpToggleMaterialModifier implements AttributeModifier<ToggleAttribute> {
  private revision: number;
  constructor(revision: number) { this.revision = revision; }
  applyNormalAttribute(instance: ToggleAttribute): void {
    if (ImmersiveMaterialManager.applyToggle(instance) === 'fallback') { instance.selectedColor(UiStyle.accent); }
  }
}

export class MfpSliderMaterialModifier implements AttributeModifier<SliderAttribute> {
  private revision: number;
  constructor(revision: number) { this.revision = revision; }
  applyNormalAttribute(instance: SliderAttribute): void {
    // Native track/thumb, value, gesture callbacks and caller colors are retained.
    ImmersiveMaterialManager.applySlider(instance);
  }
}
