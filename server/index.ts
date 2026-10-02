import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  activityLogs, agentRuns, agentSkillAssignments, agents as agentsTable, approvals as approvalsTable, conversations,
  departments as departmentsTable, ensureSchema, getDb, knowledgeItems, messages, missions as missionsTable, skillDefinitions,
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

const seedSkills = [
  {agentId:'e1',slot:'primary',skillKey:'github.repo-audit',version:1,label:'Repository Audit',tool:'GitHub',status:'ready',executable:true,approvalRequired:false,permissions:['github.read','brain.write:analysis']},
  {agentId:'o1',slot:'primary',skillKey:'operations.release-gate',version:1,label:'Production Release Gate',tool:'GitHub + Command Center',status:'ready',executable:true,approvalRequired:false,permissions:['github.read','workspace.read','approvals.read','brain.write:analysis']},
  {agentId:'m1',slot:'primary',skillKey:'lead.durable-delegation',version:1,label:'Durable Delegation',tool:'Command Center',status:'ready',executable:false,approvalRequired:false,permissions:['task.create','agent.delegate']},
  {agentId:'m2',slot:'primary',skillKey:'marketing.market-research',version:1,label:'Market Research',tool:'Browser',status:'planned',executable:false,approvalRequired:false,permissions:['browser.read','brain.write:analysis']},
  {agentId:'m3',slot:'primary',skillKey:'marketing.creative-brief',version:1,label:'Creative Brief',tool:'Brain',status:'planned',executable:false,approvalRequired:true,permissions:['brain.read','brain.write:draft']},
  {agentId:'m4',slot:'primary',skillKey:'marketing.copy-draft',version:1,label:'Campaign Copy Draft',tool:'Brain',status:'planned',executable:false,approvalRequired:true,permissions:['brain.read','brain.write:draft']},
  {agentId:'m5',slot:'primary',skillKey:'marketing.social-calendar',version:1,label:'Social Calendar',tool:'Brain',status:'planned',executable:false,approvalRequired:true,permissions:['brain.read','brain.write:draft']},
  {agentId:'m6',slot:'primary',skillKey:'marketing.seo-map',version:1,label:'SEO Opportunity Map',tool:'Browser',status:'planned',executable:false,approvalRequired:false,permissions:['browser.read','brain.write:analysis']},
  {agentId:'m7',slot:'primary',skillKey:'marketing.performance-summary',version:1,label:'Performance Summary',tool:'Analytics',status:'planned',executable:false,approvalRequired:false,permissions:['analytics.read','brain.write:analysis']},
  {agentId:'s1',slot:'primary',skillKey:'sales.pipeline-review',version:1,label:'Pipeline Review',tool:'CRM',status:'planned',executable:false,approvalRequired:false,permissions:['crm.read','brain.write:analysis']},
  {agentId:'f1',slot:'primary',skillKey:'finance.cashflow-brief',version:1,label:'Cashflow Brief',tool:'Finance Data',status:'planned',executable:false,approvalRequired:true,permissions:['finance.read','brain.write:analysis']},
  {agentId:'c1',slot:'primary',skillKey:'support.inbox-triage',version:1,label:'Inbox Triage',tool:'Gmail',status:'planned',executable:false,approvalRequired:true,permissions:['gmail.read','task.create']}
]

const knownSkillExecutors = new Set(['github.repo-audit','operations.release-gate'])
const parseJsonArray = (value:string|null|undefined) => { try { const v=JSON.parse(value||'[]'); return Array.isArray(v)?v:[] } catch { return [] } }
const skillDefinitionDto = (row:any) => ({...row,permissions:parseJsonArray(row.permissions),engineAvailable:knownSkillExecutors.has(row.skillKey)})

