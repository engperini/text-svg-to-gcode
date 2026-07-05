from __future__ import annotations

import io
import math
from pathlib import Path
from typing import List, Sequence, Tuple

from svgpathtools import Path as SvgPath
from svgpathtools import svg2paths2

Point = Tuple[float, float]
Polyline = List[Point]


def _distance(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def path_to_polylines(path: SvgPath, tolerance_mm: float = 0.35) -> List[Polyline]:
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


def svg_to_polylines(svg_source: str | Path, tolerance_mm: float = 0.35) -> List[Polyline]:
    if isinstance(svg_source, str) and svg_source.lstrip().startswith("<svg"):
        file_obj = io.StringIO(svg_source)
        paths, _attrs, _svg_attrs = svg2paths2(file_obj)
    else:
        paths, _attrs, _svg_attrs = svg2paths2(str(svg_source))

    polylines: List[Polyline] = []
    for path in paths:
        polylines.extend(path_to_polylines(path, tolerance_mm=tolerance_mm))
    return polylines


def polyline_bounds(polylines: Sequence[Polyline]) -> tuple[float, float, float, float] | None:
    xs = [x for poly in polylines for x, _ in poly]
    ys = [y for poly in polylines for _, y in poly]
    if not xs or not ys:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def polylines_to_svg(
    polylines: Sequence[Polyline],
    stroke: str = "#111111",
    stroke_width: float = 0.35,
    padding_mm: float = 5.0,
) -> str:
    bounds = polyline_bounds(polylines)
    if bounds is None:
        min_x = min_y = 0.0
        width = height = 100.0
    else:
        min_x, min_y, max_x, max_y = bounds
        min_x -= padding_mm
        min_y -= padding_mm
        max_x += padding_mm
        max_y += padding_mm
        width = max(max_x - min_x, 1.0)
        height = max(max_y - min_y, 1.0)

    lines: list[str] = []
    for poly in polylines:
        if len(poly) < 2:
            continue
        points = " ".join(f"{x - min_x:.3f},{y - min_y:.3f}" for x, y in poly)
        lines.append(
            f'<polyline points="{points}" fill="none" stroke="{stroke}" '
            f'stroke-width="{stroke_width}" stroke-linecap="round" stroke-linejoin="round" />'
        )

    body = "\n    ".join(lines)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.3f}mm" height="{height:.3f}mm" '
        f'viewBox="0 0 {width:.3f} {height:.3f}">\n'
        f'  <g transform="translate({-min_x:.3f}, {-min_y:.3f})">\n'
        f'    {body}\n'
        f'  </g>\n'
        f'</svg>\n'
    )
