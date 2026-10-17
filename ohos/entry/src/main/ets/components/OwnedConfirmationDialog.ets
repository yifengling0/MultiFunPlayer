import { UiStyle } from '../presentation/UiStyle';
import { EMERGENCY_STOP_KEY } from '../input/ShortcutConfiguration';
import { KeyCode } from '@kit.InputKit';

/** Pure dimensions, shared by the shell and short-window controller tests. */
export class ConfirmationDialogGeometry {
  static readonly inset: number = 16;
  static readonly gap: number = 8;
  static height(viewportHeight: number): number {
    const available: number = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 640;
    return Math.min(360, Math.max(176, available - 32));
  }
  static width(viewportWidth: number): number {
    const available: number = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 360;
    return Math.min(480, Math.max(160, available - 32));
  }
  static messageHeight(viewportHeight: number): number {
    return ConfirmationDialogGeometry.height(viewportHeight) - ConfirmationDialogGeometry.inset * 2 -
      ConfirmationDialogGeometry.gap * 2 - UiStyle.control - 52;
  }
}

/**
 * Content of one real CustomDialogController. The system/controller owns its
 * surface; no root color, blur, border or shadow may obscure API26 material.
 * Only the explanatory copy scrolls. Both action rows stay visible at 240vp.
 */
@CustomDialog
export struct OwnedConfirmationDialog {
  controller?: CustomDialogController;
  @Prop title: string = '';
  @Prop message: string = '';
  @Prop confirmLabel: string = '确认';
  @Prop danger: boolean = false;
  @Prop viewportHeight: number = 640;
  @Prop viewportWidth: number = 360;
  onConfirm: () => void = (): void => {};
  onCancel: () => void = (): void => {};
  onStop: () => void = (): void => {};
  private active: boolean = false;
  private epoch: number = 0;
  aboutToAppear(): void { this.epoch++; this.active = true; }
  aboutToDisappear(): void { this.active = false; this.epoch++; }
  private confirmHandler(): () => void {
    const callback: () => void = this.onConfirm; const epoch: number = this.epoch;
    return (): void => { if (this.active && this.epoch === epoch && this.onConfirm === callback) { callback(); } };
  }
  private cancelHandler(): () => void {
    const callback: () => void = this.onCancel; const epoch: number = this.epoch;
    return (): void => { if (this.active && this.epoch === epoch && this.onCancel === callback) { callback(); } };
  }
  private stopHandler(): () => void {
    const callback: () => void = this.onStop; const epoch: number = this.epoch;
    return (): void => { if (this.active && this.epoch === epoch && this.onStop === callback) { callback(); } };
  }
  private keyHandler(): (event: KeyEvent) => boolean {
    const stop: () => void = this.onStop; const cancel: () => void = this.onCancel; const epoch: number = this.epoch;
    return (event: KeyEvent): boolean => {
      if (!this.active || this.epoch !== epoch || event.type !== KeyType.Down) { return false; }
      // Modal-local physical Down only. Unknown/CANCEL/Up never synthesize an action.
      if (event.keyCode === EMERGENCY_STOP_KEY && this.onStop === stop) { stop(); return true; }
      if (event.keyCode === KeyCode.KEYCODE_ESCAPE && this.onCancel === cancel) { cancel(); return true; }
      // Enter remains native focused-button behavior, never a global confirmation.
      return false;
    };
  }
  private displayTitle(): string { return this.title.trim().length > 0 ? this.title : '请确认操作'; }
  private displayMessage(): string { return this.message.trim().length > 0 ? this.message : '仅在选择确认后执行。取消会保留当前设置和未应用输入。'; }
  private displayConfirmLabel(): string { return this.confirmLabel.trim().length > 0 ? this.confirmLabel : '确认'; }

  build() {
    Column({ space: ConfirmationDialogGeometry.gap }) {
      Scroll() {
        Column({ space: 8 }) {
          Text(this.displayTitle()).fontSize(UiStyle.heading).fontWeight(FontWeight.Bold).fontColor(UiStyle.ink)
            .width('100%').wordBreak(WordBreak.BREAK_ALL)
          Text(this.displayMessage()).fontSize(UiStyle.body()).fontColor(UiStyle.ink)
            .width('100%').wordBreak(WordBreak.BREAK_ALL)
        }.width('100%').alignItems(HorizontalAlign.Start)
      }.width('100%').height(ConfirmationDialogGeometry.messageHeight(this.viewportHeight))
        .scrollBar(BarState.Auto).align(Alignment.TopStart).flexShrink(0)
      Row({ space: ConfirmationDialogGeometry.gap }) {
        Button('取消', { type: ButtonType.Normal }).buttonStyle(ButtonStyleMode.NORMAL)
          .fontSize(UiStyle.body()).fontColor(UiStyle.ink).backgroundColor(UiStyle.field)
          .height(UiStyle.control).layoutWeight(1).borderRadius(UiStyle.radius).stateEffect(true)
          .onClick(this.cancelHandler())
        Button(this.displayConfirmLabel(), { type: ButtonType.Normal }).buttonStyle(ButtonStyleMode.EMPHASIZED)
          .fontSize(UiStyle.body()).fontColor('#FFFFFF').backgroundColor(this.danger ? UiStyle.danger : UiStyle.accent)
          .height(UiStyle.control).layoutWeight(1).borderRadius(UiStyle.radius).stateEffect(true)
          .labelStyle({ maxLines: 2, minFontSize: 14, maxFontSize: UiStyle.body() })
          .accessibilityText(this.displayConfirmLabel()).onClick(this.confirmHandler())
      }.width('100%').height(UiStyle.control).flexShrink(0)
      Button('停止全部输出', { type: ButtonType.Normal }).buttonStyle(ButtonStyleMode.EMPHASIZED)
        .fontSize(UiStyle.body()).fontColor('#FFFFFF').backgroundColor(UiStyle.danger)
        .height(52).width('100%').flexShrink(0).borderRadius(UiStyle.radius).stateEffect(true)
        .accessibilityText('全局停止全部输出，同时取消本次确认').onClick(this.stopHandler())
    }.width(ConfirmationDialogGeometry.width(this.viewportWidth)).height(ConfirmationDialogGeometry.height(this.viewportHeight))
      .padding(ConfirmationDialogGeometry.inset)
      .onKeyEventDispatch(this.keyHandler())
  }
}
