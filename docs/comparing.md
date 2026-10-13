# Comparing two designs

Every other model in this project answers a question about **one** wing. A
designer is almost never asking about one wing — they are asking whether *this
change* is worth making. Two more cells, a metre more line, half a degree of
washin: does it pay?

Answering that from two separate reports means reading two columns and doing
the subtraction by eye, which is where small regressions hide. A change that
adds 3% to glide and 8% to line drag looks like an improvement in the glide
column alone.

## What it shows

In the interface, **Remember this design for comparison** (Balance panel)
takes the design on the page as it stands; every change after that is shown
against it, in the panel, until **Forget the remembered design**. The cloth
and nesting rows appear once the new layout is made.

Two comparisons on the default wing, with "Fly on the drag of the lines in
the plan" ticked so that a change to the lines reaches the glide. (Without
it the balance flies on the typed line drag, the glide does not move, and the
panel says why.)

**More cells is not free** — 24 full cells a side against 32:

```
  cells                           48         64   +33.3%
- glide ratio                  10.20       9.97    -2.2%
- sink rate                     1.02       1.05    +2.2%  m/s
- line drag                  0.00784    0.00919   +17.2%
- line length                  315.5      379.0   +20.1%  m
- line count                     222        276   +24.3%
- cloth ordered                 60.1       64.0    +6.4%  m
- nesting                      0.635      0.613    -3.5%

now is worse on glide ratio, sink rate, line drag, line length, line count,
cloth ordered, nesting with nothing measurably better.
```

A third more cells costs 2.2% of glide, through 17% more line drag, because
the derived plan attaches every second rib and so a third more anchors. That
is visible in one line here and buried in two reports otherwise. (A wing whose
anchors are solved to its line length, or written out, does not pay it that
way; the comparison is of the two plans the tool built.)

**Merging rows A+B and C+D** shares each pair's cascade below the top lines:

```
+ glide ratio                  10.20      10.48    +2.8%
+ line drag                  0.00784    0.00623   -20.6%
+ line length                  315.5      244.4   -22.5%  m
+ line count                     222        200    -9.9%
  cloth ordered                 60.1       60.1           m
```

Better on everything it measures — which is the case for reading what it
does not. The merged lines carry two rows' load and are thicker, and how the
wing behaves when one row is pulled without the other is not a number here.

(This page showed glide 9.48 against 9.24, 294.1 m against 375.2 and cloth
69.0 against 77.4. Those were figures typed into the suite to test the
comparison's arithmetic, and no wing built by the tool gave them.)

## What it deliberately does not do

**It does not score a design or pick a winner.** The trade between glide,
weight, material cost and handling is the designer's to make, and a tool that
collapses it into one number hides the decision rather than supporting it.
A test asserts no `winner` or `score` field exists.

**A choice is not an improvement.** More cells, more area and a different
aspect ratio are decisions with no inherent direction, so they are reported
without a verdict. Only metrics with a real better and worse — glide, drag,
mass, material — get one.

**A trade is named as a trade.** When a change helps one thing and costs
another, the summary says so explicitly rather than listing the improvement
first and leaving the reader to notice the rest.

**Noise is not a result.** Changes below half a per cent are not called
significant, and two identical designs report as a no-op rather than as a long
list of zeroes.

**A missing metric is not a zero.** A metric one design has and the other does
not is skipped, because "B has a mass of 4.1 kg and A has none" is not a
difference of 4.1 kg.
