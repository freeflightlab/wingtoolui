# The risers lean toward their lines

A paraglider does not hang its lines from the karabiner. Between the karabiner
and the lines there is about half a metre of riser webbing, and the line
cascade fans out from the top of that webbing.

This model ran the lines from the karabiner itself at first. The fan therefore
started at the pilot: a main line reached nearly three metres sideways from
the karabiner and sat far from vertical for its whole length. Nothing on a
real wing does that.

## Which way a riser points

Webbing is flexible and carries only tension, so it lies along the forces at
its ends. At its top those are its own lines, and their resultant is not
vertical. In side view it nearly is: the pilot hangs under the balance point.
In front view the lines of each half pull up and **out**, toward that half of
the wing, and the chest strap holds the two karabiners together against it.

So each riser leans outboard, along the pull of the lines it carries:

| | riser | top is outboard of the karabiner by | lean |
| --- | --- | --- | --- |
| the default wing | 500 mm | 13 cm | 15° |
| the suite's test wing | 500 mm | 15 cm | 17° |
| the Swoop2 | 470 mm | 15.4, 15.3 and 18.5 cm (A, B, C) | 19° to 23° |

Fore and aft it stands within a few degrees of upright — the front riser a
little forward, the rear one a little back, 8° at most.

`buildLinePlan` points each riser at the load-weighted centre of the anchors
its lines reach, which is LEparagliding's construction; on the Swoop2 the
program's own 3D output has the A riser top 15.4 cm outboard of the karabiner
and 1.8 cm forward, and this lands on it. Checked independently against the
load model, a riser placed that way is within 4.0° of the resultant of its own
lines' tensions, and given those resultants (`riserResultants`) and rebuilt,
within 0.3°.

### What this page used to say

That the risers hang **vertically**, "because the pilot's weight pulls straight
down" and "a riser that is not vertical is a riser with something else pushing
on it, and there is nothing else there". There is: the other end. The model
drew them straight down under that reasoning for some time, which is the one
attitude the forces rule out.

## Where the lengths go

`lineLengthM` — **Line length** in the interface — is the height of the
**lines**: wing to riser top. The risers hang below that, and the karabiner
below them: on the default wing 6.5 m of line and a 0.5 m riser put the pilot
7.0 m under the wing, and the balance is solved at that depth.

I built it the other way first — riser top half a metre above a fixed
karabiner — which shortened every line, and the comparison with a published
total, which counts lines and not webbing, caught it.

When a design is made in several sizes the lines go with the size and the
riser does not: `docs/scaling.md`.

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

## And the brake has none

The brake's lower line runs from the handle through a pulley on the rear
riser. It is marked `riser: 'K'` to say which cascade it belongs to, and
`plan.riserWebbing` took that for a fourth riser: a strap drawn over the A
riser, and in the bill of materials **eight risers and 4.0 m of webbing on a
wing with six and 3.0 m**. Every plan the interface builds has the brake
cascade in it; the tests of the risers built theirs without.
