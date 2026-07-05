from pathlib import Path
import unittest

from text_svg_gcode.font_text import text_to_polylines
from text_svg_gcode.gcode import MachineConfig, generate_gcode
from text_svg_gcode.svg_import import svg_to_polylines

ROOT = Path(__file__).resolve().parents[1]


class GenerationTests(unittest.TestCase):
    def test_text_to_polylines(self):
        font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        polylines = text_to_polylines("Hi", font, font_size_mm=12, line_height_mm=16)
        self.assertGreater(len(polylines), 0)
        self.assertTrue(all(len(poly) >= 2 for poly in polylines))

    def test_svg_to_gcode(self):
        svg_path = ROOT / "examples" / "sample.svg"
        polylines = svg_to_polylines(svg_path)
        self.assertGreater(len(polylines), 0)
        gcode = generate_gcode(polylines, MachineConfig(), source_name=str(svg_path))
        self.assertIn("G21", gcode)
        self.assertIn("G90", gcode)
        self.assertIn("M3", gcode)
        self.assertIn("M5", gcode)


if __name__ == "__main__":
    unittest.main()
