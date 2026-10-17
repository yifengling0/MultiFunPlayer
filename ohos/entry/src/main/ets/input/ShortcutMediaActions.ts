import { ordinalCaseScalar } from './OrdinalCaseMapping';
import { ShortcutAction } from './ShortcutConfiguration';
import { AxisScriptBinding } from '../core/AxisScriptStore';
import { MediaLoopControls, mediaSeekTarget, seekToScriptStart } from '../core/playback/MediaControls';

/** Pure command calculation. A result is a seek REQUEST, never an observation or ACK. */
export class ShortcutMediaResult {
  seekSeconds: number | null;
  message: string;
  constructor(seekSeconds: number | null, message: string) { this.seekSeconds = seekSeconds; this.message = message; }
}

/** Ordinal simple case comparison, not locale collation or full-fold expansion.
 * Uses the pinned .NET reference scalar table rather than host locale/Unicode.
 * Surrogate pairs remain scalar units; uppercase expansions (ß -> SS) do not match. */
export function shortcutNameEquals(left: string, right: string): boolean {
  if (left === right) { return true; }
  const a = Array.from(left); const b = Array.from(right);
  if (a.length !== b.length) { return false; }
  for (let index: number = 0; index < a.length; index++) {
    if (a[index] === b[index]) { continue; }
    if (ordinalCaseScalar(a[index].codePointAt(0)!) !== ordinalCaseScalar(b[index].codePointAt(0)!)) { return false; }
  }
  return true;
}

/** ScriptViewModel actions: raw media times, first available metadata, original
 * ±1.5s next/previous boundary and immediately seek start of a valid AB loop. */
export function applyMediaShortcut(action: ShortcutAction, positionSeconds: number, durationSeconds: number,
  bindings: ReadonlyArray<AxisScriptBinding>, loop: MediaLoopControls): ShortcutMediaResult | null {
  const id = action.id;
  if (!id.startsWith('Media::Position::') && !id.startsWith('Media::Loop::') &&
    !id.startsWith('Media::Chapter::') && !id.startsWith('Media::Bookmark::')) { return null; }
  if (id === 'Media::Loop::Clear') { loop.clear(); return new ShortcutMediaResult(null, 'A/B 区间已清除'); }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) { throw new Error('媒体时长尚未确认'); }
  let target: number | null = null;
  let message = '';
  switch (id) {
    case 'Media::Position::Time::Set': target = mediaSeekTarget(action.value, durationSeconds); break;
    case 'Media::Position::Time::Offset': target = mediaSeekTarget(positionSeconds + action.value, durationSeconds); break;
    case 'Media::Position::Percent::Set': target = durationSeconds * Math.max(0, Math.min(1, action.value)); break;
    case 'Media::Position::Percent::Offset': target = mediaSeekTarget(durationSeconds * Math.max(0, Math.min(1, positionSeconds / durationSeconds + action.value)), durationSeconds); break;
    case 'Media::Position::SkipToScriptStart':
      target = seekToScriptStart(bindings.map(binding => binding.resource === null ? null : binding.resource.keyframes),
        durationSeconds, positionSeconds, action.value, false); break;
    case 'Media::Loop::Set': target = loop.setLoop(action.value, action.secondaryValue, durationSeconds); message = 'A/B 区间已设置'; break;
    case 'Media::Loop::Set::FromMediaPositionOffset':
      if (!Number.isFinite(positionSeconds)) { throw new Error('媒体位置尚未确认'); }
      target = loop.setLoop(positionSeconds - action.value, positionSeconds + action.secondaryValue, durationSeconds); message = 'A/B 区间已设置'; break;
    case 'Media::Loop::Start::Set': target = loop.setStart(action.value, durationSeconds); message = 'A 点已设置'; break;
    case 'Media::Loop::End::Set': target = loop.setEnd(action.value, durationSeconds); message = 'B 点已设置'; break;
    case 'Media::Loop::Start::Set::FromMediaPosition':
    case 'Media::Loop::End::Set::FromMediaPosition':
    case 'Media::Loop::CycleSetStartEnd':
    case 'Media::Loop::Set::FromCurrentChapter': {
      if (!Number.isFinite(positionSeconds)) { throw new Error('媒体位置尚未确认'); }
      if (id === 'Media::Loop::Start::Set::FromMediaPosition') { target = loop.setStart(positionSeconds, durationSeconds); message = 'A 点已设置'; }
      else if (id === 'Media::Loop::End::Set::FromMediaPosition') { target = loop.setEnd(positionSeconds, durationSeconds); message = 'B 点已设置'; }
      else if (id === 'Media::Loop::CycleSetStartEnd') { target = loop.cycle(positionSeconds, durationSeconds); message = 'A/B 区间已切换'; }
      else {
        target = loop.fromCurrentChapter(bindings.map(binding => binding.resource === null || binding.resource.chapters.length === 0 ? null : binding.resource.chapters), positionSeconds, durationSeconds);
        if (target === null) { throw new Error('当前时间没有可用章节'); }
        message = '已按当前章节设置 A/B';
      }
      break;
    }
    default: {
      const chapters = id.startsWith('Media::Chapter::');
      const binding = bindings.find(item => item.resource !== null && (chapters ? item.resource.chapters.length > 0 : item.resource.bookmarks.length > 0));
      if (binding === undefined || binding.resource === null) { throw new Error(chapters ? '没有可用章节' : '没有可用书签'); }
      const names = chapters ? binding.resource.chapters.map(item => item.name) : binding.resource.bookmarks.map(item => item.name);
      const positions = chapters ? binding.resource.chapters.map(item => item.startTimeSeconds) : binding.resource.bookmarks.map(item => item.positionSeconds);
      let index = -1;
      if (id.endsWith('::SeekToByName')) { index = names.findIndex(name => shortcutNameEquals(name, action.text)); }
      else if (id.endsWith('::SeekToByIndex')) { index = action.value; }
      else if (id.endsWith('::SeekToNext') || id.endsWith('::SeekToPrev')) {
        if (!Number.isFinite(positionSeconds)) { throw new Error('媒体位置尚未确认'); }
        const next = id.endsWith('::SeekToNext'); const boundary = positionSeconds + (next ? 1.5 : -1.5);
        index = positions.findIndex(value => value >= boundary); if (index < 0) { index = positions.length; }
        if (!next) { index--; }
      } else { return null; }
      if (!Number.isInteger(index) || index < 0 || index >= positions.length) { throw new Error('未找到匹配的章节 / 书签'); }
      target = mediaSeekTarget(positions[index], durationSeconds); break;
    }
  }
  if (target === null && message.length === 0) { throw new Error('没有可用的跳转目标'); }
  return new ShortcutMediaResult(target, message || ('已请求跳转至 ' + target!.toFixed(2) + ' 秒'));
}
