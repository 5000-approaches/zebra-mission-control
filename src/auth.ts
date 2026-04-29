import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { isAllowedEmail } from "@/lib/auth-utils"

const COMPANY_DOMAIN = process.env.COMPANY_DOMAIN || 'zebraconsulting.no'

const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean)
)

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/auth",
  },
  callbacks: {
    signIn({ user }) {
      const email = user.email || ""
      return isAllowedEmail(email, COMPANY_DOMAIN, ALLOWED_EMAILS)
    },
    authorized({ auth: session }) {
      return !!session?.user
    },
  },
})
