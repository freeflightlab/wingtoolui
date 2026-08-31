# Swoop2: validating against the source method's own design

This project implements the Laboratori d'Envol handbook. Their own published
design is therefore the closest thing to ground truth it can have — not
another manufacturer's wing to be compared against, but the method's author
demonstrating the method.

**Swoop2, 18 m², LEP format 3.30p, version 20260829.**

## 1. Every published figure reproduces

The design ships its own computed output in `lep-out.txt`. Read through this
project's LEP importer:

| | imported | published |
| --- | --- | --- |
| flat area | 18.00 m² | 18.00 m² |
| flat span | 10.48 m | 10.48 m |
| root chord | 2.0907 m | 2.0907 m |
| cells | 50 | 50 |
| ribs | 51 | 51 |

**37 sections parse**, including 15 to 39 — the reader had been documented as
covering 1 to 8, and had never been given a file that used the rest.

The line list converts with **all 93 names recognised**, and totals 241.92 m
against a published 239.09 m without loops — 1.2% over, because the sheet
includes the risers that the published figure counts separately.

## 2. Prefix levels count in opposite directions

The valuable finding. Two makers number cascade levels with a prefix, and they
count opposite ways:

```
Advance TAU DLS    1A3 is at the CANOPY,  4AB1 at the riser
LEparagliding      1A1 is the RISER,      4A1  at the canopy
```

LEP follows the **PMA standard**, which counts main lines as level 1. Advance
does not. Neither is wrong — they are conventions — but a parser assuming one
**silently inverts the other**, reporting a riser as an upper line and a
canopy line as a main.

This project's parser assumed Advance's. On the Swoop2 it produced 4 "uppers"
averaging 988 mm and 48 lines at "cascade-4" averaging 775 mm, which is a
cascade upside down.

### Reading the direction from the geometry

`detectPrefixDirection` does not look at the naming at all. A cascade
converges, so **the level nearest the canopy has the most lines and the
shortest ones**. That is a fact about the wing rather than about the
convention, so it works on a sheet that declares nothing:

```
Swoop2       depth 4: 48 lines at  775 mm   ->  riser-first
             depth 1:  4 lines at  988 mm
```

`applyPrefixDirection` relabels accordingly, and a canopy-first sheet passes
through unchanged. Both directions are asserted, along with the case of too
few levels to tell — reported rather than guessed.

## 3. What this does not settle

The geometry reproduces exactly, which validates the importer and the
planform arithmetic. It does **not** validate the aerodynamics, the load
model, or the panel development against this wing — the design publishes its
own line loads and 3D surfaces, and comparing those is the obvious next step.
