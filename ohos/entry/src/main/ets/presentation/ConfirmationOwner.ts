/** Immutable description; the caller captures its own page/profile/target identity. */
export class ConfirmationRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly danger: boolean;
  readonly isCurrent: () => boolean;
  readonly onConfirm: () => void;
  constructor(title: string = '', message: string = '', confirmLabel: string = '确认', danger: boolean = false,
    isCurrent: () => boolean = (): boolean => false, onConfirm: () => void = (): void => {}) {
    this.title = title; this.message = message; this.confirmLabel = confirmLabel; this.danger = danger;
    this.isCurrent = isCurrent; this.onConfirm = onConfirm;
    Object.freeze(this);
  }
}

/** Each native callback belongs to exactly one request, even after replacement. */
export class ConfirmationActions {
  readonly accept: () => void;
  readonly cancel: () => void;
  readonly stop: () => void;
  constructor(accept: () => void, cancel: () => void, stop: () => void) {
    this.accept = accept; this.cancel = cancel; this.stop = stop;
    Object.freeze(this);
  }
}

class ConfirmationEntry {
  readonly isCurrent: () => boolean;
  readonly onConfirm: () => void;
  readonly onStop: () => void;
  readonly isStopCurrent: () => boolean;
  readonly dismiss: () => void;
  retired: boolean = false;
  constructor(isCurrent: () => boolean, onConfirm: () => void, onStop: () => void,
    isStopCurrent: () => boolean, dismiss: () => void) {
    this.isCurrent = isCurrent; this.onConfirm = onConfirm; this.onStop = onStop;
    this.isStopCurrent = isStopCurrent; this.dismiss = dismiss;
  }
}

/** Identity object avoids numeric generation reuse in a long-lived page. */
class ConfirmationRevision {}

/**
 * Page-local volatile ownership only. No settings, drafts, I/O or automatic actions.
 * Every close consumes first, before native dismissal can synchronously call back.
 * A failed native close cannot restore an action; acceptance is guarded again
 * immediately before execution, including after dismissal and guard reentrancy.
 */
export class ConfirmationOwner {
  private active: ConfirmationEntry | null = null;
  private revision: ConfirmationRevision = new ConfirmationRevision();

  begin(isCurrent: () => boolean, onConfirm: () => void, onStop: () => void,
    isStopCurrent: () => boolean = isCurrent, dismiss: () => void = (): void => {}): ConfirmationActions {
    const entry: ConfirmationEntry = new ConfirmationEntry(isCurrent, onConfirm, onStop, isStopCurrent, dismiss);
    const previous: ConfirmationEntry | null = this.active;
    this.revision = new ConfirmationRevision(); this.active = entry;
    // Install before dismissal: a reentrant begin/close can retire this entry too.
    if (previous !== null) { this.dismissEntry(previous); }
    return new ConfirmationActions((): void => this.finish(entry, false),
      (): void => this.cancel(entry), (): void => this.finish(entry, true));
  }

  hasPending(): boolean { return this.active !== null; }

  close(): void {
    const entry: ConfirmationEntry | null = this.active;
    this.active = null; this.revision = new ConfirmationRevision();
    if (entry !== null) { this.dismissEntry(entry); }
  }

  private dismissEntry(entry: ConfirmationEntry): void {
    if (entry.retired) { return; }
    entry.retired = true;
    try { entry.dismiss(); } catch { /* Native close failure never restores ownership. */ }
  }

  private cancel(entry: ConfirmationEntry): void {
    if (this.active !== entry || entry.retired) { return; }
    this.close();
  }

  private finish(entry: ConfirmationEntry, stop: boolean): void {
    if (this.active !== entry || entry.retired) { return; }
    this.active = null;
    const revision: ConfirmationRevision = new ConfirmationRevision(); this.revision = revision;
    this.dismissEntry(entry);
    if (this.revision !== revision) { return; }
    // Stop can remain valid after a target/source change, but never on another page.
    let current: boolean = false;
    try { current = stop ? entry.isStopCurrent() : entry.isCurrent(); } catch { return; }
    if (!current || this.revision !== revision) { return; }
    if (stop) { entry.onStop(); } else { entry.onConfirm(); }
  }
}
