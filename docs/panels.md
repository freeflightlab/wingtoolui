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
| panel edge against its rib, upper surface | 0.0034 mm |
| panel edge against its rib, lower surface | 0.0057 mm |
| adjacent panels along a shared seam | 0.0057 mm |

Asserted for every panel on both surfaces.

## 3. A 137 mm error that was not there

`cell` is **one-indexed**: panel *c* spans rib *c−1* to rib *c*.

I read it as zero-indexed, compared each panel against the rib one along from
the one it is actually sewn to, and got a worst mismatch of **137 mm** — a
wing that could not be built. The real figure is 0.006 mm.

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