async function seedSkillsIfNeeded() {
  const db=readyDb(); if(!db) return
  const definitions=await db.select().from(skillDefinitions)
  for(const seed of seedSkills){
    let definition=definitions.find(d=>d.skillKey===seed.skillKey&&d.version===seed.version)
    if(!definition){
      ;[definition]=await db.insert(skillDefinitions).values({skillKey:seed.skillKey,version:seed.version,label:seed.label,tool:seed.tool,status:seed.status,executable:seed.executable,approvalRequired:seed.approvalRequired,permissions:JSON.stringify(seed.permissions)}).returning()
      definitions.push(definition)
    }
    const active=await db.select().from(agentSkillAssignments).where(and(eq(agentSkillAssignments.agentId,seed.agentId),eq(agentSkillAssignments.slot,seed.slot),isNull(agentSkillAssignments.replacedAt))).limit(1)
    if(!active[0]) await db.insert(agentSkillAssignments).values({agentId:seed.agentId,slot:seed.slot,skillDefinitionId:definition.id,enabled:true})
  }
}

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

async function upsertBrainSource(type:string,title:string,content:string,source:string) {
  const db=readyDb(); if(!db) return null
  const existing=await db.select().from(knowledgeItems).where(eq(knowledgeItems.source,source)).limit(1)
  if(existing[0]) {
    const [updated]=await db.update(knowledgeItems).set({type,title,content,updatedAt:new Date()}).where(eq(knowledgeItems.id,existing[0].id)).returning()
    return updated
  }
  const [created]=await db.insert(knowledgeItems).values({type,title,content,scope:'organization',source}).returning()
  return created
}

async function reconcileMission(missionId:string) {
  const db=readyDb(); if(!db) return
  const linked=await db.select().from(tasksTable).where(eq(tasksTable.missionId,missionId))
  if(linked.length && linked.every(task=>task.status==='Done')) {
    const [mission]=await db.update(missionsTable).set({status:'completed',updatedAt:new Date()}).where(eq(missionsTable.id,missionId)).returning()
    if(mission) await db.insert(activityLogs).values({actor:'Mission Control',action:'mission.completed',targetType:'mission',targetId:missionId,detail:mission.title})
  }
}

async function completeLinkedTask(taskId:string|null) {
  if(!taskId) return
  const db=readyDb(); if(!db) return
  const [task]=await db.update(tasksTable).set({status:'Done',updatedAt:new Date()}).where(eq(tasksTable.id,taskId)).returning()
  if(task?.missionId) await reconcileMission(task.missionId)
}

async function getAgentProfile(agentId:string) {
  const db=readyDb(); if(!db) return null
  const [agent]=await db.select().from(agentsTable).where(eq(agentsTable.id,agentId)).limit(1)
  if(!agent) return null
  const [department]=await db.select().from(departmentsTable).where(eq(departmentsTable.id,agent.departmentId)).limit(1)
  const [assignments,definitions,runs,taskRows,brainRows]=await Promise.all([
    db.select().from(agentSkillAssignments).where(and(eq(agentSkillAssignments.agentId,agent.id),isNull(agentSkillAssignments.replacedAt))).orderBy(agentSkillAssignments.assignedAt),
    db.select().from(skillDefinitions),
    db.select().from(agentRuns).where(eq(agentRuns.agentId,agent.id)).orderBy(desc(agentRuns.createdAt)).limit(20),
    db.select().from(tasksTable),
    db.select().from(knowledgeItems).orderBy(desc(knowledgeItems.updatedAt)).limit(250)
  ])
  const skills=assignments.map(a=>{
    const d=definitions.find(x=>x.id===a.skillDefinitionId)
    return d?{assignmentId:a.id,slot:a.slot,enabled:a.enabled,assignedAt:a.assignedAt,...skillDefinitionDto(d)}:null
  }).filter(Boolean)
  const lead=department?.lead===agent.name
  const permissions=lead?['brain.read','task.create','task.update','approval.request','agent.delegate']:['brain.read:scope','task.update:own','tool.execute:assigned']
  const skillPermissions=[...new Set(skills.flatMap((skill:any)=>skill.permissions||[]))]
  const currentTasks=taskRows.filter(task=>task.owner===agent.name&&task.status!=='Done').slice(0,12)
  const accessibleBrain=brainRows.filter(item=>item.scope==='organization'||item.departmentId===agent.departmentId)
  return {agent,department,capabilities:{lead,skills,tools:[...new Set(skills.map((skill:any)=>skill.tool))],permissions:[...new Set([...permissions,...skillPermissions])],memoryScope:lead?'organization + department':'department scoped'},currentTasks,recentRuns:runs,brain:{accessibleItems:accessibleBrain.length,scope:lead?'organization + department':'department scoped'}}
}

