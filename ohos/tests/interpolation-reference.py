#!/usr/bin/env python3
"""Independent exact-rational transcription of pinned C# equations, NOT a C# run.

Uses Fraction and expanded Hermite basis (production uses JS doubles and upstream's
factored expression). Boundary padding intentionally matches KeyframeCollection,
including the unusual left pm2 construction. No production TS is imported.
Run from any directory: python3 ohos/tests/interpolation-reference.py
"""
from fractions import Fraction as F
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
PIN = '0b81a15dd67c6dda9a21a1f84300326f5cb57c2a'
SOURCES = [
    'Source/MultiFunPlayer/Common/Utils/MathUtils.cs',
    'Source/MultiFunPlayer/Common/KeyframeCollection.cs',
    'Source/MultiFunPlayer/UI/Controls/ViewModels/ScriptViewModel.cs',
]


def evaluate(actions, time, mode):
    points = [(F(t, 1000), F(y, 100)) for t, y in actions]
    x = F(str(time)) / 1000
    if not points:
        return F(1, 2)
    if x <= points[0][0]:
        return points[0][1]
    if x >= points[-1][0]:
        return points[-1][1]
    i = max(j for j, p in enumerate(points) if p[0] <= x)
    a, b = points[i:i+2]
    if mode == 'step':
        return a[1]
    t = (x - a[0]) / (b[0] - a[0])
    if mode == 'linear':
        return (1-t)*a[1] + t*b[1]

    def take(j, u, v):
        return points[j] if 0 <= j < len(points) else (3*v[0]-2*u[0], v[1])

    left = take(i-1, b, a)
    right = take(i+2, a, b)
    if mode == 'pchip':
        slopes = []
        for u, v, w in [(left, a, b), (a, b, right)]:
            h, k = v[0]-u[0], w[0]-v[0]
            d, e = (v[1]-u[1])/h, (w[1]-v[1])/k
            # Equivalent to upstream's nonfinite or opposite-sign fallback,
            # without division by zero in rational arithmetic.
            slopes.append(F(0) if d*e <= 0 else 3*(h+k)*d*e/((2*k+h)*e+(k+2*h)*d))
    else:
        chain = [take(i-2, left, b), left, a, b, right, take(i+3, b, right)]
        m = [(v[1]-u[1])/(v[0]-u[0]) for u, v in zip(chain, chain[1:])]
        slopes = []
        for j in (0, 1):
            u, v, w, z = m[j:j+4]
            weights = [abs(z-w)+abs(z+w)/2, abs(v-u)+abs(v+u)/2]
            slopes.append((weights[0]*v+weights[1]*w)/sum(weights) if sum(weights) else F(0))
    # Expanded basis, independently evaluated at exact rational precision.
    h = b[0]-a[0]
    return ((2*t**3-3*t**2+1)*a[1] + (t**3-2*t**2+t)*h*slopes[0]
            + (-2*t**3+3*t**2)*b[1] + (t**3-t**2)*h*slopes[1])


CASES = {
    'empty': [],
    'one': [[123, 37]],
    'two-rising': [[100, 0], [900, 100]],
    'two-falling': [[100, 100], [900, 0]],
    'three-extremum': [[17, 9], [41, 97], [1800, 21]],
    'three-flat': [[0, 45], [1, 45], [86400000, 45]],
    'nonuniform': [[0, 10], [13, 78], [91, 35], [105, 51], [890, 99], [1200, 0]],
    'plateau': [[0, 0], [100, 0], [350, 80], [400, 80], [950, 20], [2000, 20]],
    'alternating-extrema': [[0, 0], [1, 100], [2, 0], [10, 100], [100, 0]],
    'overshoot': [[0, 50], [100, 100], [200, 100], [300, 50]],
    'long-offset-short-segments': [[86399000, 0], [86399001, 99], [86399003, 12], [86400000, 75]],
}
rows = []
for name, actions in CASES.items():
    times = {-100, 0, 86400001}
    for at, _ in actions:
        times.update([at-0.001, at, at+0.001])
    for (a, _), (b, _) in zip(actions, actions[1:]):
        times.update(a+(b-a)*q/8 for q in range(1, 8))
    for mode in ['linear', 'pchip', 'makima', 'step']:
        samples = []
        for time in sorted(times):
            raw = evaluate(actions, time, mode)
            samples.append({'timeMs': time, 'rawNormalized': float(raw),
                            'expected': float(max(F(0), min(F(1), raw))*100)})
        rows.append({'name': name, 'mode': mode, 'actions': actions, 'samples': samples})
fixture = {
    'provenance': {
        'kind': 'independent-python-exact-rational-reference',
        'executedCSharp': False,
        'upstreamCommit': PIN,
        'sourceSha256': {p: hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in SOURCES},
        'notes': 'C# runtime unavailable. Equation/padding equivalence evidence, not binary/runtime parity. Preview boundary holds and neutral empty value are adapter policies; raw kernels and final clamp are distinct.',
    },
    'cases': rows,
}
output = ROOT/'ohos/tests/fixtures/interpolation-golden.json'
output.write_text(json.dumps(fixture, indent=2)+'\n')
print(f'Wrote {len(rows)} cases / {sum(len(r["samples"]) for r in rows)} samples to {output}')
