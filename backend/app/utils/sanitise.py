"""Input sanitisation for ClawControl.

Strips common dangerous characters from user/agent-supplied text.
Applied to task titles, descriptions, comments, and federation inbound data.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

# Control characters except \t (0x09), \n (0x0A), \r (0x0D)
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

MAX_TITLE_LENGTH = 500
MAX_BODY_LENGTH = 10_000


def _strip_control_chars(text: str) -> str:
    """Remove null bytes and control characters, keeping tabs and newlines."""
    return _CONTROL_CHARS.sub("", text)


def sanitise_title(text: str) -> str:
    """Sanitise a short text field (task title, activity title, escalation title)."""
    cleaned = _strip_control_chars(text)
    if cleaned != text:
        logger.warning("Stripped control characters from title input")
    if len(cleaned) > MAX_TITLE_LENGTH:
        logger.warning("Truncated title from %d to %d chars", len(cleaned), MAX_TITLE_LENGTH)
        cleaned = cleaned[:MAX_TITLE_LENGTH]
    return cleaned


def sanitise_text(text: str) -> str:
    """Sanitise a longer text field (description, summary, comment body)."""
    cleaned = _strip_control_chars(text)
    if cleaned != text:
        logger.warning("Stripped control characters from text input")
    if len(cleaned) > MAX_BODY_LENGTH:
        logger.warning("Truncated text from %d to %d chars", len(cleaned), MAX_BODY_LENGTH)
        cleaned = cleaned[:MAX_BODY_LENGTH]
    return cleaned
