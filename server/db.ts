import { drizzle } from 'drizzle-orm/node-postgres'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'

export const departments = pgTable('departments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  accent: text('accent').notNull(),
  lead: text('lead').notNull(),
})

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  departmentId: text('department_id').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull(),
  task: text('task'),
})

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  department: text('department').notNull(),
  status: text('status').notNull(),
  owner: text('owner').notNull(),
  priority: text('priority').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const approvals = pgTable('approvals', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('pending'),
  requestedBy: text('requested_by').notNull(),
  decidedBy: text('decided_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
})

export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  detail: text('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Database = ReturnType<typeof drizzle>

let pool: Pool | null = null
let database: Database | null = null

export function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) return null
  if (!pool) {
    pool = new Pool({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } })
    database = drizzle(pool)
  }
  return database
}

export async function ensureSchema() {
  const url = process.env.DATABASE_URL
  if (!url) return false
  if (!pool) getDb()
  if (!pool) return false

  await pool.query(`
    create table if not exists departments (
      id text primary key,
      name text not null,
      accent text not null,
      lead text not null
    );
    create table if not exists agents (
      id text primary key,
      department_id text not null,
      name text not null,
      role text not null,
      status text not null,
      task text
    );
    create table if not exists tasks (
      id text primary key,
      title text not null,
      department text not null,
      status text not null,
      owner text not null,
      priority text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists approvals (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      status text not null default 'pending',
      requested_by text not null,
      decided_by text,
      created_at timestamptz not null default now(),
      decided_at timestamptz
    );
    create table if not exists activity_logs (
      id uuid primary key default gen_random_uuid(),
      actor text not null,
      action text not null,
      target_type text not null,
      target_id text not null,
      detail text,
      created_at timestamptz not null default now()
    );
  `)
  return true
}
