# The Swoop2's rods, against its own program

The rods were read from LEP section 21 and never checked against anything.
That was the whole problem: section 21 gives chordwise extents, and a reading
of it can look perfectly sensible while producing the wrong rods.

Laboratori d'envol's own output for the Swoop2 lists every jonc it computes.
That is ground truth, and it is now in `data/reference/swoop2-joncs.tsv`.

| | published | model, before | model, now |
| --- | --- | --- | --- |
| joncs | **51** | 208 | **51** |
| blocs | 2 (25 + 26) | — | 2 (25 + 26) |
| total | 37.14 m | 20.8 m | — |

Four times too many pieces and about half the material, for months.

## A jonc is one piece, wrapping the nose

The longest rod in bloc 1 is **82.6 cm**. Bloc 1's extents span 12.0 to 18.5
per cent of a 2.09 m chord — six and a half per cent of that chord is 14 cm.

An 82.6 cm rod is not a chordwise extent. It is one continuous piece running
from its upper extent, **round the leading edge**, to its lower extent,
measured along the surface. That is what a leading-edge rod is: a single
length of nylon in a sleeve that wraps the nose. Two pieces butted at the
leading edge would hinge exactly where the rod exists to stop it hinging.

`buildNoseJoncs` builds it that way, and the count now matches bloc for bloc.

## Bloc 1 is close; bloc 2 is not understood

**Bloc 1:** 14.35 m modelled against 16.53 m published — 13% low, which is
the parametric wing here not being the Swoop2's exact rib geometry.

**Bloc 2 is not claimed.** Its rows read `23.5 29.5` and `63.0 70.0`. Read as
two chordwise segments that is about 13% of chord — 27 cm — where the program
prints joncs up to **99.3 cm**. Read as a nose wrap instead it gives 39.5 m
against a published 20.6 m, which is as wrong the other way.

Neither reading fits, so neither is used. The bloc is carried with
`understood: false` and the reason recorded, rather than parsed into a number
that looks like an answer. That is the same treatment as LEP section 12's
types 15 and 16.

## What this cost

Nothing here was found by the tool. It was found by someone checking the
Swoop2 against its own published output — which existed in the repository the
whole time, unread.
