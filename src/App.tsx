import { useEffect, useMemo, useState } from 'react'
import {
  Activity, Brain, CheckCircle2, ChevronRight, CircleDot, Clock3, Command,
  GitBranch, Inbox, LayoutDashboard, ListPlus, MessageSquareText, Network, RefreshCw,
  Search, Send, Settings, ShieldCheck, Sparkles, Trash2, Users, Wrench, X
} from 'lucide-react'
import './p03.css'

type Agent = { id:string; name:string; role:string; status:'working'|'idle'|'waiting'|'approval'|'failed'; task?:string|null }
type Department = { id:string; name:string; accent:string; agents:Agent[]; lead:string }
type Task = { id:string; title:string; department:string; status:string; owner:string; priority:string }
type Approval = { id:string; title:string; status:string; requestedBy:string; decidedBy?:string|null; createdAt?:string; decidedAt?:string|null }
type ActivityItem = { id:string; actor:string; action:string; targetType:string; targetId:string; detail?:string|null; createdAt?:string }
type State = { departments:Department[]; tasks:Task[]; approvals:number; tools:{name:string;status:string}[]; persistence?:string }
type View = 'department'|'hq'|'approvals'|'activity'

const fallback: State = {
  departments: [
    {id:'marketing',name:'Marketing',accent:'#ef5a8c',lead:'Maya',agents:[
      {id:'m1',name:'Maya',role:'Marketing Lead',status:'working',task:'Launch campaign plan'},
      {id:'m2',name:'Nova',role:'Research',status:'working',task:'Competitor scan'},
      {id:'m3',name:'Pixel',role:'Creative Brief',status:'approval',task:'October campaign'},
      {id:'m4',name:'Quill',role:'Copywriter',status:'idle'},
      {id:'m5',name:'Echo',role:'Social',status:'waiting',task:'Asset handoff'},
      {id:'m6',name:'Rank',role:'SEO',status:'working',task:'Keyword map'},
      {id:'m7',name:'Pulse',role:'Analytics',status:'idle'}]},
    {id:'sales',name:'Sales',accent:'#d6bb55',lead:'Atlas',agents:[
      {id:'s1',name:'Atlas',role:'Sales Lead',status:'working',task:'Pipeline review'},
      {id:'s2',name:'Scout',role:'Prospecting',status:'working',task:'Lead enrichment'},
      {id:'s3',name:'Iris',role:'CRM',status:'idle'},{id:'s4',name:'Closer',role:'Proposal',status:'waiting',task:'Pricing'}]},
    {id:'operations',name:'Operations',accent:'#9a6cff',lead:'Orion',agents:[
      {id:'o1',name:'Orion',role:'Ops Lead',status:'working',task:'SOP audit'},
      {id:'o2',name:'Relay',role:'Workflow',status:'idle'},{id:'o3',name:'Gauge',role:'QA',status:'working',task:'Checklist'}]},
    {id:'finance',name:'Finance',accent:'#4378ff',lead:'Ledger',agents:[
      {id:'f1',name:'Ledger',role:'Finance Lead',status:'working',task:'Cashflow brief'},
      {id:'f2',name:'Mint',role:'Billing',status:'idle'},{id:'f3',name:'Audit',role:'Reconciliation',status:'approval',task:'Vendor payment'}]},
    {id:'engineering',name:'Engineering',accent:'#39c6a3',lead:'Forge',agents:[
      {id:'e1',name:'Forge',role:'Engineering Lead',status:'working',task:'MVP build'},
      {id:'e2',name:'Patch',role:'Frontend',status:'working',task:'HQ UI'},
      {id:'e3',name:'Rail',role:'DevOps',status:'idle'},{id:'e4',name:'Schema',role:'Backend',status:'working',task:'Task API'}]},
    {id:'support',name:'Customer',accent:'#4cc2ff',lead:'Harbor',agents:[
      {id:'c1',name:'Harbor',role:'Support Lead',status:'waiting',task:'Inbox triage'},
      {id:'c2',name:'Lumen',role:'Support',status:'idle'},{id:'c3',name:'Signal',role:'Success',status:'working',task:'Health scores'}]}
  ],
  tasks:[
    {id:'t1',title:'Launch campaign strategy',department:'Marketing',status:'Running',owner:'Maya',priority:'High'},
    {id:'t2',title:'October creative brief',department:'Marketing',status:'Approval',owner:'Pixel',priority:'High'},
    {id:'t3',title:'Competitor intelligence scan',department:'Marketing',status:'Running',owner:'Nova',priority:'Medium'},
    {id:'t4',title:'Keyword opportunity map',department:'Marketing',status:'Planned',owner:'Rank',priority:'Medium'},
    {id:'t5',title:'Social content calendar',department:'Marketing',status:'Waiting',owner:'Echo',priority:'Medium'},
    {id:'t6',title:'Publish campaign assets',department:'Marketing',status:'Inbox',owner:'Quill',priority:'Low'}
  ],
  approvals:3,
  tools:[{name:'GitHub',status:'connected'},{name:'Google Drive',status:'connected'},{name:'Gmail',status:'connected'},{name:'Railway',status:'ready'},{name:'Browser',status:'ready'},{name:'Figma',status:'offline'}],
  persistence:'memory'
}

