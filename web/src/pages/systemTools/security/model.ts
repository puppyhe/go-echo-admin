import type { PasswordRules, SecurityPolicy } from './api';
export function passwordRuleText(rules: PasswordRules): string {
  if (!rules.enabled) return '密码长度不能超过 72 个 UTF-8 字节。';
  const categories = [
    rules.uppercase && '大写字母',
    rules.lowercase && '小写字母',
    rules.number && '数字',
    rules.special && '特殊字符',
  ].filter(Boolean);
  const detail = `密码至少需要 ${rules.minLength} 个字符，且不能超过 72 个 UTF-8 字节`;
  const requirements = categories.length ? `，并包含${categories.join('、')}` : '';
  return `${detail}${requirements}。`;
}
export function passwordError(password: string, rules: PasswordRules): string | undefined {
  if (!password.trim()) return '请输入密码';
  if (new TextEncoder().encode(password).length > 72)
    return '密码长度不能超过 72 个 UTF-8 字节';
  if (!rules.enabled) return undefined;
  if ([...password].length < rules.minLength)
    return `密码至少需要 ${rules.minLength} 个字符`;
  if (rules.uppercase && !/\p{Lu}/u.test(password)) return '密码需要包含大写字母';
  if (rules.lowercase && !/\p{Ll}/u.test(password)) return '密码需要包含小写字母';
  if (rules.number && !/\p{Nd}/u.test(password)) return '密码需要包含数字';
  if (rules.special && !/[\p{P}\p{S}]/u.test(password)) return '密码需要包含特殊字符';
  return undefined;
}
export function securityPreset(version: number): SecurityPolicy {
  return {
    version,
    captcha: { threshold: 0, cacheSeconds: 3600, length: 6, width: 240, height: 80 },
    password: {
      enabled: true,
      minLength: 12,
      uppercase: true,
      lowercase: true,
      number: true,
      special: true,
    },
    rateLimit: { enabled: true, windowSeconds: 60, maxAttempts: 10 },
    lockout: { enabled: true, failures: 5, durationMinutes: 30 },
    expiry: { enabled: true, forceFirstLogin: true, days: 90 },
  };
}

/** Generate a policy-compliant password using unbiased cryptographic sampling. */
export function generatePolicyPassword(rules: PasswordRules): string {
  const groups = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789',
    '!@#$%^&*',
  ];
  const alphabet = groups.join('');
  const index = (limit: number) => {
    const upper = Math.floor(0x100000000 / limit) * limit;
    const value = new Uint32Array(1);
    do {
      crypto.getRandomValues(value);
    } while (value[0] >= upper);
    return value[0] % limit;
  };
  const length = Math.max(12, rules.enabled ? rules.minLength : 0);
  const characters = groups.map((group) => group[index(group.length)]);
  while (characters.length < length) characters.push(alphabet[index(alphabet.length)]);
  for (let i = characters.length - 1; i > 0; i--) {
    const other = index(i + 1);
    [characters[i], characters[other]] = [characters[other], characters[i]];
  }
  return characters.join('');
}
