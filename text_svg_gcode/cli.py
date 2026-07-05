from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .font_text import text_to_polylines
from .gcode import MachineConfig, generate_gcode
from .svg_import import polylines_to_svg, svg_to_polylines


def _read_text(value: str | None, file_path: str | None) -> str:
    if value is not None:
        return value
    if file_path:
        return Path(file_path).read_text(encoding="utf-8")
    raise SystemExit("provide --text or --text-file")


def _load_config(args: argparse.Namespace) -> MachineConfig:
    cfg = MachineConfig()
    if args.preset:
        cfg = MachineConfig.from_json(args.preset)

    overrides: dict[str, Any] = {}
    for key in (
        "origin_x_mm",
        "origin_y_mm",
        "scale",
        "invert_x",
        "invert_y",
        "feed_mm_min",
        "travel_mm_min",
        "servo_dwell_ms",
        "pen_up_command",
        "pen_down_command",
        "pen_up_angle",
        "pen_down_angle",
    ):
        value = getattr(args, key, None)
        if value is not None:
            overrides[key] = value

    if overrides:
        cfg = MachineConfig.from_dict({**json.loads(cfg.to_json()), **overrides})
    return cfg


def _common_parser(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--preset", help="machine preset JSON")
    parser.add_argument("--origin-x-mm", type=float)
    parser.add_argument("--origin-y-mm", type=float)
    parser.add_argument("--scale", type=float)
    parser.add_argument("--invert-x", action="store_true")
    parser.add_argument("--invert-y", action="store_true")
    parser.add_argument("--feed-mm-min", type=float)
    parser.add_argument("--travel-mm-min", type=float)
    parser.add_argument("--servo-dwell-ms", type=int)
    parser.add_argument("--pen-up-command")
    parser.add_argument("--pen-down-command")
    parser.add_argument("--pen-up-angle", type=int)
    parser.add_argument("--pen-down-angle", type=int)
    parser.add_argument("--output", required=True, help="gcode output path")
    parser.add_argument("--svg-output", help="optional SVG output path")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="text-svg-to-gcode")
    sub = parser.add_subparsers(dest="mode", required=True)

    text_parser = sub.add_parser("text", help="convert text to SVG paths and G-code")
    _common_parser(text_parser)
    text_parser.add_argument("--text")
    text_parser.add_argument("--text-file")
    text_parser.add_argument("--font-path")
    text_parser.add_argument("--font-size-mm", type=float)
    text_parser.add_argument("--line-height-mm", type=float)
    text_parser.add_argument("--letter-spacing-mm", type=float)
    text_parser.add_argument("--flatten-tolerance-mm", type=float)

    svg_parser = sub.add_parser("svg", help="convert SVG to G-code")
    _common_parser(svg_parser)
    svg_parser.add_argument("--input", required=True, help="input SVG file")
    svg_parser.add_argument("--flatten-tolerance-mm", type=float)

    return parser


def _write_outputs(gcode: str, output_path: str, svg: str | None = None, svg_output: str | None = None) -> None:
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(gcode, encoding="utf-8")
    if svg_output and svg is not None:
        svg_path = Path(svg_output)
        svg_path.parent.mkdir(parents=True, exist_ok=True)
        svg_path.write_text(svg, encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    cfg = _load_config(args)

    if args.mode == "text":
        text = _read_text(args.text, args.text_file)
        font_path = args.font_path or cfg.__dict__.get("font_path") or "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        font_size_mm = args.font_size_mm or cfg.__dict__.get("font_size_mm") or 12.0
        line_height_mm = args.line_height_mm or cfg.__dict__.get("line_height_mm")
        letter_spacing_mm = args.letter_spacing_mm if args.letter_spacing_mm is not None else cfg.__dict__.get("letter_spacing_mm", 0.0)
        flatten_tolerance_mm = args.flatten_tolerance_mm if args.flatten_tolerance_mm is not None else cfg.__dict__.get("flatten_tolerance_mm", 0.35)
        polylines = text_to_polylines(
            text=text,
            font_path=font_path,
            font_size_mm=float(font_size_mm),
            line_height_mm=float(line_height_mm) if line_height_mm is not None else None,
            letter_spacing_mm=float(letter_spacing_mm),
            flatten_tolerance_mm=float(flatten_tolerance_mm),
        )
        svg = polylines_to_svg(polylines)
    else:
        flatten_tolerance_mm = args.flatten_tolerance_mm if args.flatten_tolerance_mm is not None else cfg.__dict__.get("flatten_tolerance_mm", 0.35)
        polylines = svg_to_polylines(args.input, tolerance_mm=float(flatten_tolerance_mm))
        svg = polylines_to_svg(polylines)

    gcode = generate_gcode(polylines, cfg, source_name=args.mode if args.mode != "svg" else args.input)
    _write_outputs(gcode, args.output, svg=svg, svg_output=args.svg_output)
    print(f"wrote {args.output}")
    if args.svg_output:
        print(f"wrote {args.svg_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
