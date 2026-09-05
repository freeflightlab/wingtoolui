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

## 3. The Structure view

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
