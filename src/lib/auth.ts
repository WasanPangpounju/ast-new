import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = z.object({
          email: z.string().email(),
          password: z.string().min(1),
        }).safeParse(credentials)
        if (!parsed.success) return null
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
        if (!user) return null
        const valid = await bcrypt.compare(parsed.data.password, user.password)
        if (!valid) return null
        return { id: String(user.id), name: user.name, email: user.email }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) { if (user) token.id = user.id; return token },
    session({ session, token }) { if (session.user) session.user.id = token.id as string; return session },
  },
})
