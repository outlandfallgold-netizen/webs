# Pallet Planner

A single-page planner for stacking loose parts on the shop pallet, with a printable plan
sheet and a pallet card for the stack.

The parts arrive loose, so the cardboard is thrown away and only the part matters: a
forging on a pallet is a disc of a known diameter and thickness, and that is all the
planner needs. The pallet and the shipping limits are fixed and never typed — they print
on the sheet so the stack can be checked against them.

## Running it

Open `index.html` in a browser. There is nothing to install and nothing to build: three
files, no dependencies, no network calls. `pallet-planner.zip` holds the same three files
for a machine that never sees this repository.

## Typing a part in

Every part field starts blank, and **Clear** blanks them again — no leftover size or
weight from the last job to be mistaken for this one.

- **Grade** — A105, A130, A185, A350, F304-304L, F316-316L, F22, C22. The grade sets
  the density the estimate uses and prints on the sheet and the card.
- **Shape** — ring / flange, disc / blank, or solid with no bore.
- **Outside Ø, Bore Ø, Thickness / height, Weight each, Quantity** — straight off the
  box label. The label weight is what the plan uses.
- **Purchase order, Heat number** — typed by hand and printed on both the plan sheet and
  the pallet card, because the same part can ship on more than one order.
- **Pcs / layer, Pcs / row** — typed by the stacker, and they win over the size. Leave
  them blank and the planner works the count out from the pallet and the diameter.

Units switch between `in · lb` (default) and `cm · kg`; the numbers convert where they
sit, so nothing is retyped. Internally everything is cm and kg, and the ±0.001 in steps on
the card fields survive the switch.

## The pallet

Fixed, and never editable:

| | |
|---|---|
| Pallet | 44 in front-to-back × 48 in across |
| Deck height | 4 ¾ in |
| Total height | 26 in, pallet included |
| Total load | 2,700 lb, pallet included |
| Overhang | 1 in past the back edge only, nothing over the sides |

Rows are straight and lined up, so a layer is a clean grid both ways round and the
planner keeps whichever orientation holds more. The load limit is a total, so the 55 lb
pallet comes off the top of it: 2,645 lb of parts.

## The plan sheet

One page, US Letter. Pallets needed, per-pallet numbers, the part, the pallet limits,
packing notes and — past 14 pallets — a breakdown table capped at 14 rows with the rest
summed in a line. If the stacker typed the layer count, the figure is left off the sheet:
a hand count beats a drawing.

## The pallet card

8.497 × 4.26 in, printed portrait so it reads top to bottom on the card stock, and it goes
in with the eye hole on the left edge, ½ in in and halfway down. The type is offset to
clear that hole: 0.200 in of clear card on the left of it and 0.690 in on the right.

It carries the pallet count, the part, the PO and heat, the layer and row counts, the
per-pallet weight and stack height, and a line to sign. Nothing else: no figure, no notes,
no dimension numbers — a stacker reads it at arm's length.

## Weight estimate

The card's **Estimate weight from size** button fills in a weight from the geometry and
the grade's density, and says which numbers it came from. It is a check against the label,
never a replacement for it.

- A **ring** is a frustum: Ø O at the bottom, Ø A (or Ø X) at the top, the bore removed
  through it, less the raised face where R and f give one.
- A **solid** part is a flange disc under a drafted hub: with C, R and a taper on the card
  the flange is a full disc of O × C and the hub is a frustum from R at its base up to the
  top over Y − C, and with no C or no R the part is one frustum, which reads a little
  lighter. `243660F` (F316/316L, O 18.75, C 2.750, R 12.38, X 11.94, Y 6.560) comes out at
  about 347 lb, or 343 lb at the 2.650 measured across the rim. R is the hub base
  diameter, not a raised-face width — the print's 3° draft runs 12.380 down to 11.940 over
  2 × (6.560 − 2.750) = 3.62 in, which is 3.3°, and the tape across the forging's step
  reads about 12.4 in. Taking the A 8.810 flat top as the outside instead would give
  317 lb, which is why a solid part takes the wider of A and X. That sheet carries no bore
  letter at all, but a print that does — `114802F` reads J 14.69 for the bore machined
  later — is still left out of a solid part rather than quietly halving it.

The estimate says what it used, so a number that looks wrong can be traced back to the
letter that produced it.

## Safety

The planner is arithmetic on the numbers typed into it. It does not know whether a part
will nest, tip, roll or need dunnage — the stacker decides that, and the weight and height
limits on the sheet are the ones to check against.
