import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/db.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/agents_command_center',
  },
})
