import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { activityLogs, agents as agentsTable, approvals as approvalsTable, departments as departmentsTable, ensureSchema, getDb, tasks as tasksTable } from './db.js'

const app = express()
const port = Number(process.env.PORT || 3000)
app.use(express.json())

let databaseReady = false
let databaseError: string | null = null
const readyDb = () => databaseReady ? getDb() : null

const seedDepartments = [
  {id:'marketing',name:'Marketing',accent:'#ef5a8c',lead:'Maya',agents:[
    {id:'m1',name:'Maya',role:'Marketing Lead',status:'working',task:'Launch campaign plan'},
    {id:'m2',name:'Nova',role:'Research',status:'working',task:'Competitor scan'},
    {id:'m3',name:'Pixel',role:'Creative Brief',status:'approval',task:'October campaign'},
    {id:'m4',name:'Quill',role:'Copywriter',status:'idle'},{id:'m5',name:'Echo',role:'Social',status:'waiting',task:'Asset handoff'},
    {id:'m6',name:'Rank',role:'SEO',status:'working',task:'Keyword map'},{id:'m7',name:'Pulse',role:'Analytics',status:'idle'}]},
  {id:'sales',name:'Sales',accent:'#d6bb55',lead:'Atlas',agents:[{id:'s1',name:'Atlas',role:'Sales Lead',status:'working',task:'Pipeline review'},{id:'s2',name:'Scout',role:'Prospecting',status:'working',task:'Lead enrichment'},{id:'s3',name:'Iris',role:'CRM',status:'idle'},{id:'s4',name:'Closer',role:'Proposal',status:'waiting',task:'Pricing'}]},
  {id:'operations',name:'Operations',accent:'#9a6cff',lead:'Orion',agents:[{id:'o1',name:'Orion',role:'Ops Lead',status:'working',task:'SOP audit'},{id:'o2',name:'Relay',role:'Workflow',status:'idle'},{id:'o3',name:'Gauge',role:'QA',status:'working',task:'Checklist'}]},
  {id:'finance',name:'Finance',accent:'#4378ff',lead:'Ledger',agents:[{id:'f1',name:'Ledger',role:'Finance Lead',status:'working',task:'Cashflow brief'},{id:'f2',name:'Mint',role:'Billing',status:'idle'},{id:'f3',name:'Audit',role:'Reconciliation',status:'approval',task:'Vendor payment'}]},
  {id:'engineering',name:'Engineering',accent:'#39c6a3',lead:'Forge',agents:[{id:'e1',name:'Forge',role:'Engineering Lead',status:'working',task:'MVP build'},{id:'e2',name:'Patch',role:'Frontend',status:'working',task:'HQ UI'},{id:'e3',name:'Rail',role:'DevOps',status:'idle'},{id:'e4',name:'Schema',role:'Backend',status:'working',task:'Task API'}]},
  {id:'support',name:'Customer',accent:'#4cc2ff',lead:'Harbor',agents:[{id:'c1',name:'Harbor',role:'Support Lead',status:'waiting',task:'Inbox triage'},{id:'c2',name:'Lumen',role:'Support',status:'idle'},{id:'c3',name:'Signal',role:'Success',status:'working',task:'Health scores'}]}
]

const seedTasks = [
  {id:'t1',title:'Launch campaign strategy',department:'Marketing',status:'Running',owner:'Maya',priority:'High'},
  {id:'t2',title:'October creative brief',department:'Marketing',status:'Approval',owner:'Pixel',priority:'High'},
  {id:'t3',title:'Competitor intelligence scan',department:'Marketing',status:'Running',owner:'Nova',priority:'Medium'},
  {id:'t4',title:'Keyword opportunity map',department:'Marketing',status:'Planned',owner:'Rank',priority:'Medium'},
  {id:'t5',title:'Social content calendar',department:'Marketing',status:'Waiting',owner:'Echo',priority:'Medium'},
  {id:'t6',title:'Publish campaign assets',department:'Marketing',status:'Inbox',owner:'Quill',priority:'Low'}
]

const tools=[{name:'GitHub',status:'connected'},{name:'Google Drive',status:'connected'},{name:'Gmail',status:'connected'},{name:'Railway',status:'ready'},{name:'Browser',status:'ready'},{name:'Figma',status:'offline'}]

async function seedIfNeeded() {
  const db = readyDb()
  if (!db) return
  const existing = await db.select().from(departmentsTable)
  if (existing.length) return
  await db.insert(departmentsTable).values(seedDepartments.map(({agents, ...d}) => d))
  await db.insert(agentsTable).values(seedDepartments.flatMap(d => d.agents.map(a => ({...a, departmentId:d.id}))))
  await db.insert(tasksTable).values(seedTasks)
  await db.insert(approvalsTable).values([
    {title:'October creative brief',requestedBy:'Pixel'},
    {title:'Vendor payment',requestedBy:'Audit'},
    {title:'Campaign publish',requestedBy:'Maya'}
  ])
}

