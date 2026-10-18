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



class ProviderRecoveryTest(unittest.TestCase):
    """An insufficient 11/16 board can recover real data, never counterfeit it."""

    @staticmethod
    def incomplete_board(reason="429 rate limit"):
        names=[
            "EUR/USD","GBP/USD","USD/JPY","USD/CHF","AUD/USD","USD/CAD","NZD/USD",
            "EUR/GBP","EUR/JPY","GBP/JPY","AUD/JPY","EUR/AUD","XAU/USD","XAG/USD",
            "BTC/USD","ETH/USD",
        ]
        symbols={}
        for i,symbol in enumerate(names):
            ok=i<11
            symbols[symbol]={
                "symbol":symbol, "group":"major", "assetClass":"fx",
                "ok":ok, "last":1.0 if ok else None,
                "changePct":0.0 if ok else None,
                "barDate":"2026-10-17" if ok else None,
                "detail":"verified" if ok else reason,
            }
        return {"symbols":symbols,"priceType":"DAILY_CLOSE"}

    def test_recovers_temporary_11_of_16_after_cooldown(self):
        from scripts.update_xauusd import recover_transient_board
        board=self.incomplete_board()
        sleeps=[]
        calls=[]
        def fetch(key,symbol,outputsize):
            calls.append((symbol,outputsize))
            return fake_values(symbol,[1.234,1.2],["2026-10-17","2026-10-16"]),symbol
        result=recover_transient_board("TESTKEY",board,{},fetch=fetch,sleep=sleeps.append)
        self.assertEqual(result,1)
        self.assertEqual(sleeps,[65.0])
        self.assertEqual(len(calls),1)
        self.assertEqual(sum(x["ok"] is True for x in board["symbols"].values()),12)
        value=board["symbols"]["EUR/AUD"]
        self.assertEqual(value["barDate"],"2026-10-17")
        self.assertGreater(value["last"],0)

    def test_does_not_retry_permanent_plan_denials_or_fake_data(self):
        from scripts.update_xauusd import recover_transient_board
        board=self.incomplete_board("Plan does not include symbol. Upgrade your subscription.")
        calls=[]
        result=recover_transient_board("KEY",board,{},fetch=lambda *_: calls.append(1),sleep=lambda *_: calls.append("sleep"))
        self.assertEqual(result,0)
        self.assertEqual(calls,[])
        self.assertEqual(sum(x["ok"] is True for x in board["symbols"].values()),11)

    def test_second_429_stops_recovery_without_false_success(self):
        from scripts.update_xauusd import recover_transient_board,RateLimitError
        board=self.incomplete_board()
        attempts=[]
        def fetch(key,symbol,outputsize):
            attempts.append(symbol)
            raise RateLimitError("429")
        self.assertEqual(recover_transient_board("KEY",board,{},fetch=fetch,sleep=lambda _:None),0)
        self.assertEqual(len(attempts),1)
        self.assertEqual(sum(x["ok"] is True for x in board["symbols"].values()),11)

    def test_bogus_provider_close_and_date_are_not_promoted(self):
        from scripts.update_xauusd import recover_transient_board
        for values in [
            fake_values("EUR/AUD",[float("nan"),1.0],["2026-10-17","2026-10-16"]),
            fake_values("EUR/AUD",[1.0,1.0],["bad-date","2026-10-16"]),
        ]:
            board=self.incomplete_board()
            recover_transient_board("KEY",board,{},fetch=lambda *_:(values,None),sleep=lambda _:None)
            self.assertFalse(board["symbols"]["EUR/AUD"]["ok"])
            self.assertIsNone(board["symbols"]["EUR/AUD"]["last"])

    def test_coverage_diagnostic_lists_symbols_and_redacts_params(self):
        from scripts.update_xauusd import print_board_coverage
        from io import StringIO
        from contextlib import redirect_stdout
        board=self.incomplete_board("provider rejected apikey=SECRET-CANNOT-PRINT")
        capture=StringIO()
        with redirect_stdout(capture):
            print_board_coverage(board)
        output=capture.getvalue()
        self.assertIn("11/16 verified; contract minimum 12",output)
        self.assertIn("EUR/AUD",output)
        self.assertNotIn("SECRET-CANNOT-PRINT",output)
        self.assertIn("[REDACTED]",output)




