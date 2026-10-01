import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { desc, eq } from 'drizzle-orm'
import {
  activityLogs, agentRuns, agents as agentsTable, approvals as approvalsTable, conversations,
  departments as departmentsTable, ensureSchema, getDb, knowledgeItems, messages, missions as missionsTable,
  tasks as tasksTable
} from './db.js'
import { getModelStatus, routeModel } from './modelRouter.js'
import { fetchGitHubSnapshot, getToolStatus } from './toolRouter.js'

const app = express()
const port = Number(process.env.PORT || 3000)
app.use(express.json({limit:'1mb'}))

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
  await db.insert(activityLogs).values({actor:'System',action:'seeded',targetType:'workspace',targetId:'default',detail:'Initial P0 seed loaded'})
}

async function readState() {
  const db = readyDb()
  if (!db) return { departments: seedDepartments, tasks: seedTasks, approvals: 3, tools, persistence:'memory', databaseError, model:getModelStatus() }
  try {
    const [departmentRows, agentRows, taskRows, approvalRows] = await Promise.all([
      db.select().from(departmentsTable), db.select().from(agentsTable), db.select().from(tasksTable), db.select().from(approvalsTable)
    ])
    const departments = departmentRows.map(d => ({...d, agents:agentRows.filter(a => a.departmentId===d.id).map(({departmentId, ...a})=>a)}))
    return {departments,tasks:taskRows.map(({createdAt,updatedAt,...t})=>t),approvals:approvalRows.filter(a=>a.status==='pending').length,tools,persistence:'postgres',model:getModelStatus()}
  } catch (error) {
    databaseReady = false
    databaseError = error instanceof Error ? error.message : 'database_error'
    console.error('Database read failed, switching to memory mode:', databaseError)
    return { departments: seedDepartments, tasks: seedTasks, approvals: 3, tools, persistence:'memory', databaseError, model:getModelStatus() }
  }
}

async function getConversation(departmentId:string, lead:string) {
  const db=readyDb(); if(!db) return null
  const rows=await db.select().from(conversations).where(eq(conversations.departmentId,departmentId)).orderBy(desc(conversations.updatedAt)).limit(1)
  if(rows[0]) return rows[0]
  const [created]=await db.insert(conversations).values({departmentId,lead}).returning()
  return created
}

async function writeMessage(departmentId:string, lead:string, role:string, content:string, provider?:string|null, model?:string|null) {
  const db=readyDb(); if(!db) return
  const conversation=await getConversation(departmentId,lead); if(!conversation) return
  await db.insert(messages).values({conversationId:conversation.id,role,content,provider:provider||null,model:model||null})
  await db.update(conversations).set({updatedAt:new Date()}).where(eq(conversations.id,conversation.id))
}

async function getBrainContext(departmentId:string) {
  const db=readyDb(); if(!db) return ''
  const rows=await db.select().from(knowledgeItems).orderBy(desc(knowledgeItems.updatedAt)).limit(50)
  return rows.filter(item=>item.scope==='organization' || item.departmentId===departmentId).slice(0,20).map(item=>`[${item.type}] ${item.title}: ${item.content}`).join('\n')
}

app.get('/api/health', async (_req,res)=>{
  const database = databaseReady ? 'connected' : (process.env.DATABASE_URL ? 'degraded' : 'not-configured')
  res.json({ok:true,service:'agents-command-center',version:'0.7.0',database,databaseError,persistence:databaseReady?'postgres':'memory',model:getModelStatus()})
})
app.get('/api/model/status',(_req,res)=>res.json(getModelStatus()))
app.get('/api/tools/status',(_req,res)=>res.json(getToolStatus()))

app.get('/api/tools/github', async (_req,res)=>{
  try { res.json(await fetchGitHubSnapshot()) }
  catch(error) { res.status(502).json({error:error instanceof Error?error.message:'github_connector_error'}) }
})