const lanes = ['Inbox','Planned','Running','Waiting','Approval','Done']
const priorities = ['Low','Medium','High']
const statusClass = (status:string) => `status status-${status}`
const jsonHeaders = {'content-type':'application/json'}

export default function App(){
  const [state,setState]=useState<State>(fallback)
  const [selected,setSelected]=useState('marketing')
  const [prompt,setPrompt]=useState('')
  const [messages,setMessages]=useState([{from:'lead',text:'Marketing command channel online. I am coordinating the team and will surface anything that needs your approval.'}])
  const [view,setView]=useState<View>('department')
  const [approvals,setApprovals]=useState<Approval[]>([])
  const [activity,setActivity]=useState<ActivityItem[]>([])
  const [busy,setBusy]=useState(false)
  const [taskEditor,setTaskEditor]=useState<Task|null>(null)
  const [newTaskOpen,setNewTaskOpen]=useState(false)
  const [lastSync,setLastSync]=useState<Date|null>(null)

  const dept=state.departments.find(d=>d.id===selected) || state.departments[0]
  const active=state.departments.flatMap(d=>d.agents).filter(a=>a.status==='working').length
  const total=state.departments.reduce((n,d)=>n+d.agents.length,0)
  const deptTasks=state.tasks.filter(t=>t.department===dept?.name)
  const pendingApprovals=approvals.filter(a=>a.status==='pending')

  const refresh=async()=>{
    try{
      const [stateRes,approvalRes,activityRes]=await Promise.all([
        fetch('/api/state'),fetch('/api/approvals'),fetch('/api/activity')
      ])
      if(stateRes.ok) setState(await stateRes.json())
      if(approvalRes.ok) setApprovals(await approvalRes.json())
      if(activityRes.ok) setActivity(await activityRes.json())
      setLastSync(new Date())
    }catch{}
  }

  useEffect(()=>{
    refresh()
    const timer=window.setInterval(refresh,5000)
    return()=>window.clearInterval(timer)
  },[])

  useEffect(()=>{
    const next=state.departments.find(d=>d.id===selected)
    if(next) setMessages([{from:'lead',text:`${next.name} command channel online. I am coordinating ${next.agents.length} agents and durable work is connected to PostgreSQL.`}])
  },[selected])

  const send=async(delegate=false)=>{
    if(!prompt.trim() || !dept) return
    const text=prompt.trim(); setPrompt('')
    setMessages(m=>[...m,{from:'user',text}])
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:jsonHeaders,body:JSON.stringify({department:dept.id,message:text,delegate})})
      const data=await r.json()
      setMessages(m=>[...m,{from:'lead',text:data.reply || 'Command received.'}])
      if(delegate) await refresh()
    }catch{
      setMessages(m=>[...m,{from:'lead',text:'Command received, but the operation API is temporarily unavailable.'}])
    }
  }

  const patchTask=async(task:Task,patch:Partial<Task>)=>{
    setBusy(true)
    try{
      const r=await fetch(`/api/tasks/${task.id}`,{method:'PATCH',headers:jsonHeaders,body:JSON.stringify(patch)})
      if(!r.ok) throw new Error('task_update_failed')
      await refresh()
      if(taskEditor?.id===task.id) setTaskEditor({...taskEditor,...patch})
    }finally{setBusy(false)}
  }

  const createTask=async(task:Omit<Task,'id'>)=>{
    setBusy(true)
    try{
      const r=await fetch('/api/tasks',{method:'POST',headers:jsonHeaders,body:JSON.stringify(task)})
      if(!r.ok) throw new Error('task_create_failed')
      setNewTaskOpen(false)
      await refresh()
    }finally{setBusy(false)}
  }

  const deleteTask=async(task:Task)=>{
    setBusy(true)
    try{
      const r=await fetch(`/api/tasks/${task.id}`,{method:'DELETE'})
      if(!r.ok) throw new Error('task_delete_failed')
      setTaskEditor(null)
      await refresh()
    }finally{setBusy(false)}
  }

  const decideApproval=async(id:string,status:'approved'|'rejected'|'pending')=>{
    setBusy(true)
    try{
      const r=await fetch(`/api/approvals/${id}`,{method:'PATCH',headers:jsonHeaders,body:JSON.stringify({status})})
      if(!r.ok) throw new Error('approval_update_failed')
      await refresh()
    }finally{setBusy(false)}
  }

  const title=view==='hq'?'Headquarters':view==='approvals'?'Approval Inbox':view==='activity'?'Activity Log':`${dept?.name ?? 'Department'} Department`
  const subtitle=view==='hq'?'Organization command view':view==='approvals'?'Human control point for sensitive work':view==='activity'?'Auditable execution history':`${dept?.agents.length ?? 0} agents coordinated by ${dept?.lead ?? 'Lead'}`

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandmark"><Command size={18}/></div><div><strong>Agents</strong><span>Command Center</span></div></div>
      <nav>
        <button className={view==='hq'?'active':''} onClick={()=>setView('hq')}><LayoutDashboard/>HQ Overview</button>
        <button className={view==='department'?'active':''} onClick={()=>setView('department')}><Network/>Departments</button>
        <button><GitBranch/>Missions</button><button><Brain/>Brain</button>
        <button className={view==='approvals'?'active':''} onClick={()=>setView('approvals')}><ShieldCheck/>Approvals <em>{state.approvals}</em></button>
        <button><Wrench/>Tools</button>
        <button className={view==='activity'?'active':''} onClick={()=>setView('activity')}><Activity/>Activity</button>
      </nav>
      <div className="sidebar-bottom"><button><Settings/>Settings</button><div className="system-live"><i/> System live <span>v0.3</span></div></div>
    </aside>

    <main>
      <header className="topbar">
        <div><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="top-actions">
          <div className={`persistence-chip ${state.persistence==='postgres'?'ok':'warn'}`}>{state.persistence==='postgres'?'POSTGRES LIVE':'MEMORY MODE'}</div>
          <button className="sync-btn" onClick={refresh} title={lastSync?`Last sync ${lastSync.toLocaleTimeString()}`:'Refresh'}><RefreshCw size={14}/></button>
          <div className="search"><Search size={15}/>Search command center</div>
          <button className="approval-btn" onClick={()=>setView('approvals')}><ShieldCheck size={15}/>{state.approvals} approvals</button>
          <div className="avatar">A</div>
        </div>
      </header>

      {view==='hq' && <HQ state={state} onOpen={(id)=>{setSelected(id);setView('department')}} onApprovals={()=>setView('approvals')}/>} 
      {view==='approvals' && <ApprovalsView approvals={approvals} busy={busy} onDecision={decideApproval}/>} 
      {view==='activity' && <ActivityView activity={activity}/>} 
      {view==='department' && dept && <>
        <section className="metrics-strip">
          <div><span>Total agents</span><strong>{total}</strong><small><Users/> across {state.departments.length} departments</small></div>
          <div><span>Working now</span><strong>{active}</strong><small className="good"><CircleDot/> live execution</small></div>
          <div><span>Waiting approval</span><strong>{state.approvals}</strong><small className="warn"><Clock3/> needs attention</small></div>
          <div><span>Durable tasks</span><strong>{state.tasks.length}</strong><small><Inbox/> PostgreSQL backed</small></div>
        </section>

        <section className="command-grid">
          <div className="panel chat-panel">
            <div className="panel-head"><div><span className="eyebrow">LEAD CHANNEL</span><h3>{dept.lead} <small>• {dept.name} Lead</small></h3></div><i className="online-dot"/></div>
            <div className="messages">{messages.map((m,i)=><div key={i} className={`message ${m.from}`}><span>{m.from==='lead'?dept.lead:'You'}</span><p>{m.text}</p></div>)}</div>
            <div className="quick-prompts"><button onClick={()=>setPrompt('What is blocking the team?')}>What is blocking us?</button><button onClick={()=>setPrompt('Summarize current work')}>Summarize work</button></div>
            <div className="composer"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(false)}}} placeholder={`Message ${dept.lead}...`}/><div className="composer-actions"><button className="delegate-btn" onClick={()=>send(true)} title="Delegate as durable task"><ListPlus size={15}/></button><button onClick={()=>send(false)} title="Send"><Send size={15}/></button></div></div>
          </div>

          <div className="panel floor-panel">
            <div className="panel-head"><div><span className="eyebrow">LIVE AGENT FLOOR</span><h3>{dept.name} team</h3></div><span className="live-pill">● LIVE</span></div>
            <div className="floor" style={{'--accent':dept.accent} as any}>
              <div className="floor-network"/>
              {dept.agents.map((a,i)=><div className={`agent agent-${i}`} key={a.id}>
                <div className="desk"><div className="screen"/><div className="person">{a.name[0]}</div></div>
                <div className="agent-label"><b>{a.name}</b><span>{a.role}</span><i className={statusClass(a.status)}/></div>
              </div>)}
              <div className="brain-node"><Brain/><span>TEAM<br/>BRAIN</span></div>
            </div>
            <div className="agent-legend">{['working','idle','waiting','approval'].map(s=><span key={s}><i className={statusClass(s)}/>{s}</span>)}</div>
          </div>

          <div className="panel work-panel">
            <div className="panel-head"><div><span className="eyebrow">LIVE WORKBOARD</span><h3>Department tasks</h3></div><button className="icon-btn" onClick={()=>setNewTaskOpen(true)}>+</button></div>
            <div className="lanes">{lanes.map(lane=><div className="lane" key={lane}><div className="lane-title"><span>{lane}</span><b>{deptTasks.filter(t=>t.status===lane).length}</b></div>{deptTasks.filter(t=>t.status===lane).map(t=><div className="task-card clickable" key={t.id} onClick={()=>setTaskEditor(t)}><div className="task-meta"><span>{t.priority}</span><small>{t.department}</small></div><h4>{t.title}</h4><div className="task-owner"><div>{t.owner[0] ?? '?'}</div>{t.owner}<select value={t.status} onClick={e=>e.stopPropagation()} onChange={e=>{e.stopPropagation();patchTask(t,{status:e.target.value})}} disabled={busy}>{lanes.map(s=><option key={s}>{s}</option>)}</select></div></div>)}</div>)}</div>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="panel departments-mini"><div className="panel-head"><div><span className="eyebrow">ORGANIZATION</span><h3>Departments</h3></div></div><div className="dept-row">{state.departments.map(d=><button key={d.id} className={selected===d.id?'selected':''} onClick={()=>setSelected(d.id)} style={{'--accent':d.accent} as any}><i/><div><b>{d.name}</b><span>{d.agents.filter(a=>a.status==='working').length} working · {d.agents.length} agents</span></div></button>)}</div></div>
          <div className="panel tool-panel"><div className="panel-head"><div><span className="eyebrow">EXECUTION LAYER</span><h3>Connected tools</h3></div></div><div className="tools">{state.tools.map(t=><div key={t.name}><div className="tool-icon">{t.name.slice(0,2).toUpperCase()}</div><span>{t.name}</span><i className={t.status==='offline'?'off':''}/></div>)}</div></div>
        </section>
      </>}
    </main>

    {newTaskOpen && dept && <NewTaskModal dept={dept} busy={busy} onClose={()=>setNewTaskOpen(false)} onCreate={createTask}/>} 
    {taskEditor && <TaskModal task={taskEditor} departments={state.departments} busy={busy} onClose={()=>setTaskEditor(null)} onSave={async next=>{await patchTask(taskEditor,next);setTaskEditor(null)}} onDelete={()=>deleteTask(taskEditor)}/>} 
  </div>
}

