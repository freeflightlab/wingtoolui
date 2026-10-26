# Rods

A rod is a length of nylon in a pocket sewn to a rib. It works in **bending**
— the one thing cloth cannot do at all — and holds a shape the wing would lose
when it is not pressurised: above all, the radius of the nose.

## 1. Two kinds

Laboratori d'envol's Swoop2, the first complete design in the repository,
defines its rods in section 21 of its file, and its design program prints
every rod it makes. That table is ground truth and is in
`data/reference/swoop2-joncs.tsv`. (The Tuluaq-19 has a nose rod on each of
its first fourteen ribs; the gnuC2-23 a shark nose, section 6.)

| kind | where it runs | on the Swoop2 | length |
| --- | --- | --- | --- |
| **nose** | one piece: from the upper surface, round the leading edge, to the lower | 18.5% of chord on top to 15% underneath | 82.6 cm at the centre, 30.8 cm at the last |
| **batten** | along the upper surface only | 23.5% to 70% of chord | 99.3 cm to 37.0 cm |

A nose rod is **one piece**. Two pieces butted at the leading edge would hinge
exactly where the rod is there to stop a hinge.

Each end of a rod leaves the surface over a short run-out zone, curving into
the rib by a per cent or two of chord, so the end of a stiff rod does not bear
on the sail. Section 21 gives each zone as four numbers:

```
12.0  18.5   1.5   2.0      upper end: leaves the surface from 12%, ends at 18.5%,
                            1.5% of chord inside it there, growing as distance squared
 7.0  15.0   2.0   2.0      lower end: from 7%, ends at 15%, 2% inside
```

## 2. What this document used to say, and the tool used to do

That row was read as "a rod from 12% to 18.5% of the upper surface, 1.5 mm in
diameter", and its neighbour as a second rod from 7% to 15% of the lower. A
later version joined the two into a "pair that wraps the nose" — still two
pieces, each a few per cent of chord long, neither reaching the nose.

The reading was corrected for an **imported** file once the program's own rod
table was looked at: 82.6 cm is not a chordwise extent of 14 cm. It was never
corrected for a wing built from the sliders. Until October 2026 every
parametric wing was drawn, billed and marked for cutting with a stub from 12%
to 18.5% of the upper surface that did not reach the nose — 49 pieces, 6.7 m
and 13 g on the default wing, where rods made the way the Swoop2's are come to
39.8 m and 80 g.

Two more things fell out of the same misreading:

- **The 1.5 and 1.1 are not diameters.** They are how far the rod's end leaves
  the surface, in per cent of chord. The file states no diameter at all, so
  the diameter is a setting here and nothing else.
- **An anchor inside a rod's run is not a clash.** `checkRodClearance` reported
  one wherever a line anchor fell within a rod's chord range, with the
  reasoning that "an anchor tab sewn over a rod puts its load into a hinge".
  The Swoop2 has its A anchors at 11% of chord inside a nose rod that runs to
  15%. That check is gone.

## 3. Built as the program builds them

`rodPolyline` builds one rod on one rib section: along the surface, round the
nose for a nose rod, and away from the surface across each run-out zone. It
returns the rod as a line in the rib's own plane, so the same line is drawn on
the Rib tab, marked on the rib pattern and measured for the bill.

`buildRods` does that for every group on every rib it covers. With nothing
said, a wing gets a nose rod on every rib, to the Swoop2's proportions.

On the Swoop2's own ribs, at the 50 points a surface the interface uses, every
one of the 50 rods comes out within **0.8 mm** of the length its program
prints, and both kinds total what it prints (16.53 m and 19.88 m a side). An
imported file still takes its rods from `lepJoncs`, which follows the program
step for step; see `docs/rods-validated.md`.

On the default wing (49 ribs):