app.post('/api/tools/github/sync', async (_req,res)=>{
  const db=readyDb(); if(!db) return res.status(503).json({error:'database_unavailable',mode:'memory'})
  try {
    const snapshot=await fetchGitHubSnapshot()
    const source=`github:${snapshot.repository}`
    const content=[`Repository: ${snapshot.fullName}`,`Description: ${snapshot.description || 'No description'}`,`Visibility: ${snapshot.visibility}`,`Default branch: ${snapshot.defaultBranch}`,`Updated: ${snapshot.updatedAt}`,'Recent commits:',...snapshot.commits.map(c=>`- ${c.sha.slice(0,7)} ${c.message} (${c.author})`)].join('\n')
    const existing=await db.select().from(knowledgeItems).where(eq(knowledgeItems.source,source)).limit(1)
    let item
    if(existing[0]) {
      ;[item]=await db.update(knowledgeItems).set({title:`GitHub repository: ${snapshot.fullName}`,content,updatedAt:new Date()}).where(eq(knowledgeItems.id,existing[0].id)).returning()
    } else {
      ;[item]=await db.insert(knowledgeItems).values({type:'project',title:`GitHub repository: ${snapshot.fullName}`,content,scope:'organization',source}).returning()
    }
    await db.insert(activityLogs).values({actor:'GitHub Connector',action:'tool.synced',targetType:'knowledge',targetId:item.id,detail:snapshot.repository})
    res.json({ok:true,item,snapshot})
  } catch(error) { res.status(502).json({error:error instanceof Error?error.message:'github_sync_error'}) }
})

app.get('/api/runs', async (req,res)=>{
  const db=readyDb(); if(!db) return res.status(503).json({error:'database_unavailable',mode:'memory'})
  let rows=await db.select().from(agentRuns).orderBy(desc(agentRuns.createdAt)).limit(100)
  const department=String(req.query.department||''), agent=String(req.query.agent||'')
  if(department) rows=rows.filter(r=>r.departmentId===department)
  if(agent) rows=rows.filter(r=>r.agentId===agent)
  res.json(rows)
})

app.post('/api/runs', async (req,res)=>{
  const db=readyDb(); if(!db) return res.status(503).json({error:'database_unavailable',mode:'memory'})
  const agentId=String(req.body?.agentId||'').trim(), departmentId=String(req.body?.departmentId||'').trim(), skill=String(req.body?.skill||'').trim()
  const input=String(req.body?.input||'').trim().slice(0,4000), taskId=req.body?.taskId?String(req.body.taskId):null
  if(!agentId||!departmentId||!skill)return res.status(400).json({error:'agent_department_skill_required'})
  const [agent]=await db.select().from(agentsTable).where(eq(agentsTable.id,agentId)).limit(1)
  if(!agent||agent.departmentId!==departmentId)return res.status(404).json({error:'agent_not_found'})
  if(skill!=='github.repo-audit')return res.status(400).json({error:'unsupported_skill'})
  const [run]=await db.insert(agentRuns).values({agentId,departmentId,skill,status:'queued',input:input||null,taskId}).returning()
  await db.update(agentRuns).set({status:'running',startedAt:new Date()}).where(eq(agentRuns.id,run.id))
  await db.insert(activityLogs).values({actor:agent.name,action:'agent.run.started',targetType:'run',targetId:run.id,detail:skill})
  try {
    const snapshot=await fetchGitHubSnapshot()
    const output=[`Repository ${snapshot.fullName} is ${snapshot.visibility} on ${snapshot.defaultBranch}.`,`${snapshot.commits.length} recent commits inspected; ${snapshot.openIssues} open issues reported by GitHub metadata.`,`Latest repository update: ${snapshot.updatedAt}.`,snapshot.commits[0]?`Latest commit: ${snapshot.commits[0].sha.slice(0,7)} ${snapshot.commits[0].message}.`:'No recent commit metadata returned.'].join(' ')
    const source=`skill:github.repo-audit:${snapshot.repository}`
    const existing=await db.select().from(knowledgeItems).where(eq(knowledgeItems.source,source)).limit(1)
    if(existing[0]) await db.update(knowledgeItems).set({title:`Repository audit: ${snapshot.fullName}`,content:output,updatedAt:new Date()}).where(eq(knowledgeItems.id,existing[0].id))
    else await db.insert(knowledgeItems).values({type:'analysis',title:`Repository audit: ${snapshot.fullName}`,content:output,scope:'organization',source})
    if(taskId) await db.update(tasksTable).set({status:'Done',updatedAt:new Date()}).where(eq(tasksTable.id,taskId))
    const [completed]=await db.update(agentRuns).set({status:'completed',output,completedAt:new Date()}).where(eq(agentRuns.id,run.id)).returning()
    await db.insert(activityLogs).values({actor:agent.name,action:'agent.run.completed',targetType:'run',targetId:run.id,detail:skill})
    return res.status(201).json(completed)
  } catch(error) {
    const detail=error instanceof Error?error.message:'skill_execution_failed'
    const [failed]=await db.update(agentRuns).set({status:'failed',output:detail.slice(0,1000),completedAt:new Date()}).where(eq(agentRuns.id,run.id)).returning()
    await db.insert(activityLogs).values({actor:agent.name,action:'agent.run.failed',targetType:'run',targetId:run.id,detail:detail.slice(0,500)})
    return res.status(502).json(failed)
  }
})