function HQ({state,onOpen,onApprovals}:{state:State,onOpen:(id:string)=>void,onApprovals:()=>void}){
  const total=state.departments.reduce((n,d)=>n+d.agents.length,0)
  const blockers=state.tasks.filter(t=>t.status==='Waiting'||t.status==='Approval').length
  return <div className="hq-view">
    <div className="hq-command"><div><span className="eyebrow">ORGANIZATION COMMAND</span><h2>Visible work. Durable execution.</h2><p>The operating layer is live: tasks, approvals and audit history now persist in PostgreSQL.</p></div><div className="hq-input"><MessageSquareText/><span>{blockers} blockers currently need coordination</span><button onClick={onApprovals}><ShieldCheck/>Review</button></div></div>
    <div className="hq-stats"><div><strong>{total}</strong><span>Agents</span></div><div><strong>{state.departments.length}</strong><span>Departments</span></div><div><strong>{state.tasks.filter(t=>t.status==='Running').length}</strong><span>Running tasks</span></div><div><strong>{state.approvals}</strong><span>Approvals</span></div></div>
    <div className="department-cards">{state.departments.map(d=><button onClick={()=>onOpen(d.id)} key={d.id} style={{'--accent':d.accent} as any}><div className="dept-top"><div className="dept-orb"><Users/></div><span>{d.agents.filter(a=>a.status==='working').length} live</span></div><h3>{d.name}</h3><p>{d.lead} coordinating {d.agents.length} agents</p><div className="mini-agents">{d.agents.slice(0,6).map(a=><i key={a.id} className={statusClass(a.status)} title={a.name}/>)}</div><div className="open-link">Open department <ChevronRight/></div></button>)}</div>
    <div className="hq-lower"><div className="panel"><div className="panel-head"><div><span className="eyebrow">BLOCKER RADAR</span><h3>What is blocking us today?</h3></div></div><div className="blocker-summary"><Clock3/><div><strong>{blockers} blocked tasks</strong><span>Waiting + Approval across the organization</span></div><button onClick={onApprovals}>Review approvals</button></div></div><div className="panel"><div className="panel-head"><div><span className="eyebrow">THE BRAIN</span><h3>Organization knowledge</h3></div></div><div className="brain-summary"><Brain/><div><strong>Brain structure ready</strong><span>Knowledge · SOP · Decisions · Skills · Work history</span></div><button>Open Brain</button></div></div></div>
  </div>
}

