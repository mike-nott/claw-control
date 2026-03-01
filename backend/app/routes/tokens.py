from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Query

from app.token_store import (
    api_cache,
    bucket_granularity,
    floor_bucket,
    get_range_window,
    iso_z,
    next_bucket,
    store,
)

router = APIRouter(prefix="/api/tokens", tags=["tokens"])

_CACHE_TTL = 10  # seconds


def _cached(key: str, ttl: int, fn) -> Any:
    cached = api_cache.get(key)
    if cached is not None:
        return cached
    value = fn()
    api_cache.set(key, value, ttl)
    return value


@router.get("/summary")
def api_tokens_summary(
    range: str = Query("today"),
    agent: str | None = Query(None),
    model: str | None = Query(None),
) -> dict[str, Any]:
    """Return aggregated token usage summary for the given time range."""
    cache_key = f"summary:{range}:{agent or ''}:{model or ''}"

    def build() -> dict[str, Any]:
        rows = store.load_rows_for_range(range)
        if agent:
            rows = [r for r in rows if r["logicalAgent"] == agent]
        if model:
            rows = [r for r in rows if r["model"] == model]

        total_input = sum(r["inputTokens"] for r in rows)
        total_output = sum(r["outputTokens"] for r in rows)
        total_cache_read = sum(r["cacheReadTokens"] for r in rows)
        total_cache_write = sum(r["cacheWriteTokens"] for r in rows)
        total_cost = sum(r.get("costTotal", 0) for r in rows)

        agent_totals: dict[str, int] = defaultdict(int)
        agent_costs: dict[str, float] = defaultdict(float)
        model_totals: dict[tuple[str, str], int] = defaultdict(int)
        model_costs: dict[tuple[str, str], float] = defaultdict(float)

        for row in rows:
            agent_totals[row["logicalAgent"]] += row["total"]
            agent_costs[row["logicalAgent"]] += row.get("costTotal", 0)
            model_totals[(row["modelProvider"], row["model"])] += row["total"]
            model_costs[(row["modelProvider"], row["model"])] += row.get("costTotal", 0)

        top_agents = [
            {"logicalAgent": name, "tokens": tokens, "cost": round(agent_costs[name], 6)}
            for name, tokens in sorted(agent_totals.items(), key=lambda x: x[1], reverse=True)[:3]
        ]

        top_models = [
            {"modelProvider": provider, "model": model, "tokens": tokens, "cost": round(model_costs[(provider, model)], 6)}
            for (provider, model), tokens in sorted(model_totals.items(), key=lambda x: x[1], reverse=True)[:3]
        ]

        largest_context = None
        with_context = [r for r in rows if r["contextTokens"] > 0]
        if with_context:
            best = max(with_context, key=lambda r: r["contextTokens"])
            largest_context = {
                "sessionKey": best["sessionKey"],
                "logicalAgent": best["logicalAgent"],
                "contextTokens": best["contextTokens"],
                "ts": best["bucketTs"],
            }

        return {
            "range": range,
            "totals": {
                "inputTokens": total_input,
                "outputTokens": total_output,
                "totalTokens": total_input + total_output + total_cache_read + total_cache_write,
                "cacheReadTokens": total_cache_read,
                "cacheWriteTokens": total_cache_write,
                "totalCost": round(total_cost, 6),
            },
            "topAgents": top_agents,
            "topModels": top_models,
            "largestContext": largest_context,
        }

    return _cached(cache_key, _CACHE_TTL, build)


@router.get("/by-agent")
def api_tokens_by_agent(
    range: str = Query("today"),
    agent: str | None = Query(None),
    model: str | None = Query(None),
) -> list[dict[str, Any]]:
    """Return token usage grouped by logical agent."""
    cache_key = f"by-agent:{range}:{agent or ''}:{model or ''}"

    def build() -> list[dict[str, Any]]:
        rows = store.load_rows_for_range(range)
        if agent:
            rows = [r for r in rows if r["logicalAgent"] == agent]
        if model:
            rows = [r for r in rows if r["model"] == model]
        grouped: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "inputTokens": 0,
                "outputTokens": 0,
                "cacheRead": 0,
                "cacheWrite": 0,
                "total": 0,
                "cost": 0.0,
            }
        )

        for row in rows:
            entry = grouped[row["logicalAgent"]]
            entry["inputTokens"] += row["inputTokens"]
            entry["outputTokens"] += row["outputTokens"]
            entry["cacheRead"] += row["cacheReadTokens"]
            entry["cacheWrite"] += row["cacheWriteTokens"]
            entry["total"] += row["total"]
            entry["cost"] += row.get("costTotal", 0)

        output = []
        for logical_agent, values in grouped.items():
            values["cost"] = round(values["cost"], 6)
            output.append({"logicalAgent": logical_agent, **values})

        output.sort(key=lambda x: x["total"], reverse=True)
        return output

    return _cached(cache_key, _CACHE_TTL, build)


@router.get("/by-model")
def api_tokens_by_model(
    range: str = Query("today"),
    agent: str | None = Query(None),
    model: str | None = Query(None),
) -> list[dict[str, Any]]:
    """Return token usage grouped by model and provider."""
    cache_key = f"by-model:{range}:{agent or ''}:{model or ''}"

    def build() -> list[dict[str, Any]]:
        rows = store.load_rows_for_range(range)
        if agent:
            rows = [r for r in rows if r["logicalAgent"] == agent]
        if model:
            rows = [r for r in rows if r["model"] == model]
        grouped: dict[tuple[str, str], dict[str, Any]] = defaultdict(
            lambda: {
                "inputTokens": 0,
                "outputTokens": 0,
                "cacheRead": 0,
                "cacheWrite": 0,
                "total": 0,
                "cost": 0.0,
            }
        )

        for row in rows:
            key = (row["modelProvider"], row["model"])
            entry = grouped[key]
            entry["inputTokens"] += row["inputTokens"]
            entry["outputTokens"] += row["outputTokens"]
            entry["cacheRead"] += row["cacheReadTokens"]
            entry["cacheWrite"] += row["cacheWriteTokens"]
            entry["total"] += row["total"]
            entry["cost"] += row.get("costTotal", 0)

        output = []
        for (provider, model_name), values in grouped.items():
            values["cost"] = round(values["cost"], 6)
            output.append({"modelProvider": provider, "model": model_name, **values})

        output.sort(key=lambda x: x["total"], reverse=True)
        return output

    return _cached(cache_key, _CACHE_TTL, build)


@router.get("/timeseries")
def api_tokens_timeseries(
    range: str = Query("today"),
    agent: str | None = Query(None),
    model: str | None = Query(None),
) -> list[dict[str, Any]]:
    """Return token usage as a time-series for charting."""
    cache_key = f"timeseries:{range}:{agent or ''}:{model or ''}"

    def build() -> list[dict[str, Any]]:
        rows = store.load_rows_for_range(range)
        if agent:
            rows = [r for r in rows if r["logicalAgent"] == agent]
        if model:
            rows = [r for r in rows if r["model"] == model]
        window = get_range_window(range)
        granularity = bucket_granularity(range)

        grouped: dict[Any, int] = defaultdict(int)
        for row in rows:
            bucket = floor_bucket(row["ts"], granularity)
            grouped[bucket] += row["total"]

        series = []
        current = floor_bucket(window.start_utc, granularity)
        end = floor_bucket(window.end_utc, granularity)
        while current <= end:
            series.append(
                {
                    "bucketTs": iso_z(current),
                    "tokens": grouped.get(current, 0),
                }
            )
            current = next_bucket(current, granularity)

        return series

    return _cached(cache_key, _CACHE_TTL, build)
