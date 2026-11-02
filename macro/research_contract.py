"""Validate versioned News_ifxhelper evidence envelopes before HELIX ingestion."""
from datetime import datetime
from urllib.parse import urlparse

VERSION = "research-evidence/v1"

def validate_envelope(payload):
    if not isinstance(payload, dict) or payload.get("schemaVersion") != VERSION:
        return {"ok": False, "reason": "schema"}
    if any(key in payload for key in ("prediction", "tradeAction", "telegramSend")):
        return {"ok": False, "reason": "prohibited-actions"}
    event_id = payload.get("eventId")
    summary = payload.get("summary")
    sources = payload.get("sources")
    if not isinstance(event_id, str) or not 6 <= len(event_id) <= 120 or not all(c.isalnum() or c in "-_:" for c in event_id):
        return {"ok": False, "reason": "event-id"}
    if not isinstance(summary, str) or not 20 <= len(summary) <= 4000:
        return {"ok": False, "reason": "summary"}
    if not isinstance(sources, list) or not 1 <= len(sources) <= 8:
        return {"ok": False, "reason": "sources"}
    for source in sources:
        if not isinstance(source, dict):
            return {"ok": False, "reason": "source"}
        url = source.get("url")
        if not isinstance(url, str):
            return {"ok": False, "reason": "url"}
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return {"ok": False, "reason": "url"}
        try:
            datetime.fromisoformat(source["publishedAt"].replace("Z", "+00:00"))
        except (ValueError, KeyError, AttributeError, TypeError):
            return {"ok": False, "reason": "source-date"}
    return {"ok": True, "value": {"schemaVersion": VERSION, "eventId": event_id, "summary": summary, "evidenceStatus": "unverified", "sources": sources, "publish": False, "prediction": "not-calibrated"}}