function ApprovalsView({approvals,busy,onDecision}:{approvals:Approval[],busy:boolean,onDecision:(id:string,status:'approved'|'rejected'|'pending')=>void}){
  const pending=approvals.filter(a=>a.status==='pending')
  const decided=approvals.filter(a=>a.status!=='pending')
  return <div className="content-view approvals-view">
    <div className="view-hero"><div><span className="eyebrow">HUMAN CONTROL POINT</span><h2>{pending.length} decision{pending.length===1?'':'s'} waiting</h2><p>Sensitive actions pause here until a human approves or rejects them.</p></div><ShieldCheck/></div>
    <div className="approval-section"><h3>Pending</h3>{pending.length===0?<div className="empty-state"><CheckCircle2/><b>Inbox clear</b><span>No approvals are waiting.</span></div>:<div className="approval-list">{pending.map(a=><div className="approval-card" key={a.id}><div className="approval-icon"><ShieldCheck/></div><div className="approval-copy"><b>{a.title}</b><span>Requested by {a.requestedBy}</span><small>{a.createdAt?new Date(a.createdAt).toLocaleString():''}</small></div><div className="approval-actions"><button className="reject" disabled={busy} onClick={()=>onDecision(a.id,'rejected')}>Reject</button><button className="approve" disabled={busy} onClick={()=>onDecision(a.id,'approved')}>Approve</button></div></div>)}</div>}</div>
    {decided.length>0 && <div className="approval-section"><h3>Recent decisions</h3><div className="approval-list compact">{decided.slice(0,10).map(a=><div className="approval-card" key={a.id}><div className="approval-icon"><CheckCircle2/></div><div className="approval-copy"><b>{a.title}</b><span>{a.status} by {a.decidedBy || 'You'}</span><small>{a.decidedAt?new Date(a.decidedAt).toLocaleString():''}</small></div><button className="restore-btn" disabled={busy} onClick={()=>onDecision(a.id,'pending')}>Restore</button></div>)}</div></div>}
  </div>
}

