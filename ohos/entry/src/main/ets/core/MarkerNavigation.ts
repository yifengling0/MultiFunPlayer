import { FunscriptChapter, FunscriptMetadata } from './Funscript';

/** Adjacent chapters use half-open intervals; the final endpoint remains visible. */
export function activeChapter(metadata: FunscriptMetadata, scriptTimeMs: number): FunscriptChapter | undefined {
  if (!Number.isFinite(scriptTimeMs)) { return undefined; }
  return metadata.chapters.find((chapter: FunscriptChapter, index: number) =>
    chapter.startTimeMs <= scriptTimeMs &&
    (scriptTimeMs < chapter.endTimeMs ||
      (index === metadata.chapters.length - 1 && scriptTimeMs === chapter.endTimeMs)));
}

/** Do not silently clamp an out-of-range marker and claim it was reached. */
export function markerMediaPosition(scriptTimeMs: number, globalOffsetMs: number,
  axisOffsetMs: number, durationMs: number): number | undefined {
  if (!Number.isFinite(scriptTimeMs) || !Number.isFinite(globalOffsetMs) ||
      !Number.isFinite(axisOffsetMs) || !Number.isFinite(durationMs) || durationMs < 0) { return undefined; }
  const target = scriptTimeMs + globalOffsetMs + axisOffsetMs;
  return target >= 0 && target <= durationMs ? target : undefined;
}