app.get('/api/missions', async (_req,res)=>{
  const db=readyDb(); if(!db) return res.status(503).json({error:'database_unavailable',mode:'memory'})
  const [missionRows,taskRows]=await Promise.all([db.select().from(missionsTable).orderBy(desc(missionsTable.createdAt)),db.select().from(tasksTable)])
  res.json(missionRows.map(m=>({...m,departmentIds:JSON.parse(m.departmentIds||'[]'),tasks:taskRows.filter(t=>t.missionId===m.id).map(({createdAt,updatedAt,missionId,...t})=>t)})))
})
app.post('/api/missions', async (req,res)=>{
  const db=readyDb(); if(!db) return res.status(503).json({error:'database_unavailable',mode:'memory'})
  const title=String(req.body?.title||'').trim().slice(0,180), objective=String(req.body?.objective||'').trim().slice(0,4000)
  const requested=Array.isArray(req.body?.departmentIds)?req.body.departmentIds.map(String):[], state=await readState()
  const departmentIds=[...new Set(requested)].filter(id=>state.departments.some(d=>d.id===id))
  if(!title||!objective||!departmentIds.length)return res.status(400).json({error:'title_objective_departments_required'})
  const [mission]=await db.insert(missionsTable).values({title,objective,departmentIds:JSON.stringify(departmentIds)}).returning()
  const workstreams=departmentIds.map(id=>state.departments.find(d=>d.id===id)!).filter(Boolean).map(d=>({id:`t-mission-${mission.id.slice(0,8)}-${d.id}`,title:`${title}: ${d.name} workstream`,department:d.name,status:'Planned',owner:d.lead,priority:'High',missionId:mission.id}))
  if(workstreams.length)await db.insert(tasksTable).values(workstreams)
  await db.insert(activityLogs).values({actor:'Mission Control',action:'mission.created',targetType:'mission',targetId:mission.id,detail:title})
  res.status(201).json({...mission,departmentIds,tasks:workstreams})
})
app.patch('/api/missions/:id', async (req,res)=>{
  const db=readyDb(); if(!db) return res.status(503).json({error:'database_unavailable',mode:'memory'})
  const patch:any={updatedAt:new Date()}
  if(req.body?.status!==undefined){const status=String(req.body.status);if(!['active','paused','completed'].includes(status))return res.status(400).json({error:'invalid_status'});patch.status=status}
  if(req.body?.title!==undefined)patch.title=String(req.body.title).trim().slice(0,180)
  if(req.body?.objective!==undefined)patch.objective=String(req.body.objective).trim().slice(0,4000)
  const [updated]=await db.update(missionsTable).set(patch).where(eq(missionsTable.id,req.params.id)).returning()
  if(!updated)return res.status(404).json({error:'mission_not_found'})
  await db.insert(activityLogs).values({actor:'Mission Control',action:'mission.updated',targetType:'mission',targetId:updated.id,detail:updated.status})
  res.json({...updated,departmentIds:JSON.parse(updated.departmentIds||'[]')})
})

