# Rods, and seeing the structure

A rod is a length of nylon sewn into the sail to hold a shape the cloth cannot
hold alone. It works in **bending** — the one thing fabric cannot do at all —
and that is why it is there.

## 1. Groups, because that is how a design file describes them

`buildRods` places one rod per rib running back from the nose, which is the
common case. Real files are not limited to it. LEparagliding's section 21
defines rods as **groups**, each a chord range over a rib range, and
Laboratori d'envol's Swoop2 has two: 12 to 18.5% of chord and 23.5 to 29.5%
over ribs 1 to 25. So a rod is neither always at the leading edge nor always
alone.

`rodGroup` and `buildRodGroups` add that form beside the existing one rather
than replacing it, and report stock by diameter, which is what actually gets
ordered.

## 2. A clash the separate rules could not see

A rod occupies a band of chord. So do the lightening holes and the line
anchors, and they are placed by rules that do not know about each other — the
same trap `checkRibInternals` was written for, met again with a component it
does not know about.

`checkRodClearance` found the B anchor at 30% of chord sitting inside a rod
band running 23.5 to 29.5%. **A rod cannot pass through a hole, and an anchor
tab sewn over a rod puts its load into a hinge.**

## 3. The Structure view (rods since moved to the rib)

Diagonals and rods were computed, exported, and never drawn. A number a
designer can act on is only useful if they can see what it applies to.

The new tab shows both. Diagonals are drawn **fibre by fibre**, blue where the
fabric is in tension and carrying load, red where it is past 90 degrees to the
load and carrying none — so a diagonal that is too wide looks too wide.
Rods are drawn on the rib section at their real chord positions and turn red
where they clash.

## 4. I duplicated a module before checking

I wrote rods as a new file. The build's duplicate-name guard stopped it:
`buildRods` already existed in `reinforcement.js`, more complete than mine —
sleeves, closed-rib handling, materials.

`tools/find.mjs` exists precisely for this and I did not run it. The guard
caught what the habit should have.

---

## 5. On the rib, where they make sense

Rods had their own viewport, which redrew a bare aerofoil with no holes, no
anchors and no diagonals — a second, poorer rib view. **A rod alone says
nothing.** What a designer needs to see is whether it clears the lightening
holes, whether an anchor tab lands on it, and whether a leading-edge pair
actually meets round the nose.

They are drawn on the real rib now, in the rib's own projection, with the
clash colouring beside the holes and anchors they might clash with. The
separate viewport is gone and the toggle is under Internal structure.

## 6. A rod at the nose needs both surfaces

`rodGroup` puts a rod on one surface. **The Swoop2 does not work that way.**
Its section 21 gives each group an upper *and* a lower extent:

```
group 1   upper 12.0 to 18.5%    lower  7.0 to 15.0%
group 2   upper 23.5 to 29.5%    lower 63.0 to 70.0%
```

The first is a leading-edge rod: back from the nose along the upper surface
and forward along the lower, so **the pair wraps the nose and holds its
radius**. A rod on one surface alone would hinge at the nose rather than hold
it, which is the opposite of what it is for.

The second is not a nose rod at all — 23.5% upper and 63% lower are two
separate stiffeners that happen to share a group. `noseRodGroup` tells them
apart by where the extents sit rather than by a flag anyone sets: a pair wraps
the nose when **both** extents reach forward of 20% chord.

## 7. Writing the rods out

Four sliders cannot say "two groups, each with two extents". A written spec
can, in the form section 21 states:

```
# name        upper        lower       dia  ribs
leading edge  12.0 18.5    7.0 15.0    1.5  0 25
mid           23.5 29.5    63.0 70.0   1.1  0 25
```

That is the Swoop2's own definition, transcribed, and it is the default in the
tool. A dash in place of a pair means no rod on that surface.

It refuses what a person mistypes: a backwards extent, an extent off the
chord, a group with no extent at all, too few numbers, and a rib beyond the
end of the wing. The name may contain spaces — "leading edge" is what someone
writes — so the numbers are read from the right.
