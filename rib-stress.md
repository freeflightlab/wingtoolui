# What the rib cloth carries

The project sites anchors, computes what each carries, and cuts lightening
holes between them. It never checked the cloth in between. A rib can satisfy
every placement rule — nose band, surface margins, anchor clearance, webs —
and still be a rib that tears at the attachment point.

## 1. The first result looked absurd, and was right

The A anchor came out working the rib cloth at **2971%** of its capacity.
Checking the arithmetic rather than tuning it:

```
A1 at 1 g        260 N over a 20 mm tab  =   13.0 kN/m
at the 8 g case  2080 N                  =  104.0 kN/m
Skytex 27 hard carries about                  3.5 kN/m
```

The number is right. **Rib cloth cannot carry an anchor load at all** — not at
the design case, not even at 1 g. Real wings do not tear because the load
never enters bare cloth: it goes into a Dacron tab, which `reinforcement.js`
already sizes by width.

So the useful question is not "does the cloth hold" — it does not, ever — but
**how far the reinforcement must reach before bare cloth can take over.** That
sets the tab *length*, which nothing in this project had sized.

## 2. The design rule that falls out

The load spreads as it travels into the rib, so the line load falls with
distance. The reinforcement can stop where the spread load drops below what
bare cloth carries.

At the 8 g design case, with the same 2080 N load on every rib:

| chord | room available | reach needed | verdict |
| --- | --- | --- | --- |
| 2.45 m | 613 mm | 497 mm | stops inside the rib |
| 1.80 m | 450 mm | 497 mm | **tape to the seam** |
| 1.20 m | 300 mm | 497 mm | **tape to the seam** |
| 0.55 m | 138 mm | 497 mm | **tape to the seam** |

**The rule changes along the span**, and for a reason worth stating: the reach
is set by the *load*, which barely falls outboard, while the room available
scales with the *chord*, which falls fast. Inboard ribs have room for the tape
to stop; outboard ribs do not, so their reinforcement must run to the surface
seam.

That both columns come from the same load is asserted, so the conclusion
cannot be mistaken for a load effect.

## 3. What it catches

A lightening hole in an anchor's load path removes the cloth that would have
carried the spread load. `checkRibStress` reports which anchors have a hole in
their path by name, alongside which needs the longest reinforcement.

## 4. The PMA connection

§5.3 tests exactly this. An inspector attaches an A line of the first line
group, places a needle at least 100 mm up the rib, and pulls. The ripstop must
not break below **0.6 daN**.

The test is not measuring cloth in isolation — it measures cloth *while the
rib is loaded through its own line*. So the tension the design puts into the
rib is part of what the inspector is pulling against, and **a design that
already works the cloth hard will fail a test that a slacker one passes on
identical fabric.** `predictedTearMargin` estimates that reading before the
wing is built rather than at its first inspection.

## 5. What this is not

A line-load model — force per unit width — not a finite element analysis. It
says so in its output (`lineLoadModel: true`). It is for catching the rib
whose anchor load runs into the edge of a hole, and for sizing how far the
tape must go. It is not for certifying a rib.
