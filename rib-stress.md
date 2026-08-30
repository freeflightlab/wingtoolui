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

## 2. A correction: the spanwise rule was an artefact

I first wrote this section as a design rule, using a 2080 N anchor load at the
8 g case:

| chord | room | reach | verdict |
| --- | --- | --- | --- |
| 2.45 m | 613 mm | 497 mm | stops inside |
| 0.55 m | 138 mm | 497 mm | tape to the seam |

**The mechanism is real** — the reach is set by the *load*, which barely falls
outboard, while the room scales with the *chord*, which falls fast, so at a
high enough load the rule does change along the span.

**But 2080 N is not a real anchor load.** Running the model on a wing's own
loads instead of an invented one:

```
half a 95 kg wing        466 N
spread over              44 anchors
per anchor               10.6 N mean, 30.7 N worst
```

The 260 N I used at 1 g was **ten times too high**. I had assumed a
plausible-sounding number instead of taking one from the load model that was
sitting right there. It is the same lesson as the PMA measuring tension
exceeding flight load: **per-item loads on a paraglider are small precisely
because there are many items.**

At real loads the longest reach anywhere on the test wing is **44 mm**, and
**no rib needs tape to the surface seam** — not at the root, not at the tip,
not on a tandem. That is a useful positive result: reinforcement can be short.
It is not the result I first reported.

## 3. What it catches

A lightening hole in an anchor's load path removes the cloth that would have
carried the spread load. `checkRibStress` reports which anchors have a hole in
their path by name, alongside which needs the longest reinforcement.

**The path has to end where the reinforcement can stop.** Scanning a fixed
fraction of chord instead flagged a hole "in the load path" 500 mm beyond the
point where bare cloth was already carrying the load unaided — every rib on
the wing, which is the same as flagging none. Bounded properly it flags 6 of
11, all outboard, where the chord is short enough for the holes to sit close
to the anchors.

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
