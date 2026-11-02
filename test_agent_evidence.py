import unittest
from datetime import datetime, timezone
from macro.agent_evidence import Evidence, assess, review

NOW = datetime(2026, 11, 3, 12, tzinfo=timezone.utc)

class EvidenceTests(unittest.TestCase):
    def sample(self, **changes):
        data = dict(event_id="cpi-2026",source_url="https://agency.gov/report",corroborating_url="https://centralbank.gov/report",published_at="2026-11-03T11:00:00Z",summary="Published event requires independent factual review.",status="confirmed")
        data.update(changes)
        return Evidence(**data)
    def test_fresh_independent_metadata(self):
        self.assertTrue(assess(self.sample(), NOW)["eligible"])
    def test_stale(self):
        self.assertFalse(assess(self.sample(published_at="2026-10-01T11:00:00Z"), NOW)["eligible"])
    def test_same_domain(self):
        self.assertFalse(assess(self.sample(corroborating_url="https://agency.gov/other"), NOW)["eligible"])
    def test_unverified(self):
        self.assertFalse(assess(self.sample(status="unverified"), NOW)["eligible"])
    def test_never_auto_publish_or_trade(self):
        result=review([self.sample()],NOW)
        self.assertFalse(result["publish"])
        self.assertFalse(result["trade"])
        self.assertEqual(result["prediction"],"not-calibrated")

if __name__=="__main__":
    unittest.main()
