from hockey_server.game_logic import merge_patch_and_sync, parse_mmss
from hockey_server.schemas import GameState


def test_parse_mmss() -> None:
    assert parse_mmss("20:00") == 20 * 60
    assert parse_mmss("0:01") == 1


def test_merge_timer_baseline_on_run_start() -> None:
    prev = GameState(running=False, timer="15:00", timer_baseline="20:00")
    body = {"Running": True}
    out = merge_patch_and_sync(prev, body)
    assert out.running is True
    assert out.timer_baseline == "15:00"
