/** Shared, platform-neutral readable UI tokens. Density is always an explicit
 * preference; available width or device type must never opt into compact mode. */
export class UiStyle {
  static readonly page: string = '#F5F7F8';
  static readonly card: string = '#F5F7F8';
  static readonly field: string = '#FFFFFF';
  static readonly ink: string = '#142D3A';
  static readonly muted: string = '#536875';
  static readonly edge: string = '#C6D8DF';
  static readonly edgeLight: string = '#F4FFFF';
  static readonly accent: string = '#087E8B';
  static readonly accentSoft: string = '#DEEFF2';
  static readonly danger: string = '#B53C42';
  static readonly dangerSoft: string = '#FCECEF';
  static readonly warning: string = '#805415';
  static readonly success: string = '#216646';
  static readonly heading: number = 22;
  static readonly helper: number = 14;
  static readonly control: number = 52;
  static readonly radius: number = 12;
  static readonly paneGap: number = 24;
  /** One gutter per scrolling pane, never repeated by child panels. */
  static contentInset(width: number): number { return width < 360 ? 8 : width < 840 ? 12 : 16; }
  static fieldLabelWidth(width: number): string { return width >= 600 ? '40%' : '100%'; }
  static fieldControlWidth(width: number): string { return width >= 600 ? '60%' : '100%'; }
  static toolbarItemWidth(width: number, count: number): string {
    const capacity: number = Math.max(1, Math.floor(Math.max(0, width) / UiStyle.control));
    const columns: number = capacity >= count ? count : capacity >= 3 ? 3 : capacity >= 2 ? 2 : 1;
    return (100 / columns).toString() + '%';
  }
  static body(compact: boolean = false): number { return compact ? 16 : 18; }
  static gap(compact: boolean = false): number { return compact ? 8 : 12; }
  static padding(compact: boolean = false): number { return compact ? 12 : 16; }
}
