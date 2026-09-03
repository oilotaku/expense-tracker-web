# FastAPI + uv；PYTHON_VERSION 由 docker-compose.yml 從 .env 傳入（預設值來自版本表）
ARG PYTHON_VERSION=3.14
FROM python:${PYTHON_VERSION}-slim AS runtime
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /usr/local/bin/uv

# UV_PYTHON_DOWNLOADS=never：一律用 image 內的 Python（.python-version 只鎖 minor 線），不讓 uv 另外下載
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 \
    TZ=UTC \
    PATH="/app/.venv/bin:$PATH"

# ZoneInfo(API_TZ) 需要系統 tzdata（slim image 未內建）
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && apt-get clean \
    && rm -f /var/lib/apt/lists/*_*

# uv.lock 由 scaffold post_action `uv sync` 產生；--no-install 時請先手動 uv sync
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

COPY backend/ ./

RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 --ingroup app app \
    && chown -R app:app /app
USER app
# 非 root user 沒有可寫的 HOME：容器內 `uv sync --frozen`（裝 dev 依賴跑測試）與 `pip-audit`
# （預設寫 $HOME/.cache/pip-audit，HOME 不存在會直接失敗）都需要可寫 cache。
# 放在 USER 之後才不會被 root 先建走。
ENV HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    UV_CACHE_DIR=/tmp/uv-cache

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