class MandatoryGoldCooldownTest(unittest.TestCase):
    def test_gold_retries_exactly_once_after_rate_limit(self):
        from scripts.update_xauusd import fetch_mandatory_xau, RateLimitError
        calls=[]
        sleeps=[]
        def fake_fetch(key,symbol,outputsize):
            calls.append((symbol,outputsize))
            if len(calls)==1:
                raise RateLimitError("429")
            return fake_values(symbol,[100,101],["2026-10-17","2026-10-16"]),symbol
        values,_=fetch_mandatory_xau("KEY",fetch=fake_fetch,sleep=sleeps.append)
        self.assertEqual(len(calls),2)
        self.assertEqual(sleeps,[65.0])
        self.assertEqual(values[0]["datetime"],"2026-10-17")

    def test_third_gold_429_preserves_hard_failure(self):
        from scripts.update_xauusd import fetch_mandatory_xau, RateLimitError
        calls=[]
        def fake_fetch(key,symbol,outputsize):
            calls.append(symbol)
            raise RateLimitError("429")
        with self.assertRaises(RateLimitError):
            fetch_mandatory_xau("KEY",fetch=fake_fetch,sleep=lambda _:None)
        self.assertEqual(calls,["XAU/USD","XAU/USD","XAU/USD"])

    def test_recovery_after_two_429_waits_65_and_125(self):
        from scripts.update_xauusd import fetch_mandatory_xau, RateLimitError
        attempts, sleeps = [], []
        def fake_fetch(key, symbol, outputsize):
            attempts.append((symbol, outputsize))
            if len(attempts) < 3:
                raise RateLimitError("429")
            return fake_values(symbol,[100.0,99.0],["2026-10-17","2026-10-16"]), symbol
        values, _ = fetch_mandatory_xau(
            "KEY", fetch=fake_fetch, sleep=sleeps.append, outputsize=60
        )
        self.assertEqual(len(attempts), 3)
        self.assertEqual(attempts, [("XAU/USD", 60)] * 3)
        self.assertEqual(sleeps, [65.0, 125.0])
        self.assertEqual(values[0]["datetime"], "2026-10-17")

    def test_bad_outputsize_cannot_disable_rate_limit_budget(self):
        from scripts.update_xauusd import fetch_mandatory_xau
        for bad in [0, 1, 371, True, "60"]:
            with self.assertRaises(ValueError):
                fetch_mandatory_xau("KEY", fetch=lambda *_: self.fail("unexpected provider request"), outputsize=bad)

    def test_gold_plan_denial_has_no_retry(self):
        from scripts.update_xauusd import fetch_mandatory_xau, SourceError
        attempts=[]
        def fake_fetch(*_):
            attempts.append(1)
            raise SourceError("subscription not authorized")
        with self.assertRaises(SourceError):
            fetch_mandatory_xau("KEY",fetch=fake_fetch,sleep=lambda _:self.fail("should not retry"))
        self.assertEqual(attempts,[1])


class BoardContractDiagnosticsTest(unittest.TestCase):
    def test_11_of_16_failure_names_the_unavailable_symbols_without_secret_text(self):
        import json
        from scripts.verify_board import CANONICAL, verify_snapshot_text, MIN_OK
        self.assertEqual(MIN_OK,12)
        board={"priceType":"DAILY_CLOSE","symbols":{}}
        for i,symbol in enumerate(CANONICAL):
            success=i<11
            board["symbols"][symbol]={
                "ok":success,
                "last":1.1 if success else None,
                "changePct":0.2 if success else None,
                "barDate":"2026-10-17" if success else None,
                "detail":"429 rate limit" if i==11 else (
                    "plan does not include this symbol, apikey=SECRET" if not success else "valid"
                ),
            }
        text="window.XAUUSD_DATA = "+json.dumps({"board":board})+";"
        errors=verify_snapshot_text(text)
        self.assertIn("only 11/16 symbols OK, minimum is 12",errors)
        self.assertTrue(any("RATE_LIMITED" in message for message in errors))
        self.assertTrue(any("PLAN_OR_SYMBOL_RESTRICTED" in message for message in errors))
        self.assertFalse(any("SECRET" in message for message in errors))

    def test_contract_rejects_boolean_prices_and_nonrecord_entries(self):
        import json
        from scripts.verify_board import CANONICAL, verify_snapshot_text
        symbols={symbol:{"ok":True,"last":1.0,"changePct":0.1,"barDate":"2026-10-17"} for symbol in CANONICAL}
        symbols["EUR/USD"]["last"]=True
        symbols["ETH/USD"]="not a record"
        text="window.XAUUSD_DATA = "+json.dumps({"board":{"priceType":"DAILY_CLOSE","symbols":symbols}})+";"
        problems=verify_snapshot_text(text)
        self.assertTrue(any("EUR/USD: ok=True" in item for item in problems))
        self.assertTrue(any("ETH/USD: entry must be an object" in item for item in problems))


if __name__ == "__main__":
    unittest.main()