app.get('/api/state', async (_req,res)=>{ try { res.json(await readState()) } catch(error) { res.status(500).json({error:error instanceof Error?error.message:'state_error'}) } })
app.post('/api/tasks', async (req,res)=>{ const task={id:String(req.body?.id || `t-${Date.now()}`),title:String(req.body?.title || 'Untitled task').trim().slice(0,180),department:String(req.body?.department || 'Marketing'),status:String(req.body?.status || 'Inbox'),owner:String(req.body?.owner || 'Unassigned'),priority:String(req.body?.priority || 'Medium')}; const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); await db.insert(tasksTable).values(task); await db.insert(activityLogs).values({actor:'You',action:'task.created',targetType:'task',targetId:task.id,detail:task.title}); res.status(201).json(task) })
app.patch('/api/tasks/:id', async (req,res)=>{ const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); const patch:any={updatedAt:new Date()}; for(const key of ['title','department','status','owner','priority'])if(req.body?.[key]!==undefined)patch[key]=String(req.body[key]); const [updated]=await db.update(tasksTable).set(patch).where(eq(tasksTable.id,req.params.id)).returning(); if(!updated)return res.status(404).json({error:'task_not_found'}); await db.insert(activityLogs).values({actor:'You',action:'task.updated',targetType:'task',targetId:req.params.id,detail:JSON.stringify(patch)}); res.json(updated) })
app.delete('/api/tasks/:id', async (req,res)=>{ const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); const [deleted]=await db.delete(tasksTable).where(eq(tasksTable.id,req.params.id)).returning(); if(!deleted)return res.status(404).json({error:'task_not_found'}); await db.insert(activityLogs).values({actor:'You',action:'task.deleted',targetType:'task',targetId:req.params.id,detail:deleted.title}); res.json({ok:true,id:req.params.id}) })
app.get('/api/approvals', async (_req,res)=>{ const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); res.json(await db.select().from(approvalsTable).orderBy(desc(approvalsTable.createdAt))) })
app.patch('/api/approvals/:id', async (req,res)=>{ const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); const status=String(req.body?.status||''); if(!['approved','rejected','pending'].includes(status))return res.status(400).json({error:'invalid_status'}); const [updated]=await db.update(approvalsTable).set({status,decidedBy:status==='pending'?null:'You',decidedAt:status==='pending'?null:new Date()}).where(eq(approvalsTable.id,req.params.id)).returning(); if(!updated)return res.status(404).json({error:'approval_not_found'}); await db.insert(activityLogs).values({actor:'You',action:`approval.${status}`,targetType:'approval',targetId:req.params.id,detail:updated.title}); res.json(updated) })
app.get('/api/activity', async (_req,res)=>{ const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); res.json(await db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(100)) })

app.get('/api/brain', async (req,res)=>{ const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); let rows=await db.select().from(knowledgeItems).orderBy(desc(knowledgeItems.updatedAt)).limit(250); const department=String(req.query.department||''), type=String(req.query.type||''); if(department)rows=rows.filter(item=>item.scope==='organization'||item.departmentId===department); if(type)rows=rows.filter(item=>item.type===type); res.json(rows) })
app.post('/api/brain', async (req,res)=>{ const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); const title=String(req.body?.title||'').trim().slice(0,180), content=String(req.body?.content||'').trim().slice(0,20000); if(!title||!content)return res.status(400).json({error:'title_and_content_required'}); const item={type:String(req.body?.type||'knowledge').slice(0,60),title,content,scope:String(req.body?.scope||'organization').slice(0,60),departmentId:req.body?.departmentId?String(req.body.departmentId).slice(0,80):null,source:String(req.body?.source||'manual').slice(0,120)}; const [created]=await db.insert(knowledgeItems).values(item).returning(); await db.insert(activityLogs).values({actor:'You',action:'brain.created',targetType:'knowledge',targetId:created.id,detail:created.title}); res.status(201).json(created) })
app.patch('/api/brain/:id', async (req,res)=>{ const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); const patch:any={updatedAt:new Date()}; for(const key of ['type','title','content','scope','source'])if(req.body?.[key]!==undefined)patch[key]=String(req.body[key]); if(req.body?.departmentId!==undefined)patch.departmentId=req.body.departmentId?String(req.body.departmentId):null; const [updated]=await db.update(knowledgeItems).set(patch).where(eq(knowledgeItems.id,req.params.id)).returning(); if(!updated)return res.status(404).json({error:'knowledge_not_found'}); await db.insert(activityLogs).values({actor:'You',action:'brain.updated',targetType:'knowledge',targetId:updated.id,detail:updated.title}); res.json(updated) })
app.delete('/api/brain/:id', async (req,res)=>{ const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); const [deleted]=await db.delete(knowledgeItems).where(eq(knowledgeItems.id,req.params.id)).returning(); if(!deleted)return res.status(404).json({error:'knowledge_not_found'}); await db.insert(activityLogs).values({actor:'You',action:'brain.deleted',targetType:'knowledge',targetId:deleted.id,detail:deleted.title}); res.json({ok:true,id:deleted.id}) })

