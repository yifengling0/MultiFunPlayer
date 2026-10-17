/** Shared, platform-neutral readable UI tokens. Density is always an explicit
 * preference; available width or device type must never opt into compact mode. */
export class UiStyle {
  static readonly page: string = '#F5F6F8';
  static readonly card: string = '#F5F6F8';
  static readonly field: string = '#FFFFFF';
  static readonly ink: string = '#1C2937';
  static readonly muted: string = '#647181';
  static readonly edge: string = '#DFE4EA';
  static readonly edgeLight: string = '#FFFFFF';
  static readonly accent: string = '#236B73';
  static readonly accentSoft: string = '#E7F0F0';
  static readonly danger: string = '#B4434A';
  static readonly dangerSoft: string = '#F9EBED';
  static readonly warning: string = '#805415';
  static readonly success: string = '#216646';
  static readonly heading: number = 22;
  static readonly section: number = 18;
  static readonly helper: number = 14;
  static readonly control: number = 48;
  static readonly radius: number = 8;
  static readonly paneGap: number = 16;
  static readonly disabledOpacity: number = 0.45;
  /** One gutter per scrolling pane, never repeated by child panels. */
  static contentInset(width: number): number { return width < 360 ? 12 : width < 840 ? 16 : 24; }
  static fieldLabelWidth(width: number): string { return width >= 600 ? '40%' : '100%'; }
  static fieldControlWidth(width: number): string { return width >= 600 ? '60%' : '100%'; }
  /** Short numeric labels fit beside a useful input in a normal inspector.
   * Count wide glyphs conservatively; long labels/units still get their own row.
   * This is presentation only and never creates, releases or submits a draft. */
  private static inlineNumber(width: number, label: string, unit: string, compact: boolean): boolean {
    if (!Number.isFinite(width) || width < 300) { return false; }
    const text: string = label + (unit.length > 0 ? ' · ' + unit : '');
    const font: number = UiStyle.body(compact);
    let estimate: number = 12;
    for (let index: number = 0; index < text.length; index++) {
      estimate += text.charCodeAt(index) > 255 ? font : font * 0.6;
    }
    const labelFraction: number = width >= 600 ? 0.4 : 0.45;
    return estimate <= width * labelFraction && width * (1 - labelFraction) >= 120;
  }
  static numberLabelWidth(width: number, label: string, unit: string = '', compact: boolean = false): string {
    return UiStyle.inlineNumber(width, label, unit, compact) ? (width >= 600 ? '40%' : '45%') : '100%';
  }
  static numberControlWidth(width: number, label: string, unit: string = '', compact: boolean = false): string {
    return UiStyle.inlineNumber(width, label, unit, compact) ? (width >= 600 ? '60%' : '55%') : '100%';
  }
  static toolbarItemWidth(width: number, count: number): string {
    const capacity: number = Math.max(1, Math.floor(Math.max(0, width) / UiStyle.control));
    const columns: number = capacity >= count ? count : capacity >= 3 ? 3 : capacity >= 2 ? 2 : 1;
    return (100 / columns).toString() + '%';
  }
  static body(compact: boolean = false): number { return compact ? 15 : 16; }
  static gap(compact: boolean = false): number { return compact ? 6 : 8; }
  static padding(compact: boolean = false): number { return compact ? 8 : 12; }
}
