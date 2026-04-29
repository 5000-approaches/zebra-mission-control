export function isAllowedEmail(email: string, domain: string, allowed: Set<string>): boolean {
  if (email.endsWith(`@${domain}`)) return true
  if (allowed.size > 0 && allowed.has(email)) return true
  return false
}
