import unittest

from scripts.update_xauusd import BOARD_SYMBOLS, collect_board


def fake_values(symbol, closes, dates):
    return [{"datetime": dates[0], "close": str(closes[0])},
            {"datetime": dates[1], "close": str(closes[1])}]


class RateLimitTest(unittest.TestCase):
    """A 429 must fail fast (no retry) and surface as RateLimitError —
    immediate retries cannot create credits that the minute window does not
    yet hold."""

    def test_http_429_fails_fast_without_retry(self):
        import scripts.update_xauusd as up

        calls = []

        class FakeResp:
            status_code = 429
            def raise_for_status(self):
                raise up.SourceError("429")
            def json(self):
                return {}

        orig = up.requests.get
        try:
            def fake_get(url, params=None, headers=None, timeout=None):
                calls.append(url)
                return FakeResp()
            up.requests.get = fake_get
            with self.assertRaises(up.RateLimitError):
                up.get_json("https://example.test", retries=3)
            self.assertEqual(len(calls), 1, "429 must not be retried")
        finally:
            up.requests.get = orig

    def test_body_rate_limit_message_fails_fast(self):
        import scripts.update_xauusd as up

        calls = []

        class FakeResp:
            status_code = 200
            def raise_for_status(self):
                return None
            def json(self):
                return {"status": "error", "message": "The request has exceeded the rate limit."}

        orig = up.requests.get
        try:
            def fake_get(url, params=None, headers=None, timeout=None):
                calls.append(url)
                return FakeResp()
            up.requests.get = fake_get
            with self.assertRaises(up.RateLimitError):
                up.get_json("https://example.test", retries=3)
            self.assertEqual(len(calls), 1)
        finally:
            up.requests.get = orig

    def test_rate_limit_is_a_source_error(self):
        import scripts.update_xauusd as up
        self.assertTrue(issubclass(up.RateLimitError, up.SourceError))


