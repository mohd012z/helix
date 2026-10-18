"""End-to-end board test: run update_xauusd.main() against stubbed providers
(no network, no API key) and enforce the published-snapshot board contract.

The stub fails ETH/USD on purpose to prove the UNAVAILABLE path survives the
full generate → contract pipeline.
"""
import json
import unittest
from pathlib import Path

import scripts.update_xauusd as up
from scripts.verify_board import verify_snapshot_text

CLOSERS = {
    "EUR/USD": (1.1842, 1.1867), "GBP/USD": (1.3642, 1.3631), "USD/JPY": (151.342, 150.701),
    "USD/CHF": (0.8041, 0.8055), "AUD/USD": (0.6642, 0.6638), "USD/CAD": (1.3892, 1.3901),
    "NZD/USD": (0.5942, 0.5951),
    "EUR/GBP": (0.8682, 0.8701), "EUR/JPY": (179.220, 177.940), "GBP/JPY": (206.430, 205.110),
    "AUD/JPY": (100.520, 100.210), "EUR/AUD": (1.7830, 1.7880),
    "XAU/USD": (4327.23, 4293.79), "XAG/USD": (38.123, 37.720),
    "BTC/USD": (91234.5, 89100.0),
    "BNT/USD": (82.10, 81.40),
    "DXY": (100.12, 100.00),
}


def make_bars(symbol, outputsize):
    a, b = CLOSERS[symbol]
    vals = [
        {"datetime": "2026-10-17", "open": str(b), "high": str(max(a, b) * 1.001), "low": str(min(a, b) * 0.999), "close": str(a)},
        {"datetime": "2026-10-16", "open": str(b), "high": str(max(a, b) * 1.001), "low": str(min(a, b) * 0.999), "close": str(b)},
    ]
    return vals[: max(2, int(outputsize))]


class BoardE2ETest(unittest.TestCase):
    def setUp(self):
        self._get_json = up.get_json
        self._get_text = up.get_text
        self._sleep = up.time.sleep
        self._out = up.OUT
        self._env = up.os.environ.copy()

        import os
        import tempfile
        fd, name = tempfile.mkstemp(suffix=".js", prefix="board-e2e-")
        os.close(fd)
        self._tmp_path = Path(name)

        def fake_get_json(url, *, params=None, headers=None, retries=3):
            # Realistic stub: every symbol resolves and returns bars, so the
            # only real sleeps are the 1.2s board pacing and one retry cycle
            # (Brent's time-series 404, matching the provider's behavior).
            if "time_series" in url:
                sym = params["symbol"]
                if sym == "BNT/USD":
                    raise up.SourceError("404 Client Error for BNT/USD (stub)")
                return {"values": make_bars("BTC/USD" if sym == "ETH/USD" else sym, params.get("outputsize", 3)), "name": sym}
            if "symbol_search" in url:
                return {"data": [{"symbol": "DXY", "instrument_name": "US Dollar Index"}]}
            if "fred" in url:
                return {"observations": [{"date": "2026-10-15", "value": "4.15"}, {"date": "2026-10-14", "value": "4.13"}]}
            if "newsapi" in url:
                return {"articles": []}
            if "commodities" in url:
                return {"data": [{"symbol": "BNT/USD", "name": "Brent Crude Oil"}]}
            return {}

        up.get_json = fake_get_json
        up.get_text = lambda url, *, retries=3: "<html><body></body></html>"
        up.time.sleep = lambda s: None
        up.OUT = self._tmp_path
        up.os.environ["TWELVE_DATA_API_KEY"] = "stub"
        up.os.environ["FRED_API_KEY"] = "stub"
        up.os.environ.pop("NEWS_API_KEY", None)

    def tearDown(self):
        up.get_json, up.get_text, up.time.sleep, up.OUT = self._get_json, self._get_text, self._sleep, self._out
        up.os.environ.clear()
        up.os.environ.update(self._env)
        self._tmp_path.unlink(missing_ok=True)

    def test_main_generates_a_board_snapshot_that_passes_the_contract(self):
        rc = up.main()
        self.assertEqual(rc, 0)
        problems = verify_snapshot_text(self._tmp_path.read_text(encoding="utf"))
        self.assertEqual(problems, [], f"board contract violated: {problems}")

    def test_board_entries_carry_bar_honest_provenance(self):
        rc = up.main()
        self.assertEqual(rc, 0)
        text = self._tmp_path.read_text(encoding="utf")
        payload = json.loads(text[text.find("window.XAUUSD_DATA = ") + len("window.XAUUSD_DATA = "):text.rfind(";")].strip())
        eth = payload["board"]["symbols"]["ETH/USD"]
        self.assertTrue(eth["ok"])
        # The stub served BTC/USD bars for ETH/USD; the provenance must
        # reflect the bar actually returned, never a fabricated match.
        self.assertEqual(eth["last"], 91234.5)
        self.assertEqual(eth["barDate"], "2026-10-17")
        xau = payload["board"]["symbols"]["XAU/USD"]
        self.assertTrue(xau["ok"])
        self.assertEqual(xau["last"], 4327.23)

    def test_hard_failed_symbol_stays_unavailable(self):
        hard = up.get_json

        def hard_fail(url, *, params=None, headers=None, retries=3):
            if "time_series" in url and params.get("symbol") == "ETH/USD":
                raise up.SourceError("429 rate limited (stub)")
            return hard(url, params=params, headers=headers, retries=retries)

        up.get_json = hard_fail
        rc = up.main()
        self.assertEqual(rc, 0)
        text = self._tmp_path.read_text(encoding="utf")
        payload = json.loads(text[text.find("window.XAUUSD_DATA = ") + len("window.XAUUSD_DATA = "):text.rfind(";")].strip())
        eth = payload["board"]["symbols"]["ETH/USD"]
        self.assertFalse(eth["ok"])
        self.assertIn("429", eth["detail"])
        problems = verify_snapshot_text(text)
        self.assertEqual(problems, [], f"board contract violated: {problems}")


if __name__ == "__main__":
    unittest.main()