| rods | pieces | length | at 1.5 mm nylon |
| --- | --- | --- | --- |
| nose rod on every rib | 49 | 35 to 101 cm, 39.8 m | 80 g |
| and the Swoop2's batten | + 49 | 43 to 123 cm, 48.5 m | + 98 g |

Mass goes as the square of the diameter, which is the trade to see. The same
49 nose rods:

| diameter | 1.1 mm | 1.3 mm | 1.5 mm | 2.0 mm | 2.5 mm |
| --- | --- | --- | --- | --- | --- |
| nylon | 43 g | 60 g | 80 g | 142 g | 222 g |

## 4. Rods and the openings in a rib

A rod's pocket is sewn to the rib, so it has to have rib to be sewn to: a rod
cannot cross a lightening hole, nor run within a few millimetres of its edge.

Rods and openings were placed by rules that did not know about each other.
With the nose rod corrected, the first opening came within **7 mm** of the
rod's upper end on the centre rib and **2.5 mm** on the tip rib.

The Swoop2 shows what a design keeps: its own holes clear its own rods by
1.28% of chord on every rib — 27 mm at the centre, 10 mm at its outermost
rod. So:

- `buildRibHoles` shapes each opening to stay 1.3% of chord, and never less
  than 10 mm, from any rod on its rib. It costs a rounded corner of the first
  opening — 97% of the open area is kept — and no opening is lost.
- `checkRodClearance` is the independent look: the rod's own line against each
  opening's outline, flagged under 8 mm. It also sees a design's own holes.

Every opening the interface cuts comes from one function, so the Rib tab, the
rib pattern, the stress report, the rod check and the bill cannot each cut a
slightly different hole.

## 5. In the interface

Under **Internal structure**:

- **Nylon rods** — on or off. Off, the bill puts mylar at the intakes
  instead: something has to hold the nose.
- **Nose rod back to, on top** and **and underneath** — where the rod ends on
  each surface, in per cent of chord (18.5 and 15).
- **Rod diameter** and **Rods out to** — how far along the span they go.
- **Write the rods out** — one group to a line, in the form section 21
  states, with the kind named:

  ```
  nose      12.0 18.5   7.0 15.0    1.5
  batten    23.5 29.5   63.0 70.0   1.5
  ```

  Two zones in per cent of chord, then the diameter in millimetres and,
  optionally, the first and last rib (0 is the centre rib). For a nose rod
  the zones are the upper and lower run-outs, and the rod runs between their
  ends, round the nose. For a batten both zones are on the upper surface and
  the rod runs from the start of the first to the end of the second. A line
  that starts with neither word is read by its numbers, and the note says how
  it was read. `parseRodSpec` refuses what a person mistypes: a backwards
  zone, a zone off the chord, a missing diameter, a rib beyond the wing.

The note under the controls says what the rods come to — how many, how long,
how heavy — and whether any crosses an opening, and it is re-evaluated on
every rebuild.

On the **Rib** tab the nose rod is yellow and a batten orange; a rod that
crosses an opening is red. The rib pattern file carries them on their own
layer.

A project saved before the correction says "rod from 12 to 18.5% of chord".
It opens with a nose rod back to that 18.5%, which is what it meant.

## 6. Not covered

- **LEparagliding's types 2 and 5.** It has five kinds; types 1 and 4 are
  the two the Swoop2 uses, and type 3 the gnuC2-23's shark nose — an upper
  rod from the top round the nose to the intake and a lower one along the
  intake, each bent by its own parabola at its end, built as its program
  builds them and within its printed 0.05 cm on all 60
  (`docs/gnuc2-23.md`). A file using another is reported, not drawn. For a
  wing that is not a file, types 1 and 4 are what is built.
- **Stiffness.** A rod is a length and a mass. Whether a 1.5 mm rod holds a
  nose that a 1.1 mm one lets fold is not computed.
- **Pockets.** The pocket cloth is not weighed; the bill says so.
- **Diameter.** No design in the repository states one. The default is a
  setting, not a finding.
