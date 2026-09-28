# The risers hang; they do not fan

A paraglider does not hang its lines from the karabiner. Between the karabiner
and the lines there is about half a metre of riser webbing, and it hangs
**vertically**, because the pilot's weight pulls straight down on it. The line
cascade fans out from the top of that webbing.

This model ran the lines from the karabiner itself. The fan therefore started
at the pilot: a main line reached nearly three metres sideways from the
karabiner and sat **48 degrees from vertical for its whole length**. Nothing on
a real wing does that.

## Why vertical is not an approximation

Webbing is flexible and carries only tension, so under a weight it lies along
the line of that weight. A riser that is not vertical is a riser with
something else pushing on it, and there is nothing else there.

## Where the lengths go

`lineLengthM` is the length of the **lines**: wing to riser top. The risers
hang below that, and the karabiner below them.

I built it the other way first — riser top half a metre above a fixed
karabiner — which shortened every line. The wing's total line length fell from
215 m to 187 against a published figure that counts lines and not webbing, and
the test caught it.

## A riser is not a line

It has no name in the line-naming convention, is not cut from line stock, and
does not belong in a total line length. Pushing the webbing into `plan.lines`
broke the name parser and the length total at once, which is the system saying
it is not a line. It lives in `plan.riserWebbing` and carries `kind:
'webbing'` rather than a line level — the audit has a rule that the deepest
LINE level is `main`, and it caught me undoing a rename this project had
already made once.

`plan.risers` is a third thing again: which rows each riser carries. I
overwrote it before noticing.