function ActivityView({activity}:{activity:ActivityItem[]}){
  return <div className="content-view activity-view">
    <div className="view-hero"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Execution history</h2><p>Every durable task and approval mutation leaves a visible trail.</p></div><Activity/></div>
    <div className="activity-list">{activity.length===0?<div className="empty-state"><Activity/><b>No activity yet</b><span>Durable actions will appear here.</span></div>:activity.map(a=><div className="activity-row" key={a.id}><div className="activity-dot"/><div className="activity-main"><div><b>{a.actor}</b><span>{a.action}</span></div><p>{a.detail || a.targetId}</p></div><div className="activity-time">{a.createdAt?new Date(a.createdAt).toLocaleString():''}</div></div>)}</div>
  </div>
}

function NewTaskModal({dept,busy,onClose,onCreate}:{dept:Department,busy:boolean,onClose:()=>void,onCreate:(task:Omit<Task,'id'>)=>void}){
  const [draft,setDraft]=useState<Omit<Task,'id'>>({title:'',department:dept.name,status:'Inbox',owner:dept.lead,priority:'Medium'})
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">NEW DURABLE TASK</span><h3>Add to {dept.name}</h3></div><button onClick={onClose}><X/></button></div><div className="modal-form"><label>Task title<input autoFocus value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="Describe the outcome"/></label><div className="form-grid"><label>Owner<select value={draft.owner} onChange={e=>setDraft({...draft,owner:e.target.value})}>{dept.agents.map(a=><option key={a.id}>{a.name}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={e=>setDraft({...draft,priority:e.target.value})}>{priorities.map(p=><option key={p}>{p}</option>)}</select></label></div><label>Status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}>{lanes.map(s=><option key={s}>{s}</option>)}</select></label></div><div className="modal-actions"><button className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={busy||!draft.title.trim()} onClick={()=>onCreate({...draft,title:draft.title.trim()})}>Create task</button></div></div></div>
}

