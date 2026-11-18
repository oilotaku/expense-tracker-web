from app.core.db import engine


def test_engine_hides_sql_parameters_in_errors() -> None:
    # 非預期 DB 錯誤經 500 handler 的 logger.exception 印出時，
    # 不能帶出 SQL 參數（email、password_hash）→ fixed.md §31
    assert engine.sync_engine.hide_parameters is True
