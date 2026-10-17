import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const ordinalProvenance = JSON.parse(readFileSync(new URL('../fixtures/ordinal-oracle-provenance.json', import.meta.url), 'utf8'));
const fixtureBytes = readFileSync(new URL('../fixtures/ordinal-case-net9.json', import.meta.url));
const ageBytes = readFileSync(new URL('../fixtures/' + ordinalProvenance.ageData.path, import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(fixtureBytes), ordinalProvenance.canonical.fixtureSha256, 'Canonical fixture changed; do not regenerate to accommodate a host');
assert.equal(sha(ageBytes), ordinalProvenance.ageData.sha256, 'Official Unicode age data checksum mismatch');
export const canonicalOrdinalPairs = JSON.parse(fixtureBytes);
assert.equal(canonicalOrdinalPairs.length, ordinalProvenance.canonical.pairCount);
const version = text => text.split('.').map(Number);
const atMost = (a, b) => a[0] < b[0] || a[0] === b[0] && a[1] <= b[1];
const ranges = [];
for (const line of ageBytes.toString('utf8').split(/\r?\n/)) {
  const data = line.split('#')[0].trim(); if (!data) continue;
  const match = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(\d+\.\d+)$/.exec(data);
  assert.ok(match, 'Malformed pinned DerivedAge row');
  ranges.push({ start: parseInt(match[1], 16), end: parseInt(match[2] || match[1], 16), age: version(match[3]) });
}
function ageOf(character) {
  const scalar = character.codePointAt(0);
  assert.equal([...character].length, 1, 'A canonical mapping must contain one scalar per side');
  const matches = ranges.filter(range => scalar >= range.start && scalar <= range.end);
  assert.equal(matches.length, 1, 'Missing/ambiguous official age for U+' + scalar.toString(16));
  return matches[0].age;
}
const fields = ['runtime', 'platform', 'architecture', 'backend', 'icuVersion', 'unicodeVersion'];
export function expectedOrdinalPairs(provenance) {
  assert.ok(provenance && typeof provenance === 'object', 'Missing actual runtime provenance');
  const profile = ordinalProvenance.supportedOracleProfiles.find(profile => fields.every(key => profile[key] === provenance[key]));
  assert.ok(profile, 'Unverified ordinal oracle environment: ' + JSON.stringify(provenance));
  assert.equal(provenance.invariant, profile.backend === 'invariant', 'Runtime mode/provenance contradiction');
  assert.equal(provenance.nls, false, 'NLS is not an accepted reference profile');
  if (profile.backend === 'icu') {
    assert.equal(typeof provenance.icuModule, 'string');
    assert.ok(provenance.icuModule.endsWith('/libicuuc.so.' + profile.icuVersion.split('.').slice(0, 2).join('.')), 'No matching runtime-loaded ICU module proof');
  } else assert.equal(provenance.icuModule, null, 'Invariant profile must not claim selected ICU');
  // This projection is explicitly restricted to the independently verified
  // profiles above, not a universal rule for historic case-mapping revisions.
  const maximum = version(profile.maximumAge);
  return canonicalOrdinalPairs.filter(pair => pair.every(character => atMost(ageOf(character), maximum)));
}
export function validateOrdinalOracle(report) {
  const expected = expectedOrdinalPairs(report?.provenance);
  assert.deepEqual(report.pairs, expected, 'Full Unicode ordinal scan differs for the declared runtime/backend/data profile');
  return { ...report.provenance, pairCount: report.pairs.length, canonicalPairCount: canonicalOrdinalPairs.length };
}

export function ordinalOracleSdkRoot(environment) {
  const root = environment.MFP_DOTNET_ROOT || environment.DOTNET_ROOT;
  assert.ok(root || !environment.CI, 'CI must configure the official .NET oracle SDK; refusing a skipped Unicode scan');
  return root;
}
