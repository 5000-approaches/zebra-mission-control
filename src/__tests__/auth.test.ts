import { describe, it, expect } from "vitest"
import { isAllowedEmail } from "@/lib/auth-utils"

const DOMAIN = "zebraconsulting.no"
const ALLOWED = new Set(["rune@5000approaches.io"])

describe("isAllowedEmail", () => {
  it("accepts zebraconsulting.no accounts", () => {
    expect(isAllowedEmail("user@zebraconsulting.no", DOMAIN, ALLOWED)).toBe(true)
  })

  it("accepts rune@5000approaches.io when in ALLOWED_EMAILS", () => {
    expect(isAllowedEmail("rune@5000approaches.io", DOMAIN, ALLOWED)).toBe(true)
  })

  it("rejects random gmail accounts", () => {
    expect(isAllowedEmail("random@gmail.com", DOMAIN, ALLOWED)).toBe(false)
  })
})
