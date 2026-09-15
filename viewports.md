# Viewports: fitting, zooming, and the rib view

## 1. Two kinds of picture, opposite needs

A drawing and a chart want opposite things from the same frame, and getting it
backwards produces something correctly fitted and useless.

**Geometry** — plan, front view, section, rib pattern. Both axes are metres,
so the scale must be identical in x and y. Stretch one axis and the wing drawn
is not the wing.

**Charts** — the polar, the atmosphere plot. A drag polar has Cx on one axis
and Cz on the other: both dimensionless, measuring different things, with the
y range about twenty times the x range. There is no ratio between them to
preserve.

Applying the geometric rule to the polar honoured the aspect ratio of data
that had none. The result was a vertical line down the middle of a wide frame
using **1.6% of its width**, with empty space either side. Independent axes
make it **53× wider** and fill the frame.

`fitScales` in `src/core/viewfit.js` makes the decision, and it is in core
rather than the interface so it can be tested: the suite asserts both the
sliver and the fix, using the real polar's coordinate ranges.

![The nested cutting layout drawn as one strip and wrapped into bands](cutting-layout.svg)

*The same nest twice. Drawn as one strip it is a hairline using about 4% of
the frame; wrapped into bands the way a long roll is laid out on a floor, it
uses 91%. A display transform only — the DXF is byte-identical either way.*

## 2. Pan and zoom

The section-balance and rib views take wheel zoom about the cursor, drag to
pan, and double-click to reset. The default is always the fitted view, and a
badge appears once the view has been moved so it is obvious why a drawing is
no longer framed the way it started.

The transform is stored as a **viewBox**, not an SVG transform. With
`vector-effect: non-scaling-stroke` on every path that keeps line weights
constant as the view changes — zooming in reveals detail rather than
thickening every line, which is what a transform would do.

A view the user has moved survives a redraw. Someone who has zoomed into the
trailing edge to look at the calage should not lose it because a slider moved.

## 3. Tabs

Six viewports do not fit usefully in one grid, so they are grouped:

| tab | shows |
| --- | --- |
| **Wing** *(default)* | plan, front arc, section balance, cutting layout |
| **Rib** | one rib at a time, full frame, with a rib selector |
| **Analysis** | polar, atmosphere |

Only the visible tab is drawn. Hidden grids have no size, so anything drawn
into one fits to nothing — the redraw happens on the way in, not on the way
out.

## 4. The rib view

The wing views answer *what shape is this wing*. This one answers *what do I
cut for station 14*.

The rib is projected back into its own plane using the same transform as the
DXF rib export, so what is on screen is the pattern rather than a perspective
of it. Drawn with it:

- the section outline, and the seam allowance that is actually cut
- the air intake, on the lower surface where it belongs
- the line anchor points that pierce this rib, labelled by row
- the chord line, and leading and trailing edge markers

The caption carries what makes this rib different from its neighbours:
station, chord, thickness as a percentage, washin, dihedral, yaw, and the
flow-alignment angle φ. Stepping the selector across the span shows the chord
shrinking, the washin building and φ growing outboard — which is the wing's
twist distribution made visible one rib at a time.

---

## 5. Dimensions

A plan view without dimensions is a picture, not a drawing. A designer reading
one wants the span and the chords off the page rather than out of a settings
panel, and a reviewer wants to check the drawing agrees with the numbers
beside it.

**On the plan:** span, root chord, tip chord, and tip sweep.

**On the rib** — the drawing a builder actually marks out from:

- the chord along the datum
- maximum thickness, **at the station where it actually occurs**. A reflexed
  or heavily cambered section does not peak where a textbook one does, so the
  dimension finds the maximum rather than reading a nominal 30%.
- every anchor position, measured from the leading edge

They are drawn in model coordinates so they scale and rotate with the
geometry, with tick length in pixels so they stay legible at any zoom, and the
label turned the right way up rather than upside down on a return leg.

### Checked against the model, not just for existing

A drawing whose labels disagree with the design is **worse** than one with no
labels: a reviewer checks the drawing against the panel beside it, and a stale
number there is a number they will trust.

The interface test reads the rendered labels back and compares all eight
against the model — span, root, tip, rib chord and four anchor positions.
Verified in both directions by scaling a label by 10% and watching it fail:

```
FAIL anchor A is drawn at 218 mm, model says 198 mm
```