async function readState() {
  const db = readyDb()
  if (!db) return { departments: seedDepartments, tasks: seedTasks, approvals: 3, tools, persistence:'memory', databaseError }
  try {
    const [departmentRows, agentRows, taskRows, approvalRows] = await Promise.all([
      db.select().from(departmentsTable),
      db.select().from(agentsTable),
      db.select().from(tasksTable),
      db.select().from(approvalsTable)
    ])
    const departments = departmentRows.map(d => ({...d, agents:agentRows.filter(a => a.departmentId===d.id).map(({departmentId, ...a})=>a)}))
    return {departments,tasks:taskRows.map(({createdAt,updatedAt,...t})=>t),approvals:approvalRows.filter(a=>a.status==='pending').length,tools,persistence:'postgres'}
  } catch (error) {
    databaseReady = false
    databaseError = error instanceof Error ? error.message : 'database_error'
    console.error('Database read failed, switching to memory mode:', databaseError)
    return { departments: seedDepartments, tasks: seedTasks, approvals: 3, tools, persistence:'memory', databaseError }
  }
}

app.get('/api/health', async (_req,res)=>{
  const database = databaseReady ? 'connected' : (process.env.DATABASE_URL ? 'degraded' : 'not-configured')
  res.json({ok:true,service:'agents-command-center',version:'0.2.1',database,databaseError,persistence:databaseReady?'postgres':'memory'})
})

app.get('/api/state', async (_req,res)=>{
  try { res.json(await readState()) } catch (error) { res.status(500).json({error:error instanceof Error?error.message:'state_error'}) }
})

app.post('/api/tasks', async (req,res)=>{
  const task={
    id:String(req.body?.id || `t-${Date.now()}`),
    title:String(req.body?.title || 'Untitled task'),
    department:String(req.body?.department || 'Marketing'),
    status:String(req.body?.status || 'Inbox'),
    owner:String(req.body?.owner || 'Unassigned'),
    priority:String(req.body?.priority || 'Medium')
  }
  const db=readyDb()
  if (!db) return res.status(503).json({error:'database_unavailable',mode:'memory'})
  await db.insert(tasksTable).values(task)
  await db.insert(activityLogs).values({actor:'You',action:'task.created',targetType:'task',targetId:task.id,detail:task.title})
  res.status(201).json(task)
})

app.patch('/api/tasks/:id', async (req,res)=>{
  const db=readyDb()
  if (!db) return res.status(503).json({error:'database_unavailable',mode:'memory'})
  const patch:any={updatedAt:new Date()}
  for (const key of ['title','department','status','owner','priority']) if (req.body?.[key]!==undefined) patch[key]=String(req.body[key])
  const [updated]=await db.update(tasksTable).set(patch).where(eq(tasksTable.id,req.params.id)).returning()
  if (!updated) return res.status(404).json({error:'task_not_found'})
  await db.insert(activityLogs).values({actor:'You',action:'task.updated',targetType:'task',targetId:req.params.id,detail:JSON.stringify(patch)})
  res.json(updated)
})

app.get('/api/approvals', async (_req,res)=>{
  const db=readyDb(); if(!db) return res.status(503).json({error:'database_unavailable',mode:'memory'})
  res.json(await db.select().from(approvalsTable))
})

app.patch('/api/approvals/:id', async (req,res)=>{
  const db=readyDb(); if(!db) return res.status(503).json({error:'database_unavailable',mode:'memory'})
  const status=String(req.body?.status || '')
  if(!['approved','rejected','pending'].includes(status)) return res.status(400).json({error:'invalid_status'})
  const [updated]=await db.update(approvalsTable).set({status,decidedBy:status==='pending'?null:'You',decidedAt:status==='pending'?null:new Date()}).where(eq(approvalsTable.id,req.params.id)).returning()
  if(!updated) return res.status(404).json({error:'approval_not_found'})
  await db.insert(activityLogs).values({actor:'You',action:`approval.${status}`,targetType:'approval',targetId:req.params.id,detail:updated.title})
  res.json(updated)
})

app.get('/api/activity', async (_req,res)=>{
  const db=readyDb(); if(!db) return res.status(503).json({error:'database_unavailable',mode:'memory'})
  res.json(await db.select().from(activityLogs))
})

app.post('/api/chat', async (req,res)=>{
  const state=await readState()
  const dept=state.departments.find(d=>d.id===req.body?.department)
  const lead=dept?.lead ?? 'Command Lead'
  const message=String(req.body?.message || '')
  const lower=message.toLowerCase()
  const persistence = state.persistence === 'postgres' ? 'Persistence is live.' : 'Database is temporarily degraded, so I am operating in memory mode.'
  let reply=`${lead}: Command received. ${persistence} The next step is connecting the model router so I can decompose this into delegated tasks.`
  if(lower.includes('block')) reply=`${lead}: Current blockers are visible from the active task and agent state. Persistence mode is ${state.persistence}.`
  if(lower.includes('summar')) reply=`${lead}: I can summarize the current department state. Persistence mode is ${state.persistence}.`
  res.json({reply})
})

async function boot() {
  try {
    databaseReady = await ensureSchema()
    if (databaseReady) {
      await seedIfNeeded()
      databaseError = null
    }
  } catch (error) {
    databaseReady = false
    databaseError = error instanceof Error ? error.message : 'database_boot_error'
    console.error('Database boot failed, continuing in memory mode:', databaseError)
  }

  const __dirname=path.dirname(fileURLToPath(import.meta.url))
  const dist=path.resolve(__dirname,'../dist')
  app.use(express.static(dist))
  app.get('/*splat',(_req,res)=>res.sendFile(path.join(dist,'index.html')))
  app.listen(port,'0.0.0.0',()=>console.log(`Agents Command Center listening on :${port} | persistence=${databaseReady?'postgres':'memory'}`))
}

boot().catch(error=>{ console.error('Fatal boot failure',error); process.exit(1) })
