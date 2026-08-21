# Construction detail

Phase 3: the parts of a wing that are neither aerodynamic surface nor line.

---

## 1. Rib lightening holes

A rib does two jobs — holds the section shape, and carries line load from its
anchors up into the sail. Most of its area does neither, and every production
wing cuts that area away. The rib view built earlier showed a solid rib, which
no real wing has.

**The interesting part is not the holes but what has to stay.**

| constraint | why |
| --- | --- |
| margin at both surfaces | the rib is sewn along its whole length; cut close to the seam and it tears out along the stitch line |
| band at the leading edge | highest pressure, sharpest curvature, and usually a mylar reinforcement |
| clearance at every anchor | the material above an anchor is the load path to the sail — a hole across it is how a rib fails at its tabs |
| web between holes | two holes a few millimetres apart are one hole with a decorative strip through it |

So holes are placed **into the space that remains** after those are
subtracted, rather than placed and checked afterwards. A check that fails
leaves the designer with nothing; a constrained placement always yields
something buildable.

On the test wing's root rib: three holes, **31% of the rib removed**, minimum
web 10% of chord. Across the wing, rib cloth falls from 551 g to 382 g.

`checkRibHoles` verifies the rules independently of the code that enforces
them. It should always pass — that is the point. It is a guard against a
future change to the placement quietly starting to cut through a load path.

Tightening a rule must remove *less* material, and both the surface margin and
the anchor clearance are asserted to do so. A rib with anchors everywhere has
nowhere left to cut, and yields few or no holes rather than holes across every
load path.

---

## 2. Bill of materials

Everything the construction side produces, totalled into what has to be
bought. This is where estimates that looked harmless in isolation get added
up, so it is where their honesty matters.

**Fabric is bought by the roll, not by area.** Nesting decides how much of a
roll a set of panels consumes, and the offcut is paid for whether or not it is
used. On the test wing: 46.6 m² sewn, but **69.1 m of 1.4 m roll ordered** at
48% utilisation. A bill quoting panel area understates the order by more than
the panels themselves.

**Line is bought by cut length.** The loop allowance is real material and
fixed per line, so a bill built from finished lengths is short by about 13%. A
bill supplied without it says so rather than quietly omitting it.

**Rib cloth is not negligible** — the third fabric item after the two sail
surfaces.

A worked example, 22 m² wing:

```
FABRIC   sail 69.1 m of roll, 46.6 m2 sewn, 1679 g
         rib cloth 11.4 m2, 455 g  (31% removed as holes)
         diagonals 8.6 m of roll, 5.4 m2, 171 g
LINE     DC40 246 m / DC100 44 m / PPSLS 180 18 m / DC60 8 m
TOTALS   cloth 2305 g + line 93 g = 2.398 kg
```

Against a finished weight of 3.5–4.5 kg for a wing this size, which is the
right shape: **the bill counts cloth and line only**. Reinforcement, rods,
risers, tapes and thread are not counted, and the text says so at the bottom
of every bill rather than leaving the total to be read as a wing weight.

Inputs are optional, and what is missing is **reported as missing** rather
than treated as zero — a bill that silently omits the lines looks identical to
one for a wing that has none.

---

## 3. Cross-ports

A lightening hole is sized by what can be removed. **A cross-port is sized by
what has to pass through it**, which makes it a different problem wearing the
same clothes.

Only some ribs face a cell opening; the closed ribs behind a diagonal are fed
entirely through their neighbours. If that path is too restricted the wing
inflates unevenly on launch and re-inflates slowly after a collapse — which is
when it matters.

Treating the port as an orifice:

```
A_required = V_cell / (Cd · v · t)        v = sqrt(2·dp/rho)
```

For the test wing's root cell — 0.28 m³, 63 Pa internal, 10.1 m/s flow — that
is **293 cm² to fill in 1.5 s**. The tip cell needs 3 cm².

The relationships are what the estimate is for, and each is asserted: halving
the target time doubles the area, twice the volume needs twice the area, and
flying faster needs *less* because pressure drives the flow.

**An unmeetable requirement is reported, not met.** Ask for 0.02 s and the
space cannot hold it; the tool cuts the largest ports the margins allow and
says how much it is short, rather than cutting an undersized port and calling
it done.

This is a first-order estimate and says so: it ignores duct losses, the fact
that flow crosses several ribs in series, and the changing volume as a cell
fills.

---

## 4. Reinforcement, and the mass gap

The bill counts cloth and line and says so at the bottom of every printout.
On a 25 m² wing it comes to 2.4 kg against a finished weight near 4 kg, and
reinforcement is the largest single item in that gap.

It is *placed*, not calculated — a designer decides where a wing needs help,
and the rules are conventions rather than derivations. What can be done
honestly is to place it consistently and let the mass appear where the
omission currently is.

| item | job | mass |
| --- | --- | --- |
| Mylar at the intakes | holds the nose against the highest pressure on the wing | 80 g |
| Dacron at the anchors | spreads a point load that would tear ripstop | 38 g |
| Trailing edge tape | sewn, loaded along its length, handled every flight | 13 g |

Only the first two are structural. The others are wear and handling, which is
why a light wing drops them first — and the generator lets it, with `fitMylar`
and friends.

Anchor patches are counted **from the line plan**, not from a guess at rows
per rib, so changing the rigging changes the order.

### The gap is the output

`massBudget` compares against a published weight:

```
cloth 2305 g + line 93 g + reinforcement 130 g = 2.528 kg
gap 1472 g (37%) — rods and rod pockets, thread, risers and hardware webbing
```

The useful number is not the total but what the model **cannot yet see**, and
how big it is. Given no published weight it reports no gap rather than
inventing a target.

---

## 5. Not covered

- **Rods.** Modern wings carry nylon or carbon rods in the leading edge; on a
  light wing they are a noticeable fraction of the weight.
- **Cross-ports.** Holes between cells for pressure equalisation, distinct
  from lightening holes and subject to different rules.
- **Hole shape.** The generator produces one tapered opening per available
  gap. Real ribs use a variety of shapes, and some makers cut several small
  holes where this cuts one large one.
- **Attachment tab geometry.** Where a line meets a rib, the tab and its
  reinforcement are their own small design problem.
