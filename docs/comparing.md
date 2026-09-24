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

Two real comparisons on the test wing.

**More cells is not free:**

```
  cells                     24         32   +33.3%
- glide ratio             9.48       9.24    -2.5%
- line drag            0.00808    0.00967   +19.6%
- line length            294.1      375.2   +27.6%
- cloth ordered           69.0       77.4   +12.1%
- nesting                0.482      0.430   -10.8%

32 cells is worse on glide ratio, line drag, line length, line count,
cloth ordered, nesting with nothing measurably better.
```

A third more cells costs 2.5% of glide, through 20% more line drag. That is
visible in one line here and buried in two reports otherwise.

**Merging rows is nearly free:**

```
+ glide ratio             9.48       9.98    +5.3%
+ line drag            0.00808    0.00500   -38.2%
+ line length            294.1      191.8   -34.8%
  cloth ordered           69.0       69.0
```

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