function TaskModal({task,departments,busy,onClose,onSave,onDelete}:{task:Task,departments:Department[],busy:boolean,onClose:()=>void,onSave:(patch:Partial<Task>)=>void,onDelete:()=>void}){
  const [draft,setDraft]=useState<Task>(task)
  const owners=useMemo(()=>departments.find(d=>d.name===draft.department)?.agents ?? [],[departments,draft.department])
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">TASK CONTROL</span><h3>{task.id}</h3></div><button onClick={onClose}><X/></button></div><div className="modal-form"><label>Task title<input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><div className="form-grid"><label>Department<select value={draft.department} onChange={e=>{const d=departments.find(x=>x.name===e.target.value);setDraft({...draft,department:e.target.value,owner:d?.lead || draft.owner})}}>{departments.map(d=><option key={d.id}>{d.name}</option>)}</select></label><label>Owner<select value={draft.owner} onChange={e=>setDraft({...draft,owner:e.target.value})}>{owners.map(a=><option key={a.id}>{a.name}</option>)}{owners.every(a=>a.name!==draft.owner)&&<option>{draft.owner}</option>}</select></label></div><div className="form-grid"><label>Status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}>{lanes.map(s=><option key={s}>{s}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={e=>setDraft({...draft,priority:e.target.value})}>{priorities.map(p=><option key={p}>{p}</option>)}</select></label></div></div><div className="modal-actions split"><button className="danger" disabled={busy} onClick={onDelete}><Trash2/>Delete</button><div><button className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={busy||!draft.title.trim()} onClick={()=>onSave({title:draft.title.trim(),department:draft.department,owner:draft.owner,status:draft.status,priority:draft.priority})}>Save changes</button></div></div></div></div>
}