app.get('/api/chat/history/:department', async (req,res)=>{ const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); const rows=await db.select().from(conversations).where(eq(conversations.departmentId,req.params.department)).orderBy(desc(conversations.updatedAt)).limit(1); if(!rows[0])return res.json([]); res.json(await db.select().from(messages).where(eq(messages.conversationId,rows[0].id)).orderBy(messages.createdAt).limit(200)) })
app.post('/api/chat', async (req,res)=>{
  const state=await readState(), dept=state.departments.find(d=>d.id===req.body?.department), departmentId=dept?.id??String(req.body?.department||'organization'), departmentName=dept?.name??'Organization', lead=dept?.lead??'Command Lead', message=String(req.body?.message||'').trim()
  if(!message)return res.status(400).json({error:'message_required'})
  const lower=message.toLowerCase(), persistence=state.persistence==='postgres'?'Persistence is live.':'Database is temporarily degraded, so I am operating in memory mode.'
  await writeMessage(departmentId,lead,'user',message)
  if(req.body?.delegate===true){ const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); const task={id:`t-delegated-${Date.now()}`,title:message.slice(0,180),department:departmentName,status:'Inbox',owner:lead,priority:'Medium'}; await db.insert(tasksTable).values(task); await db.insert(activityLogs).values({actor:lead,action:'lead.delegated',targetType:'task',targetId:task.id,detail:task.title}); const reply=`${lead}: Delegated. I created a durable Inbox task and assigned ownership to myself for triage.`; await writeMessage(departmentId,lead,'assistant',reply,'orchestrator','durable-delegation'); return res.status(201).json({reply,task,provider:'orchestrator'}) }
  const deptTasks=state.tasks.filter(t=>t.department===departmentName), taskContext=deptTasks.map(t=>`${t.status} | ${t.priority} | ${t.owner} | ${t.title}`).join('\n'), brainContext=await getBrainContext(departmentId)
  try { const routed=await routeModel({lead,department:departmentName,message,context:taskContext,knowledge:brainContext}); if(routed){ await writeMessage(departmentId,lead,'assistant',routed.text,routed.provider,routed.model); return res.json({reply:routed.text,provider:routed.provider,model:routed.model}) } } catch(error) { const db=readyDb(), detail=error instanceof Error?error.message:'model_router_error'; if(db)await db.insert(activityLogs).values({actor:'Model Router',action:'model.failed',targetType:'department',targetId:departmentId,detail:detail.slice(0,500)}); console.error('Model router failed, using deterministic fallback:',detail) }
  let reply=`${lead}: Command received. ${persistence} The model adapter is not configured yet, so I am using deterministic orchestration.`
  if(lower.includes('block')){const blocked=state.tasks.filter(t=>t.status==='Waiting'||t.status==='Approval');reply=`${lead}: ${blocked.length} task${blocked.length===1?' is':'s are'} currently blocked by Waiting or Approval. Persistence mode is ${state.persistence}.`}
  if(lower.includes('summar'))reply=`${lead}: ${deptTasks.length} durable task${deptTasks.length===1?'':'s'} in ${departmentName}, with ${deptTasks.filter(t=>t.status==='Running').length} running and ${deptTasks.filter(t=>t.status==='Approval').length} awaiting approval. Persistence mode is ${state.persistence}.`
  await writeMessage(departmentId,lead,'assistant',reply,'local','deterministic-orchestrator'); res.json({reply,provider:'local',model:'deterministic-orchestrator'})
})

async function boot() {
  try { databaseReady=await ensureSchema(); if(databaseReady){await seedIfNeeded();databaseError=null} } catch(error) { databaseReady=false; databaseError=error instanceof Error?error.message:'database_boot_error'; console.error('Database boot failed, continuing in memory mode:',databaseError) }
  const __dirname=path.dirname(fileURLToPath(import.meta.url)), dist=path.resolve(__dirname,'../dist')
  app.use(express.static(dist)); app.get('/*splat',(_req,res)=>res.sendFile(path.join(dist,'index.html'))); app.listen(port,'0.0.0.0',()=>console.log(`Agents Command Center listening on :${port} | persistence=${databaseReady?'postgres':'memory'} | model=${getModelStatus().configured?'configured':'fallback'}`))
}
boot().catch(error=>{ console.error('Fatal boot failure',error); process.exit(1) })