class CollectBoardTest(unittest.TestCase):
    def test_board_inventory_covers_desk_scope(self):
        # XAU/USD is intentionally NOT fetched here: the caller injects the
        # already-verified hero bar, so the board fetch stays at 15 symbols.
        groups = [g for _, _, g in BOARD_SYMBOLS]
        self.assertEqual(groups.count("major"), 7)
        self.assertEqual(groups.count("minor"), 5)
        self.assertEqual(groups.count("metal"), 1)
        self.assertEqual(groups.count("digital"), 2)
        self.assertEqual(len(set(s for s, _, _ in BOARD_SYMBOLS)), len(BOARD_SYMBOLS))

    def test_settle_waits_for_preboard_window_to_clear(self):
        events = []

        def fetch(api_key, symbol, outputsize):
            events.append("fetch")
            return fake_values(symbol, [1.1842, 1.1867], ["2026-10-17", "2026-10-16"]), "EUR/USD"

        def sleep(s):
            events.append(("sleep", s))

        # 0s elapsed since pre-board -> full 60s window settle before any fetch
        collect_board("KEY", {}, fetch=fetch, sleep=sleep,
                      board_symbols=[("EUR/USD", "fx", "major")],
                      elapsed_since_preboard=0.0)
        self.assertEqual(events[0], ("sleep", 60.0), "settle must precede every fetch")
        self.assertEqual(events[1], "fetch")

    def test_settle_shortens_as_preboard_window_elapses(self):
        sleeps = []
        collect_board("KEY", {},
                      fetch=lambda k, s, n: (fake_values(s, [1.0, 1.0], ["2026-10-17", "2026-10-16"]), s),
                      sleep=sleeps.append,
                      board_symbols=[("EUR/USD", "fx", "major")],
                      elapsed_since_preboard=40.0)
        self.assertEqual(sleeps[0], 20.0, "settle = window - elapsed (40 -> 20s)")

    def test_settle_is_zero_once_window_fully_elapsed(self):
        sleeps = []
        collect_board("KEY", {},
                      fetch=lambda k, s, n: (fake_values(s, [1.0, 1.0], ["2026-10-17", "2026-10-16"]), s),
                      sleep=sleeps.append,
                      board_symbols=[("EUR/USD", "fx", "major")],
                      elapsed_since_preboard=70.0)
        self.assertEqual(sleeps[0], 10.0, "no settle sleep; first sleep is the per-symbol pace")

    def test_successful_symbols_carry_daily_close_and_pct(self):
        calls = []

        def fetch(api_key, symbol, outputsize):
            calls.append((symbol, outputsize))
            return fake_values(symbol, [1.1842, 1.1867], ["2026-10-17", "2026-10-16"]), "EUR/USD"

        status = {}
        board = collect_board(
            "KEY", status, fetch=fetch, sleep=lambda s: None,
            board_symbols=[("EUR/USD", "fx", "major")],
        )
        entry = board["symbols"]["EUR/USD"]
        self.assertTrue(entry["ok"])
        self.assertEqual(entry["last"], 1.1842)
        self.assertEqual(entry["changePct"], -0.21)
        self.assertEqual(entry["barDate"], "2026-10-17")
        self.assertTrue(status["board_EUR_USD"]["ok"])
        self.assertEqual(calls[0][1], 2, "only the latest two bars are needed")
        self.assertEqual(board["priceType"], "DAILY_CLOSE")

    def test_failed_symbol_is_labelled_never_fabricated(self):
        def fetch(api_key, symbol, outputsize):
            raise RuntimeError("provider 404 for XBR/USD")

        status = {}
        board = collect_board(
            "KEY", status, fetch=fetch, sleep=lambda s: None,
            board_symbols=[("EUR/AUD", "fx", "minor")],
        )
        entry = board["symbols"]["EUR/AUD"]
        self.assertFalse(entry["ok"])
        self.assertIsNone(entry["last"])
        self.assertIsNone(entry["changePct"])
        self.assertEqual(entry["detail"], "provider 404 for XBR/USD")
        self.assertFalse(status["board_EUR_AUD"]["ok"])
        self.assertEqual(status["board_EUR_AUD"]["detail"], "provider 404 for XBR/USD")

    def test_mixed_run_keeps_good_symbols_and_marks_bad_ones(self):
        def fetch(api_key, symbol, outputsize):
            if symbol == "BTC/USD":
                raise RuntimeError("rate limited")
            return fake_values(symbol, [91234.5, 89000.0], ["2026-10-17", "2026-10-16"]), symbol

        status = {}
        board = collect_board(
            "KEY", status, fetch=fetch, sleep=lambda s: None,
            board_symbols=[("BTC/USD", "digital", "digital"), ("ETH/USD", "digital", "digital")],
        )
        self.assertFalse(board["symbols"]["BTC/USD"]["ok"])
        self.assertTrue(board["symbols"]["ETH/USD"]["ok"])
        self.assertEqual(board["symbols"]["ETH/USD"]["changePct"], 2.51)

    def test_metal_rounding_is_three_decimals_fx_is_five(self):
        def fetch(api_key, symbol, outputsize):
            if symbol == "XAG/USD":
                return fake_values(symbol, [38.12345, 37.0], ["2026-10-17", "2026-10-16"]), symbol
            return fake_values(symbol, [1.234567, 1.2], ["2026-10-17", "2026-10-16"]), symbol

        status = {}
        board = collect_board(
            "KEY", status, fetch=fetch, sleep=lambda s: None,
            board_symbols=[("XAG/USD", "metal", "metal"), ("EUR/AUD", "fx", "minor")],
        )
        self.assertEqual(board["symbols"]["XAG/USD"]["last"], 38.123)
        self.assertEqual(board["symbols"]["EUR/AUD"]["last"], 1.23457)


if __name__ == "__main__":
    unittest.main()
