from __future__ import annotations

import logging
import sys


class KeyValueFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        msg = record.getMessage().replace("\n", " ")
        return f"level={record.levelname} logger={record.name} msg=\"{msg}\""


def setup_logging() -> None:
    root = logging.getLogger()
    if root.handlers:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(KeyValueFormatter())
    root.setLevel(logging.INFO)
    root.addHandler(handler)
