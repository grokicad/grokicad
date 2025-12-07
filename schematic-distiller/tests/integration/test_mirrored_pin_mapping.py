import kicad_sch_api as ksa
from kicad_sch_api.distill import distill_schematic


def test_mirror_parsed_and_applied_to_pin_nets():
    """Ensure mirrored symbols keep correct pin↔net mapping."""
    sch = ksa.load_schematic("example-schematics/multisheet/uBMS-2.kicad_sch")

    u2 = sch.components.get("U2")
    assert u2 is not None
    assert getattr(u2, "mirror", None) == "y"

    distilled = distill_schematic(sch)
    u2_distilled = next(c for c in distilled.components if c.reference == "U2")
    nets = {pin.number: pin.net for pin in u2_distilled.pins}

    assert nets["9"] == "SDA_5V"
    assert nets["10"] == "SCL_5V"

