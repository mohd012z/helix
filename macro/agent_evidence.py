"""Evidence-gated research agent shared by HELIX. No trading or network calls."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
from typing import Iterable

@dataclass(frozen=True)
class Evidence:
    event_id: str
    source_url: str
    published_at: str
    summary: str
    status: str = "unverified"
    corroborating_url: str = ""

def _domain(url: str) -> str:
    parsed = urlparse(url)
    return parsed.hostname.lower() if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password else ""

def assess(item: Evidence, now: datetime | None = None, max_age_hours: int = 24) -> dict:
    now = now or datetime.now(timezone.utc)
    try:
        published = datetime.fromisoformat(item.published_at.replace("Z", "+00:00"))
        if published.tzinfo is None:
            raise ValueError("timezone required")
        fresh = now - timedelta(minutes=5) <= published <= now and now - published <= timedelta(hours=max_age_hours)
    except (ValueError, TypeError, OverflowError):
        fresh = False
    a, b = _domain(item.source_url), _domain(item.corroborating_url)
    independent = bool(a and b and a != b)
    eligible = bool(fresh and independent and item.status == "confirmed" and len(item.summary.strip()) >= 20)
    return {"event_id": item.event_id, "eligible": eligible, "fresh": fresh, "independent_sources": independent, "verification": "metadata-only; source contents not fetched"}

def review(items: Iterable[Evidence], now: datetime | None = None) -> dict:
    assessments = [assess(item, now) for item in items]
    return {"eligible_count": sum(a["eligible"] for a in assessments), "assessments": assessments, "publish": False, "trade": False, "prediction": "not-calibrated"}
