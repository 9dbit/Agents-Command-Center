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

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: text('agent_id').notNull(),
  departmentId: text('department_id').notNull(),
  skill: text('skill').notNull(),
  status: text('status').notNull().default('queued'),
  input: text('input'),
  output: text('output'),
  taskId: text('task_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})

export const missions = pgTable('missions', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  objective: text('objective').notNull(),
  status: text('status').notNull().default('active'),
  departmentIds: text('department_ids').notNull().default('[]'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  department: text('department').notNull(),
  status: text('status').notNull(),
  owner: text('owner').notNull(),
  priority: text('priority').notNull(),
  missionId: uuid('mission_id'),
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

export const knowledgeItems = pgTable('knowledge_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: text('type').notNull().default('knowledge'),
  title: text('title').notNull(),
  content: text('content').notNull(),
  scope: text('scope').notNull().default('organization'),
  departmentId: text('department_id'),
  source: text('source').notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  departmentId: text('department_id').notNull(),
  lead: text('lead').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  provider: text('provider'),
  model: text('model'),
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
    create table if not exists agent_runs (
      id uuid primary key default gen_random_uuid(),
      agent_id text not null,
      department_id text not null,
      skill text not null,
      status text not null default 'queued',
      input text,
      output text,
      task_id text,
      created_at timestamptz not null default now(),
      started_at timestamptz,
      completed_at timestamptz
    );
    create index if not exists agent_runs_department_idx on agent_runs(department_id, created_at desc);
    create index if not exists agent_runs_agent_idx on agent_runs(agent_id, created_at desc);
    create table if not exists missions (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      objective text not null,
      status text not null default 'active',
      department_ids text not null default '[]',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
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
    alter table tasks add column if not exists mission_id uuid;
    create index if not exists tasks_mission_idx on tasks(mission_id);
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
    create table if not exists knowledge_items (
      id uuid primary key default gen_random_uuid(),
      type text not null default 'knowledge',
      title text not null,
      content text not null,
      scope text not null default 'organization',
      department_id text,
      source text not null default 'manual',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists conversations (
      id uuid primary key default gen_random_uuid(),
      department_id text not null,
      lead text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists messages (
      id uuid primary key default gen_random_uuid(),
      conversation_id uuid not null references conversations(id) on delete cascade,
      role text not null,
      content text not null,
      provider text,
      model text,
      created_at timestamptz not null default now()
    );
    create index if not exists knowledge_items_department_idx on knowledge_items(department_id);
    create index if not exists knowledge_items_type_idx on knowledge_items(type);
    create index if not exists conversations_department_idx on conversations(department_id, updated_at desc);
    create index if not exists messages_conversation_idx on messages(conversation_id, created_at asc);
  `)
  return true
}
