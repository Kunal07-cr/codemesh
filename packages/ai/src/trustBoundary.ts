export function repositoryInstructionWarnings(content: string) {
  const rules = [
    { id: "role-spoof", pattern: /(?:\[system\]|<\/?system>|<\|(?:im_start|system)\|>|^\s*(?:\/\/|#|\*)\s*(?:system|developer)\s*:)/i },
    { id: "override", pattern: /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system|developer)\s+(?:instructions|rules|messages)/i },
    { id: "secret-request", pattern: /(?:reveal|print|send|exfiltrate|upload)\s+(?:all\s+|the\s+)?(?:secrets|credentials|api[ _-]?keys|system prompt|environment variables)/i },
    { id: "tool-hijack", pattern: /(?:assistant|agent|copilot)\s*(?:must|should|:)\s*(?:execute|run|fetch|upload|delete)/i }
  ];
  return content.split(/\r?\n/).flatMap((line, index) => rules.filter((rule) => rule.pattern.test(line)).map((rule) => ({ rule: rule.id, line: index + 1 })));
}
