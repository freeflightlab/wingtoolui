# Panels: from surface to cutting file

A panel is the cloth between two ribs on one surface. It is cut flat and sewn
into a surface that is not flat, so the pattern has to be the surface
*unrolled* — and whether it is unrolled correctly decides whether the wing
goes together at all.

## 1. How a panel is developed

Each cell is triangulated between its two rib curves, and the triangles are
laid flat in sequence, each sharing an edge with the last. The corrected
distortion measure and the reasons behind the method are in
`docs/departures.md`; this document is about what comes out.

## 2. Does it sew?

The question a builder has, asked directly. A panel is sewn to its neighbour
along one edge and to a rib along that same edge, and the rib is cut
separately from the aerofoil profile. If those lengths disagree the wing will
not go together flat, and no accuracy anywhere else rescues it.

| seam | worst mismatch |
| --- | --- |
| panel edge against its rib, upper surface | 0.0002 mm |
| panel edge against its rib, lower surface | 0.0002 mm |
| adjacent panels along a shared seam | 0.0002 mm |

Asserted for every panel on both surfaces.

## 3. A 137 mm error that was not there

`cell` is **one-indexed**: panel *c* spans rib *c−1* to rib *c*.

I read it as zero-indexed, compared each panel against the rib one along from
the one it is actually sewn to, and got a worst mismatch of **137 mm** — a
wing that could not be built. The real figure was a few thousandths of a
millimetre.

The convention is invisible until someone guesses it wrong, so it is pinned as
a test of its own.

This is the second time in two rounds that a result which looked like a
serious modelling fault turned out to be the measurement. The apparent 6–8%
error in the arc, in `docs/departures.md`, was the same.

**A result that says the model is badly wrong is worth measuring twice before
it is worth reporting.**

## 4. What goes on the cutting file

Development gives the sewing line. The cut line adds a seam allowance outside
it, and ovalisation widens the panel between ribs so it billows — see
`docs/departures.md` for why the billow is pinned at zero on the seams, which
is what keeps sections 2 and 3 true after it is applied.

## 5. A design's own panels, against its own cutting file

The three complete designs here come with the cutting files their program
drew, and every piece in them is measured (`data/reference/lep/*-cut-parts.tsv`).
The tool's own development of their panels — ovalised 6%, one 10 mm
allowance all round — put the wrong amount of cloth on each surface: 4 to
6% short on the upper, 5 to 8% over on the lower, which it ran over the
intake and round to the leading edge. (11.24 and 10.52 m² a side on the
Swoop2, against 11.72 and 9.75 cut.) Six things are the program's, read
from its source in the design archives, and `lepPanels` does all six:

- **Where the surfaces part.** The upper panel runs from the trailing edge
  over the top, round the nose and down to where the intake opens, 1.6% of
  chord back under the Tuluaq's nose; the lower from where it closes. The
  opening between is no panel's.
- **Skin tension.** Each side of a panel is cut wider than the cell by the
  design's own table (section 31, or section 5): a per cent of the cell's
  width at the middle of that surface, at a position along the edge — from
  the front on the upper panel, from the trailing edge on the lower, the
  program measuring the two from opposite ends. 4.0% on the Tuluaq's upper
  surface and 3.2% on its lower.
