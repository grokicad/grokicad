# Distill features and usage

This guide explains what the distillation pipeline produces, the knobs you can tune, and how to run it from Python or the demo CLI.

## What distillation produces
- Components with `reference`, `lib_id`, `value`, `footprint`, filtered `properties`, `pins`, `position`, optional `sheet_path`, and a coarse `category`.
- Nets as a map keyed by net name; each reference maps to a list of pin objects (`{ "Pin": "<number>" }`).
- Proximity edges between nearby real components (power/net labels are excluded) with distance, score, categories, and applied weight.

Example (truncated):
```json
{
  "components": [
    {
      "reference": "U1",
      "lib_id": "MCU:STM32",
      "value": "STM32",
      "footprint": "LQFP-48",
      "properties": { "Manufacturer": "ST" },
      "category": "ic",
      "pins": [
        { "number": "1", "name": "VDD", "net": "VCC" },
        { "number": "2", "name": "PA0", "net": "IO0" }
      ],
      "position": { "x": 0, "y": 0 },
      "sheet_path": "/mcu"
    }
  ],
  "nets": {
    "VCC": { "U1": [{ "Pin": "1" }], "C1": [{ "Pin": "1" }] }
  },
  "proximities": [
    {
      "ref_a": "U1",
      "ref_b": "C1",
      "distance_mm": 12.5,
      "score": 1.3,
      "category_a": "ic",
      "category_b": "capacitor",
      "weight": 6.0
    }
  ]
}
```

## Key behaviors and filters
- Properties are flattened to `name -> value`; metadata such as font/hidden flags is dropped.
- Missing pin names fall back to the library symbol definition when available.
- Power/net label symbols (`#PWR*`, `Net-*`, `power:*`, `net:*`) are removed from components and proximities.
- Components and proximities include `sheet_path` when `hierarchical=True`.

## Proximity scoring
- Base score decreases with distance: `(radius - dist) / radius` (clamped at zero).
- Default radius: `20mm`. IC–capacitor pairs get a 1.5× effective radius.
- Weight multipliers boost common intent (defaults):
  - `("capacitor", "ic")` and `("ic", "capacitor")`: `2.0`
  - `("capacitor", "other")` and `("other", "capacitor")`: `1.2`
- Additional boost: if either ref starts with `U` in an IC–capacitor pair, weight ×3 is applied.

## Configuration (`DistillationConfig`)
- `proximity_radius_mm` (float, default `20.0`): radius used for proximity edges.
- `weight_multipliers` (dict, optional): override or extend default multipliers.
- `hierarchical` (bool, default `True`): traverse hierarchical sheets and include `sheet_path`.

## Usage

### Python
```python
import kicad_sch_api as ksa
from kicad_sch_api.distill import DistillationConfig, distill_schematic

schematic = ksa.load_schematic("path/to/root.kicad_sch")
cfg = DistillationConfig(proximity_radius_mm=25.0, hierarchical=True)
distilled = distill_schematic(schematic, cfg)
print(distilled.to_dict())
```

### Demo CLI
Use the example driver to emit JSON (auto-detects root when multiple schematics are provided):
```bash
python examples/distill/distill_demo.py --schematic path/to/root.kicad_sch --radius 25
# or
python examples/distill/distill_demo.py --dir path/to/project --radius 25
```
Disable hierarchy traversal with `--no-hierarchy` if needed.

## Testing
Run the focused unit tests after changes to the distill pipeline:
```bash
python -m pytest tests/unit/test_distill.py
```

## Change history
Recent adjustments to the output shape and proximity heuristics are summarized in `docs/distill_changes.md`.

