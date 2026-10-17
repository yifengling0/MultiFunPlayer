#!/usr/bin/env python3
"""Deterministic test inputs only. Expected values come exclusively from C#."""
from pathlib import Path
import json
import random

BASE = Path(__file__).resolve().parent


def geometry(attached=True, width=300, height=150, viewport_width=10, viewport_height=1):
    return dict(attached=attached, actualWidth=width, actualHeight=height,
                viewportWidth=viewport_width, viewportHeight=viewport_height)


def step(event, g=None, points=None):
    result = dict(event=event, geometry=g or geometry())
    if points is not None:
        result['points'] = points
    return result


cases = []


def case(name, points, steps, note=''):
    cases.append(dict(name=name, note=note, initialPoints=points, steps=steps))


unordered = [[8, .7], [2, .2], [2, .8], [-1, .3], [12, .9]]
case('detached_reset_preserves_order_duplicates_outside', [], [step('collection-reset', geometry(False), unordered)])
case('zero_width_reset_preserves_order', [], [step('collection-reset', geometry(width=0), unordered)])
case('zero_height_reset_preserves_order', [], [step('collection-reset', geometry(height=0), unordered)])
case('measured_reset_sorts_without_pruning', [], [step('collection-reset', points=unordered)])
case('viewport_prunes_before_zero_width_return', unordered, [step('viewport-change', geometry(width=0))])
case('viewport_prunes_before_zero_height_return', unordered, [step('viewport-change', geometry(height=0))])
case('detached_viewport_is_inert', unordered, [step('viewport-change', geometry(False, viewport_width=3))])
case('measured_viewport_prunes_then_sorts', unordered, [step('viewport-change', geometry(viewport_width=3))])
case('closed_edges_and_nearest_outside', [[0, 0], [10, 1], [0, 1], [10, 0], [-5e-324, .5],
     [10.000000000000002, .5], [5, -5e-324], [5, 1.0000000000000002]], [step('viewport-change')])
case('duplicate_x_stable_no_deduplication', [[4, .8], [2, .6], [4, .1], [2, .2], [4, .5]], [step('synchronize')])
case('pixel_underflow_ties_preserve_first_model_sort', [[2e-308, .8], [1e-308, .2], [1e-308, .9]],
     [step('synchronize', geometry(width=1e-308, viewport_width=10))],
     'All canvas X values underflow to zero; second stable sort retains model-X order.')
case('zero_and_negative_zero_x_tie', [[-0.0, .2], [0, .8], [-0.0, .4]], [step('synchronize')])
case('fractional_roundtrip_changes_value', [[.1, .1], [1/3, 1/3], [.7, .7]],
     [step('synchronize', geometry(width=317, height=149, viewport_width=3))])
case('reset_y_outside_is_not_clamped', [[8, -1], [2, 2]], [step('collection-reset')])
case('viewport_prunes_y_outside', [[8, -1], [2, 2], [5, .5]], [step('viewport-change')])
case('empty_reset_still_notifies', [], [step('collection-reset'), step('collection-reset')])
case('empty_synchronize_no_collection_notifications', [], [step('synchronize')])
case('singleton_equal_reset_writes_each_time', [[5, .5]], [step('collection-reset'), step('collection-reset')])
case('equal_points_repeated_synchronize_writes_each_time', [[0, 0], [10, 1]], [step('synchronize'), step('synchronize')])
case('initial_points_binding_measured', unordered, [step('points-bound')])
case('initial_points_binding_unmeasured_then_resize', unordered,
     [step('points-bound', geometry(width=0, height=0)), step('synchronize')])
case('initial_viewport_before_binding_schedule', unordered,
     [step('viewport-change', geometry(width=0, height=0, viewport_width=3)),
      step('points-bound', geometry(width=0, height=0, viewport_width=3)),
      step('synchronize', geometry(viewport_width=3))])
case('initial_binding_before_viewport_schedule', unordered,
     [step('points-bound'), step('viewport-change', geometry(viewport_width=3))])
case('duration_before_incoming_reset_keeps_new_outside', [[2, .2], [8, .8]],
     [step('viewport-change', geometry(viewport_width=3)),
      step('collection-reset', geometry(viewport_width=3), [[7, .7], [1, .1]])],
     'Source action assigns Duration before SetFrom; a delivered viewport event can prune old points only.')
case('deferred_viewport_after_incoming_reset_prunes_new', [[2, .2], [8, .8]],
     [step('collection-reset', geometry(viewport_width=10), [[7, .7], [1, .1]]),
      step('viewport-change', geometry(viewport_width=3))],
     'Alternative explicitly supplied delivery schedule, not a claim about actual WPF scheduling.')
case('resize_does_not_prune_offviewport', unordered,
     [step('synchronize', geometry(width=0, height=0, viewport_width=3)),
      step('synchronize', geometry(width=641, height=219, viewport_width=3))])
case('detach_reset_reattach_resize', unordered,
     [step('synchronize'), step('collection-reset', geometry(False), [[9, .1], [2, .9], [2, .6]]),
      step('points-bound', geometry(width=321, height=151))])
case('clear_existing_elements_then_repopulate', unordered,
     [step('synchronize'), step('collection-reset', points=[]), step('collection-reset', points=[[1, .25]])])
case('zero_size_reset_retains_elements_until_resize', unordered,
     [step('synchronize'), step('collection-reset', geometry(width=0), []), step('synchronize')])
case('smart_limit_percent_reset_duplicates', [[90, 0], [25, 100], [25, 30], [50, 50]],
     [step('collection-reset', geometry(width=125, height=125, viewport_width=100, viewport_height=100))])
case('smart_limit_closed_edges', [[0, 100], [100, 0], [-1, 50], [101, 50]],
     [step('viewport-change', geometry(width=125, height=125, viewport_width=100, viewport_height=100))])
case('very_large_finite_conversion', [[1e150, .25], [-1e150, .75]],
     [step('synchronize', geometry(width=1e100, height=1e100, viewport_width=1e150))])
case('tiny_positive_viewport_finite_conversion', [[1e-300, .25], [5e-301, .75]],
     [step('synchronize', geometry(width=2e-200, height=3e-100, viewport_width=1e-300))])

rng = random.Random(160016)
for index in range(96):
    viewport = rng.choice([1, 3, 10, 60, 100])
    height = 100 if viewport == 100 else 1
    points = [[rng.choice([-1, 0, .1, .2, .2, .7, 1, 1.25]) * viewport,
               rng.choice([0, .1, .25, .5, .9, 1]) * height] for _ in range(rng.randrange(0, 18))]
    g = geometry(index % 5 != 0, rng.choice([0, 1, 125, 317, 641]), rng.choice([0, 1, 125, 149, 219]), viewport, height)
    measured = geometry(True, rng.choice([125, 317, 641]), rng.choice([125, 149, 219]), viewport, height)
    case('sweep_%02d' % index, points, [step(rng.choice(['collection-reset', 'viewport-change', 'synchronize', 'points-bound']), g),
                                      step('synchronize', measured), step('collection-reset', measured)])

(BASE / 'inputs.json').write_text(json.dumps(cases, ensure_ascii=False, indent=2) + '\n')
print('Generated %d input schedules; no expected values computed.' % len(cases))
