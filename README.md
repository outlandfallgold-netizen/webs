# Pallet Planner

A single-page shop-floor calculator for stacking loose rings, flanges and discs on the
shop pallet. Parts arrive with the cardboard scrapped, so the plan works from three
things only: the part size off the label, the weight of one part, and how many there are.

Open `index.html` — no build step, no server, no dependencies. It is published at
<https://outlandfallgold-netizen.github.io/webs/>.

## What it works out

- **Pallets needed**, and pieces per pallet, pieces per layer and layers per pallet.
- **Stack height and pallet weight** for each pallet, against the height and load limits.
- **Each layer in straight rows**, every row the same count, so rows can be counted off
  at the pallet rather than guessed. Both pallet orientations are tried and the fuller
  one wins.
- **Full pallets plus one short one.** The plan fills every pallet to capacity and puts
  the remainder on the last pallet, then names it: *use pallet N first*, with the full
  pallets left in the bin. It never splits a job into equal half-pallets.
- **A pallet breakdown** for jobs needing more than one pallet, capped at 14 rows so the
  sheet stays on one page, with the rest summed in a line.

## Inputs

| Field | Notes |
| --- | --- |
| Grade | A105, A130, A185, A350 LF2, F304-304L, F316-316L, F22, C22, or other. Sets the density used for the weight estimate. |
| Part shape | **Ring / flange** takes a bore; **Solid — no bore** is a disc or a cone, and the bore field disappears. |
| Outside Ø, bore Ø, thickness / height | The part as it sits on the pallet: the diameter sets the footprint, the height sets how many layers fit. |
| Weight each | The weighed weight from the label. This is the number the plan trusts. |
| Quantity | The whole job's piece count, not per pallet. |
| Parts per layer, parts per row | Optional. Type what really goes on and the layers, height, weight and pallet count follow your count instead of the size. Use it when parts nest or slide under one another, which packs tighter than a grid ever can. |
| Lettered dimension card | Optional. O, C, R, X, Y, A, J, f and B as the part print reads; only the letters you fill in are used, and O/Y/B or C fill the part size in. On a solid part B and J still print for the record, but no bore comes out of the weight. |
| Purchase order, heat number | Paperwork, not measurements. Both print on the plan sheet and on the card, because the same part and heat can ship on a different order. |

The estimate from size and density is marked `(est.)` wherever it prints, because a
guessed weight can hide an overweight pallet — on one recorded job the guessed weight
was 21% light, which would have put 3,175 lb on a 2,700 lb limit. Type the weighed weight
and the `(est.)` wording disappears.

## The pallet is fixed

These are the same on every load and are not typed on screen. They do print on the plan
sheet.

| | |
| --- | --- |
| Pallet | 44 × 48 in deck, 44 in front-to-back, 48 in across |
| Deck height | 4 3/4 in |
| Total height | 26 in, pallet included |
| Total load | 2,700 lb, pallet included (the pallet itself is 55 lb) |
| Overhang | sides flush, 1 in allowed past the back edge only |

## Printing

Two print buttons, two different pieces of paper.

**Plan sheet** — US Letter, portrait, 10 mm margins, two columns, one page. It carries
the per-pallet figures, the part, the pallet limits, the pallet breakdown, the packing
notes, a small isometric drawing of the layer and a sign-off line.

**8.497 × 4.26 in stack card** — the stock card. This is the short version for the person
actually stacking: pallets needed, the part size in, the purchase order and heat number,
rows per layer, parts per row, parts per layer, layers per pallet, per pallet, stack
height, weight each, pallet weight, and the short pallet if there is one. No dimension
letters, no drawing, no notes.

### Card margins and the eye hole

The stock card is punched with an eye hole about **½ in across, roughly ½ in in from an
edge and halfway down the card**, and goes in with the hole on the left side. The card
itself measures **8.497 × 4.26 in**, so it prints with:

- a **4.26 × 8.497 in** page, **6 mm** at the top and bottom, **0.2 in** at the left and
  **0.690 in** at the right — a **3.37 in** column of type;
- gutters taken from the operator's own measurement: 0.200 in of blank card left of the
  type and 0.690 in right of it, so the block sits off-centre on purpose and the punched
  hole on the left never lands on a row.

The 3.37 in column is what let the card type be enlarged over the old 4½ × 8 sheet; the
block still finishes with spare card at the foot.

### Print dialog settings

Use **Default** margins and **100 %** scale with **headers and footers off**. "Fit to
page", "None" or "Custom" overrides the page margins from the page itself and throws the
gutters away, and the browser header/footer costs about an inch of the card.

## How the numbers are worked out

- **Footprint**: a straight grid of the part diameter on the usable deck (44 × 48 in,
  plus the 1 in back allowance), whichever way round holds more.
- **Layers**: the fewest of what the height allows and what the load allows, with the
  pallet's own 55 lb taken off the 2,700 lb first.
- **Weight estimate**: the part treated as an annular frustum — outside diameter tapering
  to the top-of-cone diameter, bore taken out through it, bottom raised face set back —
  times the grade's density (7.85 g/cm³ for carbon and alloy steel, 7.93 for 304, 8.00
  for 316, 8.69 for C22). A cone top no wider than the bore cannot be a diameter — on one
  A105 card `X` reads a spout length — so that letter still prints but is left out of the
  volume, and the part counts as a straight ring: heavy, never light. That card's real
  7.445 lb part comes out at 8.7 lb, where reading `X` as a diameter had it at 2.9 lb.
  A solid part counts the whole frustum, bore and all, and takes the wider of A and X as
  its top because a solid part has no inner diameter: the `243660F` solid cone
  (F316/316L, O 18.75, X 11.94, Y 6.560) comes out at about 356 lb, where reading the
  A 8.810 flat top as the outside gives 295 lb. That sheet carries no bore letter at all,
  but a print that does — `114802F` reads J 14.69 for the bore machined later — is still
  left out of a solid part rather than quietly halving it.
  C is the wall at the bottom, and it is what gives a ring its bore (O less two walls).
  On a solid part C is only the flange thickness — 2.650 in measured across the rim of the
  `243660F` forging against 2.750 on the print — so it prints on the sheet and leaves the
  356 lb where the frustum puts it.
- **One full part thickness per layer** is assumed. Parts that sit shorter than that
  because they nest are not modelled; the typed layer count is.

Estimates only: check against your racking, pallet rating and load limits before stacking.

## Files

| File | |
| --- | --- |
| `index.html` | the page, its fields and the two print containers |
| `styles.css` | screen styling, and all the print rules including the card page |
| `app.js` | state, weight estimate, packing, plan sheet and card markup |

Fonts come from Google Fonts; the app works without them.
