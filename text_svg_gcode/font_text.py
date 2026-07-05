from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Tuple

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from svgpathtools import parse_path

Point = Tuple[float, float]
Polyline = List[Point]


@dataclass(frozen=True)
class TextOptions:
    font_path: str
    font_size_mm: float = 12.0
    line_height_mm: float | None = None
    letter_spacing_mm: float = 0.0
    flatten_tolerance_mm: float = 0.35


def _distance(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _segments_to_polylines(path_d: str, tolerance_mm: float) -> List[Polyline]:
    path = parse_path(path_d)
    polylines: List[Polyline] = []
    current: Polyline = []

    for segment in path:
        start = (float(segment.start.real), float(segment.start.imag))
        end = (float(segment.end.real), float(segment.end.imag))

        if current and _distance(current[-1], start) > 1e-6:
            if len(current) >= 2:
                polylines.append(current)
            current = []

        if not current:
            current = [start]

        length = max(float(segment.length(error=1e-5)), tolerance_mm)
        steps = max(2, int(math.ceil(length / max(tolerance_mm, 1e-6))))
        for i in range(1, steps + 1):
            t = i / steps
            z = segment.point(t)
            pt = (float(z.real), float(z.imag))
            if _distance(current[-1], pt) > 1e-6:
                current.append(pt)

        if _distance(current[-1], end) > 1e-6:
            current.append(end)

    if len(current) >= 2:
        polylines.append(current)

    return polylines


def text_to_polylines(
    text: str,
    font_path: str,
    font_size_mm: float = 12.0,
    line_height_mm: float | None = None,
    letter_spacing_mm: float = 0.0,
    flatten_tolerance_mm: float = 0.35,
) -> List[Polyline]:
    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"].metrics
    units_per_em = float(font["head"].unitsPerEm)
    scale = font_size_mm / units_per_em

    if line_height_mm is None:
        ascent = float(font["hhea"].ascent) * scale
        descent = abs(float(font["hhea"].descent)) * scale
        line_height_mm = max(font_size_mm * 1.25, (ascent + descent) * 1.15)

    space_advance = hmtx.get("space", (units_per_em * 0.33, 0))[0] * scale
    polylines: List[Polyline] = []

    lines = text.splitlines() or [""]
    for line_index, line in enumerate(lines):
        cursor_x = 0.0
        baseline_y = float(line_index) * float(line_height_mm)

        for ch in line:
            if ch == "	":
                cursor_x += space_advance * 4 + letter_spacing_mm
                continue
            if ch == " ":
                cursor_x += space_advance + letter_spacing_mm
                continue

            glyph_name = cmap.get(ord(ch), ".notdef")
            glyph = glyph_set[glyph_name]
            pen = SVGPathPen(glyph_set)
            transform_pen = TransformPen(
                pen,
                (
                    scale,
                    0.0,
                    0.0,
                    -scale,
                    cursor_x,
                    baseline_y,
                ),
            )
            glyph.draw(transform_pen)
            path_d = pen.getCommands()
            if path_d.strip():
                polylines.extend(_segments_to_polylines(path_d, flatten_tolerance_mm))

            advance = hmtx.get(glyph_name, (units_per_em * 0.5, 0))[0] * scale
            cursor_x += advance + letter_spacing_mm

    return polylines
