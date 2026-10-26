# Licensing

**The code is free software under the GNU General Public License, version
3.** The licence is the `LICENSE` file: the GPL's own text as the Free
Software Foundation publishes it, the same file the repository on GitHub
carries.

## Keep the file exactly as it is

The repository is updated by replacing its whole tree with a release
(`PUBLISHING.md`): every tracked file is removed and the release unpacked in
their place. The `LICENSE` was created on GitHub, and a release that did not
carry it deleted it at the next commit. Releases carry it now, byte for byte
— 35,149 bytes, ending in a newline — so a commit leaves it untouched.

The self-audit (`npm run audit`, a stage of `npm run check`) holds it there:
it fails if the file differs from the GPL's text by so much as its last
newline, or if `package.json` or the README say something else about the
licence. A copy that loses its final newline is a different file to git; one
of the GPL's text supplied as an attachment did, and was not used.

## Which version

`package.json` declares `"license": "GPL-3.0-only"`: the file is version 3,
and nothing in the repository grants "or any later version". Granting that is
the copyright holder's decision; if it is wanted, say so in the README and
change the declaration to `GPL-3.0-or-later`.

## The upstream position

The design method, equations and worked example are the work of **Laboratori
d'envol**, published freely at laboratoridenvol.com. Their program,
LEparagliding, names its licence in every output it writes: "General Public
License GNU/GPL 3.0".

Most of this project is an independent implementation of the published
*method*. Three modules go further and reproduce what that program computes
for an imported design, written from its published source: `leplines.js`,
`lepstructure.js` and `lepbalance.js`. This project being under the same
licence, the question this note used to leave open — whether that makes a
derivative work — no longer changes the terms either way. It is still worth
telling Laboratori d'envol; they have been generous with the material.

## The reference data is not ours

`data/reference/` holds published and supplied line tables, line-plan
drawings and specifications from Ozone, PHI, BGD, Niviuk, Skywalk and UP
Paragliders, and three complete designs' files as Laboratori d'envol
published them — two of its own and Crazy Bird's Tuluaq-19. It is here so
the calculations can be **checked**, and every file carries its source.

The licence covers the code. It does not cover this data, and should not be
read as covering it. Removing it on request from any manufacturer should be
the default answer.

## No warranty

The GPL disclaims warranty (its sections 15 and 16), and this repository
carries a disclaimer that matters more: **a wing designed with this tool has
not been tested, certified, or flown.** See the Safety section of
`README.md`; the tool says the same at the foot of its controls, with where
its source and licence are.
