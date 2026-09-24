# Brake cascades

Brakes were the last row still parsed but not generated. They are not simply
another anchor row, and the production data says so in four ways.

Ground truth: **BGD Lynx 2 M**, whose line table states its own cascade, plus
brake blocks from the PHI and Ozone sheets.

---

## 1. What makes a brake different

**Four levels, not three.** The Lynx 2 runs `k -> KM -> KR -> KL`. Ozone
splits the main level into `KRU` and `KRL` around the pulley. Every
load-bearing row runs three.

**One shared lower line.** `KL1` appears in all thirteen Lynx 2 paths at the
same 2926 mm: a single line from the handle up to the pulley carrying the
entire cascade. Nothing in the A/B/C/D rows behaves like that, and a generator
that treats brakes as a fourth row produces one lower line per branch, which
is wrong.

**Anchors are deliberately uneven.** The Lynx 2 attaches at ribs 2, 4, 8, 10,
13, 15, 18, 20, 23, 25, 27, 29, 31 — gaps of 2 to 4 inboard closing to a
steady 2 outboard. Braking is meant to bite at the tip first.

**Total path falls outboard**, 7913 mm at rib 2 to 6813 mm at rib 31, because
the arc brings the tip trailing edge nearer the pilot.

`buildBrakePlan` reproduces the structure: 13 anchors onto 6 middle lines onto
3 main lines onto 1 shared lower line, with `levelCounts` taking the shape
from a reference wing.

---

## 2. A measure that looked right and was not

The first version of this reported **free travel** as the cascade path length
minus the straight-line distance from handle to trailing edge. It produced
plausible-looking numbers — 301 to 906 mm across the span — and it is
meaningless.

The cascade path *is* the taut route. The difference between it and a straight
line is just how far the route bends around its junctions, and it grows with
span for reasons that have nothing to do with braking.

Free travel cannot be derived from geometry at all. **If every brake line were
cut to its exact taut length, the whole trailing edge would engage the instant
the handle moved.** Free travel is the slack the designer *adds*, and the
spanwise differential — which part of the wing bites first — comes from how
that slack is distributed, not from where the anchors sit.

`brakeEngagement` therefore takes a slack distribution and returns the
engagement order. The tests pin the physics rather than a number:

| slack | engagement across span | reading |
| --- | --- | --- |
| uniform 120 mm | 120 → 120 mm | whole trailing edge at once |
| `tipFirstSlack(180 → 60)` | 180 → 60 mm, monotonic | tip bites first |

The uniform case is reported as `uniform: true`, because a brake rigged that
way is a design error rather than a neutral default.

---

## 3. A bug the tests caught

Asking for 13 anchors on a 13-rib half wing returned the outermost rib
**twice** — two brake lines onto one attachment point. The monotonic repair
clamped at the tip and then had nowhere left to go.

Anchor counts are now capped at the rib count, and a run that hits the ceiling
is swept back inboard rather than collapsing onto the last rib. A related tie
in engagement — two anchors at the same slack — is resolved to the outermost,
which is the one a pilot feels first.

---

## 4. Not yet covered

- **Pulley geometry.** The handle position and pulley are parameters, not
  derived. Riser travel under speedbar moves the pulley, which changes brake
  length in accelerated flight — the reason wings have brake travel
  compensation.
- **The PHI brake block** still is not decoded: it lists each upper line
  twice, plain and with the spanwise distribution added, so its columns do not
  map one-to-one onto names.
- **Brake line sizing.** `loads.js` applies a larger safety factor to the `K`
  row for shock loading, but brake loads are not modelled — they come from
  pilot input, not from the lift distribution.
