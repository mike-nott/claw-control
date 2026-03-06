/** Map a provider/model-id string to a friendly display name. */
export function friendlyModelName(raw: string): string {
  if (!raw) return "Unknown";
  const name = raw.includes("/") ? raw.split("/").pop()! : raw;
  if (name.includes("opus-4-6")) return "Opus 4.6";
  if (name.includes("sonnet-4-6")) return "Sonnet 4.6";
  if (name.includes("haiku")) return "Haiku 4.5";
  if (/qwen.*3\.5.*122/i.test(name)) return "Qwen3.5 122B A10B";
  if (/qwen.*3\.5.*35/i.test(name)) return "Qwen3.5 35B A3B";
  if (/qwen.*3\.5.*27/i.test(name)) return "Qwen3.5 27B";
  if (/qwen.*3\.5.*9b/i.test(name)) return "Qwen3.5 9B";
  if (/qwen.*3.*30/i.test(name)) return "Qwen3 VL 30B";
  if (/kimi/i.test(name)) return "Kimi K2.5";
  if (/gpt-5/i.test(name)) return "GPT-5.2";
  return name;
}

/** Map telemetry (provider, model) pair to a friendly name. */
export function friendlyTelemetryName(provider: string, model: string): string {
  return friendlyModelName(`${provider}/${model}`);
}
