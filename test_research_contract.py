import unittest
from macro.research_contract import validate_envelope, VERSION

class ContractTests(unittest.TestCase):
    def sample(self):
        return {"schemaVersion": VERSION, "eventId": "event-20261103", "summary": "An official event report requiring independent verification.", "sources": [{"url": "https://example.gov/report", "publishedAt": "2026-11-03T10:00:00Z"}]}
    def test_quarantine(self):
        p=self.sample()
        p["evidenceStatus"]="confirmed"
        result=validate_envelope(p)
        self.assertTrue(result["ok"])
        self.assertEqual(result["value"]["evidenceStatus"],"unverified")
    def test_reject_trade(self):
        p=self.sample()
        p["tradeAction"]="BUY"
        self.assertFalse(validate_envelope(p)["ok"])
    def test_reject_http(self):
        p=self.sample()
        p["sources"][0]["url"]="http://example.gov"
        self.assertFalse(validate_envelope(p)["ok"])

if __name__=="__main__":
    unittest.main()
