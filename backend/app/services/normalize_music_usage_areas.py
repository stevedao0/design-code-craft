"""
Helper for normalizing music_usage_areas from contract records.

Source of truth: contract.music_usage_areas (JSON list)
Fallback: legacy Karaoke fields (tong_so_phong, tong_so_box, loai_hinh_karaoke,
               room_display_text, karaoke_room_details_json)

Output format (STANDARD - matches create/edit/Word export):
{
    "area_name": "...",           # Vị trí / khu vực sử dụng âm nhạc
    "scale_description": "...",  # Số phòng / số chỗ
    "music_usage_type": "...",    # Hình thức sử dụng âm nhạc
    "note": "..."                 # Ghi chú khu vực (optional)
}

Aliases supported for reading:
- room_or_seat_count -> scale_description
- usage_method -> music_usage_type

Usage:
    from app.services.normalize_music_usage_areas import normalize_music_usage_areas

    areas = normalize_music_usage_areas(contract_row)
    for area in areas:
        print(area["area_name"], area["scale_description"], area["music_usage_type"])
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _safe_int(value: Any, default: int = 0) -> int:
    """Safely convert value to int."""
    if value is None:
        return default
    if isinstance(value, int):
        return value
    try:
        return int(float(str(value)))
    except (ValueError, TypeError):
        return default


def _parse_json_field(value: Any) -> list[dict]:
    """Parse JSON field, return empty list on failure."""
    if not value:
        return []
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
        if isinstance(parsed, list):
            return parsed
        return [parsed] if parsed else []
    except (json.JSONDecodeError, TypeError):
        return []


def _normalize_music_type(karaoke_type: str, raw_type: str = "") -> str:
    """Map karaoke type to usage method label."""
    type_upper = str(karaoke_type or raw_type or "").strip().upper()
    if type_upper == "BOX":
        return "Sử dụng nhạc qua đầu Karaoke (Box)"
    return "Sử dụng nhạc qua đầu Karaoke"


def _normalize_usage_method(usage_type: str) -> str:
    """Normalize usage method from various raw formats."""
    raw = str(usage_type or "").strip()
    if not raw:
        return "Phát nhạc nền"

    raw_lower = raw.lower()
    if "karaoke" in raw_lower or "box" in raw_lower:
        return "Sử dụng nhạc qua đầu Karaoke"
    if "nền" in raw_lower or "background" in raw_lower or "nhac nen" in raw_lower:
        return "Phát nhạc nền"
    if "biểu diễn" in raw_lower or "trực tiếp" in raw_lower:
        return "Biểu diễn âm nhạc trực tiếp"
    if "phòng thu" in raw_lower or "thu âm" in raw_lower:
        return "Phòng thu âm"
    return raw


def _parse_room_display_text(text: str) -> list[dict]:
    """Parse legacy room_display_text into normalized areas."""
    areas = []
    raw = str(text or "").strip()
    if not raw:
        return areas

    lines = raw.replace("\r\n", "\n").split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) >= 2:
            area_name = parts[0].strip()
            scale = parts[1].strip() if len(parts) > 1 else ""
            areas.append({
                "area_name": area_name,
                "scale_description": scale,
                "music_usage_type": "Sử dụng nhạc qua đầu Karaoke",
                "note": "",
            })
        elif len(parts) == 1 and parts[0]:
            areas.append({
                "area_name": parts[0].strip(),
                "scale_description": "",
                "music_usage_type": "Sử dụng nhạc qua đầu Karaoke",
                "note": "",
            })
    return areas


def _parse_karaoke_room_details(json_str: str, karaoke_type: str) -> list[dict]:
    """Parse legacy karaoke_room_details_json into normalized areas."""
    areas = []
    raw_list = _parse_json_field(json_str)
    if not raw_list:
        return areas

    for item in raw_list:
        if not isinstance(item, dict):
            continue

        room_count = _safe_int(item.get("room_count"))
        if room_count <= 0:
            continue

        label = str(item.get("label") or item.get("floor") or "Khu vực").strip()
        room_names = item.get("room_names", [])
        if isinstance(room_names, list) and len(room_names) > 0:
            scale = f"{room_count} phòng ({', '.join(str(r) for r in room_names[:5])}{'...' if len(room_names) > 5 else ''})"
        else:
            scale = f"{room_count} phòng"

        areas.append({
            "area_name": label,
            "scale_description": scale,
            "music_usage_type": _normalize_music_type(karaoke_type),
            "note": "",
        })

    return areas


def normalize_music_usage_areas(contract) -> list[dict]:
    """
    Normalize music usage areas from a contract record.

    Priority:
    1. contract.music_usage_areas (JSON list) - NGUỒN CHUẨN MỚI
    2. Legacy fallback:
       - karaoke_room_details_json → area_name + room_or_seat_count
       - room_display_text → area_name + room_or_seat_count
       - tong_so_phong / tong_so_box → room_or_seat_count
       - loai_hinh_karaoke → usage_method
    3. Empty list if no data at all

    Args:
        contract: ContractRecordRow instance or dict with contract fields

    Returns:
        List of normalized area dicts with keys:
        - area_name: str
        - room_or_seat_count: str
        - usage_method: str
        - note: str
    """
    # Priority 1: music_usage_areas (new standardized format)
    music_areas_raw = None
    try:
        if hasattr(contract, "get_music_usage_areas"):
            music_areas_raw = contract.get_music_usage_areas()
        elif hasattr(contract, "music_usage_areas"):
            raw = contract.music_usage_areas
            if raw:
                if isinstance(raw, list):
                    music_areas_raw = raw
                elif isinstance(raw, str):
                    try:
                        music_areas_raw = json.loads(raw)
                    except json.JSONDecodeError:
                        music_areas_raw = []
    except Exception as e:
        logger.debug(f"normalize_music_usage_areas: error reading music_usage_areas: {e}")
        music_areas_raw = None

    if music_areas_raw and isinstance(music_areas_raw, list) and len(music_areas_raw) > 0:
        result = []
        for area in music_areas_raw:
            if not isinstance(area, dict):
                continue
            result.append({
                "area_name": str(area.get("area_name") or area.get("area_name_vi") or "").strip(),
                "scale_description": str(
                    area.get("scale_description") or area.get("room_or_seat_count") or area.get("scale_description_vi") or ""
                ).strip(),
                "music_usage_type": _normalize_usage_method(
                    area.get("music_usage_type") or area.get("usage_method") or ""
                ),
                "note": str(area.get("note") or area.get("note_vi") or "").strip(),
            })
        if result:
            return result

    # Priority 2: Legacy fallback
    karaoke_type = ""
    if hasattr(contract, "loai_hinh_karaoke"):
        karaoke_type = str(contract.loai_hinh_karaoke or "").strip().upper()
    elif isinstance(contract, dict):
        karaoke_type = str(contract.get("loai_hinh_karaoke") or "").strip().upper()

    if karaoke_type and karaoke_type not in ("PHONG", "BOX"):
        karaoke_type = "PHONG"

    # Try karaoke_room_details_json first
    legacy_json = None
    if hasattr(contract, "karaoke_room_details_json"):
        legacy_json = contract.karaoke_room_details_json
    elif isinstance(contract, dict):
        legacy_json = contract.get("karaoke_room_details_json")

    if legacy_json:
        areas = _parse_karaoke_room_details(legacy_json, karaoke_type)
        if areas:
            return areas

    # Try room_display_text
    legacy_text = None
    if hasattr(contract, "room_display_text"):
        legacy_text = contract.room_display_text
    elif isinstance(contract, dict):
        legacy_text = contract.get("room_display_text")

    if legacy_text:
        areas = _parse_room_display_text(legacy_text)
        if areas:
            return areas

    # Try tong_so_phong / tong_so_box
    total_rooms = 0
    total_boxes = 0
    if hasattr(contract, "tong_so_phong"):
        total_rooms = _safe_int(contract.tong_so_phong)
    elif isinstance(contract, dict):
        total_rooms = _safe_int(contract.get("tong_so_phong"))

    if hasattr(contract, "tong_so_box"):
        total_boxes = _safe_int(contract.tong_so_box)
    elif isinstance(contract, dict):
        total_boxes = _safe_int(contract.get("tong_so_box"))

    if total_rooms > 0 or total_boxes > 0:
        if karaoke_type == "BOX" and total_boxes > 0:
            return [{
                "area_name": "Khu vực sử dụng",
                "scale_description": f"{total_boxes} box",
                "music_usage_type": _normalize_music_type("BOX"),
                "note": "Dữ liệu tổng hợp từ trường legacy",
            }]
        elif total_rooms > 0:
            return [{
                "area_name": "Khu vực sử dụng",
                "scale_description": f"{total_rooms} phòng",
                "music_usage_type": _normalize_music_type("PHONG"),
                "note": "Dữ liệu tổng hợp từ trường legacy",
            }]

    return []


def format_music_usage_areas_for_excel_row(contract) -> dict:
    """
    Format music usage areas for a single Excel row.

    Returns dict with keys:
    - area_name: str
    - scale_description: str
    - music_usage_type: str
    - note: str

    For contracts with multiple areas, call this once per area
    and repeat contract info in other columns.
    """
    areas = normalize_music_usage_areas(contract)
    if not areas:
        return {
            "area_name": "",
            "scale_description": "",
            "music_usage_type": "",
            "note": "",
        }
    return areas[0]


def music_usage_areas_to_text(contract, separator: str = "; ") -> str:
    """
    Convert music usage areas to a human-readable text for single-cell display.

    Args:
        contract: ContractRecordRow or dict
        separator: Join separator between areas

    Returns:
        Text like "Phòng 1: 1 phòng (Karaoke); Phòng 2: 1 phòng (Karaoke)"
    """
    areas = normalize_music_usage_areas(contract)
    if not areas:
        return ""

    parts = []
    for area in areas:
        name = area["area_name"] or "Khu vực"
        scale = area["scale_description"] or ""
        music_type = area["music_usage_type"] or ""
        if scale:
            parts.append(f"{name}: {scale}")
        else:
            parts.append(name)

    return separator.join(parts)
