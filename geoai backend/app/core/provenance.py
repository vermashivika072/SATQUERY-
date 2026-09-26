"""Shared provenance envelope added to every data-bearing service response."""
from datetime import datetime


def provenance(source: str, live: bool, note: str | None = None) -> dict:
    return {
        "source": source,
        "live": live,
        "note": note,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def source_of(item) -> str:
    """Extract the source label from a provenance envelope or a plain string."""
    if isinstance(item, dict):
        value = item.get("source")
        return value if isinstance(value, str) and value else "UNAVAILABLE"
    if isinstance(item, str) and item:
        return item
    return "UNAVAILABLE"