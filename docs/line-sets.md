# Choosing a line set, and keeping it in trim

Two questions a designer actually has, neither of which the tool could answer:
**which line types should I stock**, and **will this cascade hold its trim**.

## 1. Picking per line is optimal and unbuildable

`selectLines` chooses, for each line independently, the lightest material that
carries it. For one 76-line wing that came back with **seven distinct
materials across three suppliers**. Nobody builds a wing that way. Every extra
type is another spool to buy, another splice setup, and another chance of
sewing the wrong line into the wing.

Real wings use four to six types from one supplier.

## 2. Which N types — solved exactly

Sort the materials by strength. Any line takes the cheapest chosen material
that carries it, so **a choice of N materials partitions the load-sorted lines
into N contiguous groups**. Minimising over all such partitions is a
one-dimensional k-segmentation, which dynamic programming solves exactly in
O(lines × materials²).

A greedy pick would be quicker and would lose on the cases that matter: the
best set of four is not usually the best set of three plus one.

| types allowed | used | drag penalty against one line per anchor |
| --- | --- | --- |
| 2 | 2 | 13.6% |
| 3 | 3 | 3.5% |
| 4 | 4 | **0.4%** |
| 6 | 6 | 0.0% |
| 12 | 6 | 0.0% |

**Four types cost 0.4%.** That is the answer a designer wants, and it stops
adding types that buy nothing.

### Two bugs worth recording

**A negative penalty**, which is impossible: the constrained answer appeared
to beat the unconstrained one. The cause was that **strength order and
diameter order are not the same** — a better material is stronger *and*
thinner, so "the weakest that carries" can be thicker than something further
down the list. The floor was being computed with the wrong material.

**Every wing came back infeasible.** `dp[1]` is Infinity when no single
material covers every load, and `Infinity < Infinity × 0.999` is false, so a
search seeded at one type never moved off it. The comparison was right; the
starting point was not.

## 3. Strength and drag are not the whole story

A line set has to hold its **trim**, and the fibres do not move the same way:

- **Dyneema creeps.** Under sustained load it elongates permanently. Worst in
  the most heavily loaded lines, which are the A's.
- **Aramid shrinks.** It takes up moisture and relaxes, roughly uniformly.

On a 6.5 m line over a 200 hour life:

| hours | Dyneema A, half load | aramid C, quarter load |
| --- | --- | --- |
| 20 | +12.4 mm | −0.4 mm |
| 50 | +16.1 mm | −2.1 mm |
| 200 | **+21.7 mm** | **−11.5 mm** |

### The difference is what moves the wing

A cascade built from one fibre drifts as a unit and stays in trim. One that
mixes them drifts differentially, and the A and C rows are about a metre apart
along the chord:

| cascade | trim change over 200 hours |
| --- | --- |
| all Dyneema | **0.00°** |
| Dyneema A, aramid C | **1.70°** |

1.7° is a large fraction of the usable angle-of-attack range, and it arrives
slowly enough that a pilot does not notice it happening. That is what a trim
check is for.

## 4. Why the check comes at 40 to 60 hours

Creep is logarithmic in time: most of the movement is in the first fifty
hours. A check before anything is measurable finds nothing; one at 150 finds
it too late to be a check. `trimSchedule` reports when drift first exceeds the
PMA's ±12 mm band and whether that falls usefully inside the set's life.

## 5. What is estimated

**The rates.** This project has no measured creep data. The *directions* —
Dyneema creeps, aramid shrinks — are well established; the magnitudes are
plausible values calibrated so a 6.5 m A line drifts about 18 mm over 200
hours, which is the order a trim check looks for.

`FIBRE_BEHAVIOUR.provenance` says so, the check stage enforces it, and a drift
result carries `source: 'estimated'`.

My first values gave **28 mm at twenty hours** and 49 mm at 200 — several
times what a real line does. Right in shape, wrong by a factor of three, which
is worse than being obviously broken.
