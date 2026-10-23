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

The two complete designs here come with the cutting files their program
drew, and every piece in them is measured (`data/reference/lep/*-cut-parts.tsv`).
The tool's own development of their panels — ovalised 6%, one 10 mm
allowance all round — put the wrong amount of cloth on each surface: 4 to
6% short on the upper, 5 to 8% over on the lower, which it ran over the
intake and round to the leading edge. (11.24 and 10.52 m² a side on the
Swoop2, against 11.72 and 9.75 cut.) Four things are the program's, read
from its source in the design archives, and `lepPanels` does all four:

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
  the rear (−4) or the whole of it (−1), to fractions given at each rib.
- **Seam allowances** from section 6, by edge: 15 mm at the sides of the
  Tuluaq's panels, 25 at the front, 10 at the trailing edge; the Swoop2's 10,
  10 and 20. Each edge of the outline is moved out by its own, corners
  mitred.

| | upper, a side | lower, a side | worst panel |
| --- | --- | --- | --- |
| Swoop2, its cutting file | 11.7194 m² | 9.7496 m² | |
| Swoop2, `lepPanels` | 11.7224 (+0.03%) | 9.7513 (+0.02%) | 0.04% |
| Tuluaq-19, its cutting file | 12.6151 m² | 10.2266 m² | |
| Tuluaq-19, `lepPanels` | 12.6169 (+0.01%) | 10.2268 (+0.00%) | 0.14% |

Piece by piece, the Tuluaq's lower panels are all within 0.04% of the file's
and every one of its 34 cut lines is the file's length to 3 mm. Its worst
panel is the upper one at the tip, 0.14% over: it was 0.12% before its
lowered rib 17 was placed, for the surfaces, as its program places it
(`docs/internal-structure.md`, section 4), which the diagonals beside that
rib confirm to a part in a million. What is left at the tip is not
explained. (The Swoop2's
upper panel at the tip is drawn 1.4 cm open in its file and measured across
the gap, so it is held to a per cent.)

The intakes were the last 0.8%. Before them, the cells the file closes came
out 2% short, and the pattern was the design's own: the upper panels of
cells 1, 2, 4, 8 and 12, the lower of 3, 7, 11 and 15 — and a cell closed
half-way at both ribs was short by as much as one closed all the way at one.

An imported design's panels are its own in the interface: the Cut tab, the
cutting files, the printed pattern and the bill all use them, and its ribs
are cut with its own rib allowance — within 0.25% of its file on every rib
but the tip, its section thinned to a sliver. The ovalization and seam
allowance controls, this tool's stand-ins for what the design states, are
not offered on it.

What they sew inside their cells — full diagonals, straps, pieces between two
ribs and rod pockets — is now cut the same way, every piece to its cutting
file's (`docs/internal-structure.md`), and the bill carries it: 11.87 m² for
the Swoop2 and 10.48 for the Tuluaq, where it had 3.9 and 5.5 of this tool's
own diagonals. Their trailing-edge mini-ribs, 0.84 and 0.89 m², are not yet
built.
