import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client.ts'
import { requireEnv } from './env.ts'

// One Prisma client for the whole server. Prisma 7 talks to PostgreSQL through the
// `pg` driver adapter; the connection string comes from DATABASE_URL.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }),
})
