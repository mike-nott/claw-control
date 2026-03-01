# Agent access matrix — defines what each agent can access.
#
# Customise this to match your agent setup. The keys should match
# the agent IDs in your OpenClaw config (openclaw.json) and
# agents.yaml. Agents not listed here will show empty access.
#
# Values: "R" (read), "W" (write), "RW" (read+write), True (boolean access)

ACCESS_MATRIX: dict[str, dict] = {
    # Example:
    # "main": {
    #     "memory": {"MEMORY.md": "RW", "topics/": "RW"},
    #     "data_stores": {"email": "R", "calendar": "R"},
    #     "tools": {"Web Search": True, "MC post": "RW"},
    #     "external_tools": {},
    # },
}

# Display column keys (customise to match your data stores and tools)
MEMORY_KEYS: list[str] = []
DATA_STORE_KEYS: list[str] = []
TOOL_KEYS: list[str] = []
EXTERNAL_TOOL_KEYS: list[str] = []