async function resolveSkillDefinition(input:any) {
  const db=readyDb(); if(!db) return null
  if(input?.skillDefinitionId){
    const [existing]=await db.select().from(skillDefinitions).where(eq(skillDefinitions.id,String(input.skillDefinitionId))).limit(1)
    return existing||null
  }
  const skillKey=String(input?.skillKey||'').trim().slice(0,120)
  const label=String(input?.label||'').trim().slice(0,180)
  if(!skillKey||!label) return null
  const existing=await db.select().from(skillDefinitions).where(eq(skillDefinitions.skillKey,skillKey)).orderBy(desc(skillDefinitions.version))
  const requested=Number(input?.version)
  const version=Number.isInteger(requested)&&requested>0?requested:(existing[0]?.version||0)+1
  const same=existing.find(row=>row.version===version)
  if(same) return same
  const status=['draft','planned','ready','deprecated'].includes(String(input?.status))?String(input.status):'draft'
  const permissions=Array.isArray(input?.permissions)?input.permissions.map(String).slice(0,50):[]
  const [created]=await db.insert(skillDefinitions).values({
    skillKey,version,label,description:input?.description?String(input.description).slice(0,2000):null,
    tool:String(input?.tool||'Brain').slice(0,180),status,executable:Boolean(input?.executable),approvalRequired:Boolean(input?.approvalRequired),
    permissions:JSON.stringify(permissions),inputSchema:JSON.stringify(input?.inputSchema&&typeof input.inputSchema==='object'?input.inputSchema:{}),outputSchema:JSON.stringify(input?.outputSchema&&typeof input.outputSchema==='object'?input.outputSchema:{})
  }).returning()
  return created
}

app.get('/api/health', async (_req,res)=>{
  const database = databaseReady ? 'connected' : (process.env.DATABASE_URL ? 'degraded' : 'not-configured')
  res.json({ok:true,service:'agents-command-center',version:'0.9.0',database,databaseError,persistence:databaseReady?'postgres':'memory',model:getModelStatus()})
})
app.get('/api/model/status',(_req,res)=>res.json(getModelStatus()))
app.get('/api/tools/status',(_req,res)=>res.json(getToolStatus()))

