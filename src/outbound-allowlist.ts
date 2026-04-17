export interface OutboundAllowlistConfig {
  enabled: boolean;
  allow: string[];
}

type NormalizedAllowRule =
  | { type: "email"; value: string }
  | { type: "domain"; value: string };

export const outboundAllowlistConfig: OutboundAllowlistConfig = {
  enabled: true,
  allow: [
    "*@brightex.cc",
    "tsuicx@qq.com",
    "tsuicx@gmail.com",
  ],
};

const normalizedAllowRules = normalizeAllowRules(outboundAllowlistConfig.allow);

export function findRejectedOutboundRecipients(recipients: string[]): string[] {
  if (!outboundAllowlistConfig.enabled) {
    return [];
  }

  if (normalizedAllowRules.length === 0) {
    return [];
  }

  return recipients.filter((recipient) => !matchesAnyAllowRule(recipient));
}

function matchesAnyAllowRule(recipient: string): boolean {
  return normalizedAllowRules.some((rule) => matchesAllowRule(recipient, rule));
}

function matchesAllowRule(recipient: string, rule: NormalizedAllowRule): boolean {
  if (rule.type === "email") {
    return recipient === rule.value;
  }

  return recipient.endsWith(`@${rule.value}`);
}

function normalizeAllowRules(entries: string[]): NormalizedAllowRule[] {
  return entries.map(normalizeAllowRule);
}

function normalizeAllowRule(entry: string): NormalizedAllowRule {
  const value = entry.trim().toLowerCase();
  if (!value) {
    throw new Error("outbound allowlist entry must not be empty");
  }

  if (value.startsWith("*@")) {
    const domain = value.slice(2);
    if (!isValidDomain(domain)) {
      throw new Error(`invalid outbound allowlist wildcard domain: ${entry}`);
    }
    return { type: "domain", value: domain };
  }

  if (!isValidEmail(value)) {
    throw new Error(`invalid outbound allowlist email: ${entry}`);
  }

  return { type: "email", value };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value);
}

function isValidDomain(value: string): boolean {
  return /^[^\s@]+\.[^\s@]+$/i.test(value);
}
