# Ports map markers — prompt pack

Generated pins live at `packages/career-ui/public/ports/anchor.png` and `warehouse.png` (gray background knocked out). Sources: repo `assets/anchor.png` / `warehouse.png`.

**Shared negatives:**  
`no photorealism, no 3D render, no cottage / suburban house, no chimney, no picket fence, no people, no text, no logo, no watermark, no extra objects, centered on transparent background`

**Shared look:** flat vector UI icon, 1–2 px bold outline, Skyline career map: fill hex **warehouse `#6ec8ff`**, **seaport `#f0a35a`**. Cream `#fff4e8` outline. Reads at 20 px.

---

## Warehouse (your WH)

**File / code:** `WAREHOUSE_SVG` in `PortsMap.tsx`

```
Flat vector map-marker icon of a CARGO WAREHOUSE, 32x32, transparent background.

MUST read as logistics, not a home: long industrial shed, SHALLOW almost-flat roof (no steep cottage gable, no chimney, no attic windows). Side view 3/4. Large ROLL-UP loading door with horizontal slats. Raised LOADING DOCK slab on the left. One wooden PALLET or crate on the dock. Optional tiny sawtooth skylight ridge on the roof — industrial only.

Style: clean UI glyph, bold cream outline #fff4e8, solid fill #6ec8ff, no gradients, no texture. Centered, lots of padding so it stays clear at 20 pixels.

Negatives: suburban house, peaked A-frame roof, front door with two windows, mailbox, tree, truck that dominates the silhouette.
```

---

## Seaport (anchor)

**File / code:** `PORT_ANCHOR_SVG` in `PortsMap.tsx`

```
Flat vector map-marker icon of a CLASSIC ADMIRALTY ANCHOR, 32x40 portrait, transparent background.

Ring at the top, horizontal stock bar through the shank, vertical shank, crown at the bottom, two curved arms ending in triangular FLUKES pointing up-and-out. Balanced, maritime, not a fishing hook and not a heart.

Style: clean UI glyph, bold cream outline #fff4e8, solid stroke/fill #f0a35a, round line caps, no chain, no rope, no boat. Centered, readable at 24–34 pixels.

Negatives: house, plane, trident, emoji-style ⚓ clipart with extra ornaments, thin hairlines.
```
