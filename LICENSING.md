# Licensing — a decision still to be made

**There is deliberately no `LICENSE` file yet.** Without one, default
copyright applies and others may not reuse the code. That is a decision to
make consciously rather than by omission, so here is what bears on it.

## The upstream position

The design method, equations and worked example are the work of **Laboratori
d'envol**, published freely at laboratoridenvol.com. **Their software is
released under the GNU GPL.**

This project is an independent implementation of the published *method* — the
equations, tables and worked example from the handbook — not a translation or
derivative of their source code. Whether that distinction is sufficient is a
legal question, not an engineering one, and it should be settled before a
licence is chosen. Asking Laboratori d'envol directly would be the
straightforward route, and they have been generous with the material.

## The reference data is not ours

`data/reference/` holds published line tables and specifications from Ozone,
PHI, BGD, Skywalk and UP Paragliders. It is here so the calculations can be
**checked**, and every file carries its source.

That is a different thing from redistributing design material, and a licence
covering the code should not be read as covering this data. If the repository
is made public, a line in the README saying so is worth adding, and removing
the data on request from any manufacturer should be the default answer.

## What a chosen licence should probably say

Whatever is chosen, this repository already carries a disclaimer that matters
more than the licence: **a wing designed with this tool has not been tested,
certified, or flown.** See the Safety section of `README.md`. A licence with
an explicit no-warranty clause — which the GPL, MIT and Apache-2.0 all have —
is the right shape.

## Until then

`package.json` declares `"license": "UNLICENSED"`, which is accurate rather
than restrictive-by-accident. Replace it and add a `LICENSE` file once the
question above is settled.
