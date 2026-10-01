import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = Number(process.env.PORT || 3000)
app.use(express.json())

const departments = [
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
const tasks = [
  {id:'t1',title:'Launch campaign strategy',department:'Marketing',status:'Running',owner:'Maya',priority:'High'},
  {id:'t2',title:'October creative brief',department:'Marketing',status:'Approval',owner:'Pixel',priority:'High'},
  {id:'t3',title:'Competitor intelligence scan',department:'Marketing',status:'Running',owner:'Nova',priority:'Medium'},
  {id:'t4',title:'Keyword opportunity map',department:'Marketing',status:'Planned',owner:'Rank',priority:'Medium'},
  {id:'t5',title:'Social content calendar',department:'Marketing',status:'Waiting',owner:'Echo',priority:'Medium'},
  {id:'t6',title:'Publish campaign assets',department:'Marketing',status:'Inbox',owner:'Quill',priority:'Low'}
]
const tools=[{name:'GitHub',status:'connected'},{name:'Google Drive',status:'connected'},{name:'Gmail',status:'connected'},{name:'Railway',status:'ready'},{name:'Browser',status:'ready'},{name:'Figma',status:'offline'}]

app.get('/api/health', (_req,res)=>res.json({ok:true,service:'agents-command-center',version:'0.1.0'}))
app.get('/api/state', (_req,res)=>res.json({departments,tasks,approvals:3,tools}))
app.post('/api/chat',(req,res)=>{
  const dept=departments.find(d=>d.id===req.body?.department)
  const lead=dept?.lead ?? 'Command Lead'
  const message=String(req.body?.message || '')
  const lower=message.toLowerCase()
  let reply=`${lead}: Command received. I can turn this into tasks and delegate it once a model adapter and persistence layer are connected.`
  if(lower.includes('block')) reply=`${lead}: Two blockers are visible in the MVP state: Pixel is waiting for campaign approval, and Echo is waiting for the asset handoff.`
  if(lower.includes('summar')) reply=`${lead}: Marketing has 2 tasks running, 1 waiting, 1 awaiting approval, 1 planned, and 1 in inbox. Research and SEO are active now.`
  res.json({reply})
})

const __dirname=path.dirname(fileURLToPath(import.meta.url))
const dist=path.resolve(__dirname,'../dist')
app.use(express.static(dist))
app.get('/*splat',(_req,res)=>res.sendFile(path.join(dist,'index.html')))

app.listen(port,'0.0.0.0',()=>console.log(`Agents Command Center listening on :${port}`))
