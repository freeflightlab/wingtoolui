# The Swoop2's rods, against its own program

The rods were read from LEP section 21 and never checked against anything.
That was the whole problem: section 21 gives four numbers for each end of a
rod, and a reading of them can look perfectly sensible while producing the
wrong rods.

Laboratori d'envol's own output for the Swoop2 lists every rod it computes
(`lep-out.txt`, section 8). That is ground truth, and it is in
`data/reference/swoop2-joncs.tsv`: two blocs of 25 rods a side, 16.53 m and
19.875 m, **72.81 m for both sides**.

| | the program prints | `lepJoncs`, on the file | `buildRods`, on this tool's ribs |
| --- | --- | --- | --- |
| rods a side | **50** | 50 | 50 |
| nose rods, a side | **16.53 m** | 16.53 m | 16.53 m |
| battens, a side | **19.875 m** | 19.875 m | 19.88 m |
| worst single rod | — | 0.5 mm off its printed length | 0.8 mm |

## Three readings, two of them wrong

**First: every pair of numbers is a rod.** `12.0 18.5` was a rod from 12% to
18.5% of the upper surface, `7.0 15.0` another on the lower. Four times too
many pieces and about half the material.

**Then: a nose rod is one piece.** The longest rod in bloc 1 is 82.6 cm, and
six and a half per cent of a 2.09 m chord is 14 cm, so it cannot be a
chordwise extent: it runs from the upper surface, round the leading edge, to
the lower. Right — but the reference table had been read with the program's
TOTAL line as a 26th rod of bloc 2, and bloc 2 itself, tried as a second nose
rod, came out 92% too long. It was carried as "not understood", which was
honest and was still not an answer.

**Now: reading the program.** Section 21 names a type for each bloc.

- **Type 1** is the nose rod. Its two rows are the run-out zones at its upper
  and lower ends: where the rod starts to leave the surface, where it ends,
  how far inside the surface it is there, and with what exponent. The rod
  runs between the two ends, round the nose.
- **Type 4** is an extrados rod — a batten along the upper surface. Its first
  row is the zone at its forward end and its second the zone at its aft end:
  23.5% to 70% of chord on the Swoop2.

`lepJoncs` follows the program step for step for both, on the file's own
section, and all 50 rods come out at their printed length to the printed
tenth of a centimetre. Both sides together are the printed 72.81 m.

## The same construction, for any wing

`buildRods` builds rods the same way on the ribs as this tool builds them —
which is what a wing that is not a file gets. On the Swoop2's own ribs, at
the 50 points a surface the interface uses, every one of the 50 is within
0.8 mm of its printed length.

It counts what the wing has: a rib on the centreline has one rod of each
kind, where the program lists it for each side. So 98 rods and 70.98 m for
the wing, against the printed 100 and 72.81 m.

## And its holes clear them

The Swoop2's own holes (its section 4) keep 1.28% of chord from its own rods
on every rib: 27 mm at the centre, 10 mm at the last rodded rib. That is
where this tool's clearance between a rod and an opening comes from
(`docs/rods.md`, section 4).

## What this cost

Nothing here was found by the tool. It was found by checking the Swoop2
against its own published output — which existed in the repository the whole
time, unread — and then, later, by reading a bill of materials for the default
wing and seeing 49 rods come to 6.7 metres.