app.get('/api/skills',async (_req,res)=>{
  const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'})
  const [assignments,definitions,agentRows,departmentRows]=await Promise.all([db.select().from(agentSkillAssignments).where(isNull(agentSkillAssignments.replacedAt)),db.select().from(skillDefinitions),db.select().from(agentsTable),db.select().from(departmentsTable)])
  res.json(assignments.map(a=>{const d=definitions.find(x=>x.id===a.skillDefinitionId),agent=agentRows.find(x=>x.id===a.agentId),department=departmentRows.find(x=>x.id===agent?.departmentId);return d?{assignmentId:a.id,slot:a.slot,enabled:a.enabled,agentId:a.agentId,agent:agent?.name||a.agentId,departmentId:department?.id||agent?.departmentId,...skillDefinitionDto(d)}:null}).filter(Boolean))
})
app.get('/api/skills/library',async (_req,res)=>{
  const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'})
  res.json((await db.select().from(skillDefinitions).orderBy(desc(skillDefinitions.createdAt))).map(skillDefinitionDto))
})
app.post('/api/skills/library',async (req,res)=>{
  const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'})
  const definition=await resolveSkillDefinition(req.body)
  if(!definition)return res.status(400).json({error:'skill_key_and_label_required'})
  await db.insert(activityLogs).values({actor:'You',action:'skill.definition.created',targetType:'skill',targetId:definition.id,detail:`${definition.skillKey}@v${definition.version}`})
  res.status(201).json(skillDefinitionDto(definition))
})
app.get('/api/agents/:id',async (req,res)=>{
  const profile=await getAgentProfile(req.params.id)
  if(!profile)return res.status(404).json({error:'agent_not_found'})
  res.json(profile)
})
app.post('/api/agents/:id/skills/:slot/replace',async (req,res)=>{
  const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'})
  const [agent]=await db.select().from(agentsTable).where(eq(agentsTable.id,req.params.id)).limit(1)
  if(!agent)return res.status(404).json({error:'agent_not_found'})
  const slot=String(req.params.slot||'primary').trim().slice(0,80)||'primary'
  const definition=await resolveSkillDefinition(req.body)
  if(!definition)return res.status(400).json({error:'skill_definition_required'})
  const [previous]=await db.select().from(agentSkillAssignments).where(and(eq(agentSkillAssignments.agentId,agent.id),eq(agentSkillAssignments.slot,slot),isNull(agentSkillAssignments.replacedAt))).limit(1)
  if(previous)await db.update(agentSkillAssignments).set({enabled:false,replacedAt:new Date()}).where(eq(agentSkillAssignments.id,previous.id))
  const [assignment]=await db.insert(agentSkillAssignments).values({agentId:agent.id,slot,skillDefinitionId:definition.id,enabled:req.body?.enabled!==false}).returning()
  await db.insert(activityLogs).values({actor:'You',action:previous?'skill.replaced':'skill.assigned',targetType:'agent_skill',targetId:assignment.id,detail:`${agent.name}:${slot} -> ${definition.skillKey}@v${definition.version}`})
  res.status(201).json(await getAgentProfile(agent.id))
})
app.patch('/api/agent-skills/:id',async (req,res)=>{
  const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'})
  if(typeof req.body?.enabled!=='boolean')return res.status(400).json({error:'enabled_boolean_required'})
  const [updated]=await db.update(agentSkillAssignments).set({enabled:req.body.enabled}).where(and(eq(agentSkillAssignments.id,req.params.id),isNull(agentSkillAssignments.replacedAt))).returning()
  if(!updated)return res.status(404).json({error:'active_assignment_not_found'})
  await db.insert(activityLogs).values({actor:'You',action:req.body.enabled?'skill.enabled':'skill.disabled',targetType:'agent_skill',targetId:updated.id,detail:`${updated.agentId}:${updated.slot}`})
  res.json(updated)
})

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
  const [activeAssignments,definitions]=await Promise.all([
    db.select().from(agentSkillAssignments).where(and(eq(agentSkillAssignments.agentId,agentId),isNull(agentSkillAssignments.replacedAt))),
    db.select().from(skillDefinitions)
  ])
  const matched=activeAssignments.map(a=>({assignment:a,definition:definitions.find(d=>d.id===a.skillDefinitionId)})).find(x=>x.definition?.skillKey===skill)
  if(!matched?.definition)return res.status(403).json({error:'skill_not_assigned'})
  if(!matched.assignment.enabled)return res.status(409).json({error:'skill_disabled'})
  if(matched.definition.status!=='ready'||!matched.definition.executable)return res.status(409).json({error:'skill_not_executable',status:matched.definition.status})
  if(matched.definition.approvalRequired)return res.status(409).json({error:'skill_requires_approval'})
  if(!knownSkillExecutors.has(skill))return res.status(400).json({error:'executor_not_available'})
  const [run]=await db.insert(agentRuns).values({agentId,departmentId,skill,skillVersion:matched.definition.version,skillDefinitionId:matched.definition.id,skillAssignmentId:matched.assignment.id,status:'queued',input:input||null,taskId}).returning()
  await db.update(agentRuns).set({status:'running',startedAt:new Date()}).where(eq(agentRuns.id,run.id))
  await db.insert(activityLogs).values({actor:agent.name,action:'agent.run.started',targetType:'run',targetId:run.id,detail:skill})
  try {
    let output=''
    if(skill==='github.repo-audit') {
      const snapshot=await fetchGitHubSnapshot()
      output=[`Repository ${snapshot.fullName} is ${snapshot.visibility} on ${snapshot.defaultBranch}.`,`${snapshot.commits.length} recent commits inspected; ${snapshot.openIssues} open issues reported by GitHub metadata.`,`Latest repository update: ${snapshot.updatedAt}.`,snapshot.commits[0]?`Latest commit: ${snapshot.commits[0].sha.slice(0,7)} ${snapshot.commits[0].message}.`:'No recent commit metadata returned.'].join(' ')
      await upsertBrainSource('analysis',`Repository audit: ${snapshot.fullName}`,output,`skill:github.repo-audit:${snapshot.repository}`)
    } else {
      const [snapshot,state,approvalRows]=await Promise.all([fetchGitHubSnapshot(),readState(),db.select().from(approvalsTable)])
      const pending=approvalRows.filter(a=>a.status==='pending').length
      const blocked=state.tasks.filter(t=>t.status==='Waiting'||t.status==='Approval').length
      const model=getModelStatus()
      output=[`Release gate checked: PostgreSQL persistence is ${state.persistence}; GitHub repository ${snapshot.fullName} is reachable on ${snapshot.defaultBranch}.`,`${pending} pending approvals and ${blocked} blocked tasks remain as human-control warnings.`,`Model router is ${model.configured?'configured':'not configured'} for ${model.model}; deterministic orchestration remains available.`].join(' ')
      await upsertBrainSource('analysis','Production release gate',output,'skill:operations.release-gate:production')
    }
    await completeLinkedTask(taskId)
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
app.patch('/api/tasks/:id', async (req,res)=>{ const db=readyDb(); if(!db)return res.status(503).json({error:'database_unavailable',mode:'memory'}); const patch:any={updatedAt:new Date()}; for(const key of ['title','department','status','owner','priority'])if(req.body?.[key]!==undefined)patch[key]=String(req.body[key]); const [updated]=await db.update(tasksTable).set(patch).where(eq(tasksTable.id,req.params.id)).returning(); if(!updated)return res.status(404).json({error:'task_not_found'}); if(updated.missionId&&updated.status==='Done')await reconcileMission(updated.missionId); await db.insert(activityLogs).values({actor:'You',action:'task.updated',targetType:'task',targetId:req.params.id,detail:JSON.stringify(patch)}); res.json(updated) })
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
  try { databaseReady=await ensureSchema(); if(databaseReady){await seedIfNeeded();await seedSkillsIfNeeded();databaseError=null} } catch(error) { databaseReady=false; databaseError=error instanceof Error?error.message:'database_boot_error'; console.error('Database boot failed, continuing in memory mode:',databaseError) }
  const __dirname=path.dirname(fileURLToPath(import.meta.url)), dist=path.resolve(__dirname,'../dist')
  app.use(express.static(dist)); app.get('/*splat',(_req,res)=>res.sendFile(path.join(dist,'index.html'))); app.listen(port,'0.0.0.0',()=>console.log(`Agents Command Center listening on :${port} | persistence=${databaseReady?'postgres':'memory'} | model=${getModelStatus().configured?'configured':'fallback'}`))
}
boot().catch(error=>{ console.error('Fatal boot failure',error); process.exit(1) })