- **Intakes closed.** Section 26 closes part of some cells' intakes: the
  upper panel runs on over the front of the intake (type 4), the lower over
  the rear (−4) or the whole of it (−1), to fractions given at each rib —
  or across it on a diagonal, the whole intake at one rib and none at the
  other (−2 and −3; the gnuC2-23's cell 26).
- **Seam allowances** from section 6, by edge: 15 mm at the sides of the
  Tuluaq's panels, 25 at the front, 10 at the trailing edge; the Swoop2's 10,
  10 and 20; the gnuC2-23's 12, 22 and 22. Each edge of the outline is moved
  out by its own, corners mitred.
- **Seam matching.** Over-width moves a panel's edge and changes its length.
  Section 5's `1000 1.0`, in all three files, asks for the program's
  "perfect matching": each sewing edge's last part — the last 15% on the
  upper surface, the first 20% from the intake on the lower — is stretched
  back to the length of the rib it is sewn to, and the panel's end is then
  turned, five times over, to take up what that does to its neighbour. The
  program's output prints every edge and its rib equal (its section 6); the
  tool's are, to a millionth of a millimetre. Only the ends move: the sides
  of the cut line stay on the edges as they were. The program lays an upper
  panel out from its trailing edge forward, and the turning converges only
  in that frame.
- **3D shaping.** Section 29 cuts panels across at section points: the
  gnuC2-23 cuts every upper panel at point 73, 12.6% of chord behind the
  leading edge, into a front piece and a rear, each with the side allowance
  at the cut. (The program's first zone is empty — the line that would fill
  it is in a block its author commented out — and its easing of the cut
  edges, nil in this file, is not reproduced.)

| | upper, a side | lower, a side | worst panel |
| --- | --- | --- | --- |
| Swoop2, its cutting file | 11.7194 m² | 9.7496 m² | |
| Swoop2, `lepPanels` | 11.7203 (+0.01%) | 9.7512 (+0.02%) | 0.034% |
| Tuluaq-19, its cutting file | 12.6151 m² | 10.2266 m² | |
| Tuluaq-19, `lepPanels` | 12.6149 (−0.00%) | 10.2267 (+0.00%) | 0.011% |
| gnuC2-23, its cutting file | 15.5406 m², 60 pieces | 12.7994 m² | |
| gnuC2-23, `lepPanels` | 15.5416 (+0.01%) | 12.7994 (0.00%) | 0.007% |

The Tuluaq's upper panel at the tip was 0.14% over and unexplained until
the seam matching: it is the panel whose edges over-width changes most.
Every cut line of both older designs is the file's length to 2 mm.

What is left is where the program lays a closed intake out by itself and
joins it to the panel. The Swoop2's lower panels of the odd cells run on
over the rear of the intake (−4) and are 0.03% over; the gnuC2-23's four
closed tip cells are 0.003 to 0.011% small, 0.3 mm at the intake's first
points. The gnuC2-23's tip rib is flat (section 30, thickness 0), so the
front piece of its last upper panel runs its edge to the leading edge and
back on itself; that outline crosses itself and its signed area is 2.5% off
the file's. (The Swoop2's upper panel at the tip is drawn 1.4 cm open in its
file and measured across the gap, so it is held to a per cent.)

The intakes were the last 0.8%. Before them, the cells the file closes came
out 2% short, and the pattern was the design's own: the upper panels of
cells 1, 2, 4, 8 and 12, the lower of 3, 7, 11 and 15 — and a cell closed
half-way at both ribs was short by as much as one closed all the way at one.

An imported design's panels are its own in the interface: the Cut tab, the
cutting files, the printed pattern and the bill all use them. Its ribs are
cut as its program cuts them (`lepRibCutLine`, its 6.11): each point of the
section moved out by the rib allowance along the mean of the angles of the
segments either side, the leading edge straight forward, the line closed
through the trailing edge itself. Every rib of the three files comes out to
0.002% of its area, and the gnuC2-23's — whose file was measured for it — to
0.05 mm of its cut line's length. An offset of the outline, mitred at the
trailing edge, had carried 2 to 3 cm² more on every rib: 0.03% at the root,
0.35% on the gnuC2-23's rib 30 and 2.5% on the Swoop2's tip. Their holes are
the program's polygons — 39 sides until 3.30, then 60 or what its section 37
says (the Swoop2's 55) — and each rib's take out its file's area to the
hundredth of a cm² it is written to. The bill weighs these ribs as cut. The
ovalization and seam allowance controls, this tool's stand-ins for what the
design states, are not offered on it.

What they sew inside their cells — full diagonals, V-rib strips, straps,
pieces between two ribs and rod pockets — is cut the same way, every piece to
its cutting file's (`docs/internal-structure.md`), and the bill carries it:
11.87 m² for the Swoop2, 10.48 for the Tuluaq and 11.33 for the gnuC2-23.
So are their trailing-edge mini-ribs, raised at the front to meet the
billow of the cell, which the program finds from these panels: 0.82, 0.89
and 1.50 m² of rib cloth for the wing.
