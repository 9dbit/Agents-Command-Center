import { useEffect, useMemo, useState } from 'react'
import {
  Activity, Brain, CheckCircle2, ChevronRight, CircleDot, Clock3, Command,
  GitBranch, Inbox, LayoutDashboard, MessageSquareText, Network, Search,
  Settings, ShieldCheck, Sparkles, Users, Wrench
} from 'lucide-react'

type Agent = { id:string; name:string; role:string; status:'working'|'idle'|'waiting'|'approval'|'failed'; task?:string }
type Department = { id:string; name:string; accent:string; agents:Agent[]; lead:string }
type Task = { id:string; title:string; department:string; status:string; owner:string; priority:string }
type State = { departments:Department[]; tasks:Task[]; approvals:number; tools:{name:string;status:string}[] }

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
  tools:[{name:'GitHub',status:'connected'},{name:'Google Drive',status:'connected'},{name:'Gmail',status:'connected'},{name:'Railway',status:'ready'},{name:'Browser',status:'ready'},{name:'Figma',status:'offline'}]
}

const lanes = ['Inbox','Planned','Running','Waiting','Approval','Done']
const statusClass = (status:string) => `status status-${status}`

export default function App(){
  const [state,setState]=useState<State>(fallback)
  const [selected,setSelected]=useState('marketing')
  const [prompt,setPrompt]=useState('')
  const [messages,setMessages]=useState([{from:'lead',text:'Marketing command channel online. I am coordinating the team and will surface anything that needs your approval.'}])
  const [view,setView]=useState<'department'|'hq'>('department')

  useEffect(()=>{ fetch('/api/state').then(r=>r.ok?r.json():Promise.reject()).then(setState).catch(()=>{}) },[])
  const dept=state.departments.find(d=>d.id===selected) || state.departments[0]
  const active=state.departments.flatMap(d=>d.agents).filter(a=>a.status==='working').length
  const total=state.departments.reduce((n,d)=>n+d.agents.length,0)
  const deptTasks=state.tasks.filter(t=>t.department===dept.name)

  const send=async()=>{
    if(!prompt.trim()) return
    const text=prompt.trim(); setPrompt('')
    setMessages(m=>[...m,{from:'user',text}])
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({department:dept.id,message:text})})
      const data=await r.json(); setMessages(m=>[...m,{from:'lead',text:data.reply}])
    }catch{ setMessages(m=>[...m,{from:'lead',text:'Command received. The local MVP orchestrator is available, but no model adapter is connected yet.'}]) }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandmark"><Command size={18}/></div><div><strong>Agents</strong><span>Command Center</span></div></div>
      <nav>
        <button className={view==='hq'?'active':''} onClick={()=>setView('hq')}><LayoutDashboard/>HQ Overview</button>
        <button className={view==='department'?'active':''} onClick={()=>setView('department')}><Network/>Departments</button>
        <button><GitBranch/>Missions</button><button><Brain/>Brain</button><button><ShieldCheck/>Approvals <em>{state.approvals}</em></button>
        <button><Wrench/>Tools</button><button><Activity/>Activity</button>
      </nav>
      <div className="sidebar-bottom"><button><Settings/>Settings</button><div className="system-live"><i/> System live <span>v0.1</span></div></div>
    </aside>

    <main>
      <header className="topbar">
        <div><h1>{view==='hq'?'Headquarters':dept.name+' Department'}</h1><p>{view==='hq'?'Organization command view':`${dept.agents.length} agents coordinated by ${dept.lead}`}</p></div>
        <div className="top-actions"><div className="search"><Search size={15}/>Search command center</div><button className="approval-btn"><ShieldCheck size={15}/>{state.approvals} approvals</button><div className="avatar">A</div></div>
      </header>

      {view==='hq' ? <HQ state={state} onOpen={(id)=>{setSelected(id);setView('department')}}/> : <>
        <section className="metrics-strip">
          <div><span>Total agents</span><strong>{total}</strong><small><Users/> across 6 departments</small></div>
          <div><span>Working now</span><strong>{active}</strong><small className="good"><CircleDot/> live execution</small></div>
          <div><span>Waiting approval</span><strong>{state.approvals}</strong><small className="warn"><Clock3/> needs attention</small></div>
          <div><span>Tools connected</span><strong>{state.tools.filter(t=>t.status!=='offline').length}</strong><small><Wrench/> execution layer</small></div>
        </section>

        <section className="command-grid">
          <div className="panel chat-panel">
            <div className="panel-head"><div><span className="eyebrow">LEAD CHANNEL</span><h3>{dept.lead} <small>• {dept.name} Lead</small></h3></div><i className="online-dot"/></div>
            <div className="messages">{messages.map((m,i)=><div key={i} className={`message ${m.from}`}><span>{m.from==='lead'?dept.lead:'You'}</span><p>{m.text}</p></div>)}</div>
            <div className="quick-prompts"><button onClick={()=>setPrompt('What is blocking the team?')}>What is blocking us?</button><button onClick={()=>setPrompt('Summarize current work')}>Summarize work</button></div>
            <div className="composer"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder={`Message ${dept.lead}...`}/><button onClick={send}><Sparkles size={16}/></button></div>
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
            <div className="panel-head"><div><span className="eyebrow">WORKBOARD</span><h3>Department tasks</h3></div><button className="icon-btn">+</button></div>
            <div className="lanes">{lanes.map(lane=><div className="lane" key={lane}><div className="lane-title"><span>{lane}</span><b>{deptTasks.filter(t=>t.status===lane).length}</b></div>{deptTasks.filter(t=>t.status===lane).map(t=><div className="task-card" key={t.id}><div className="task-meta"><span>{t.priority}</span><small>{t.department}</small></div><h4>{t.title}</h4><div className="task-owner"><div>{t.owner[0]}</div>{t.owner}<ChevronRight size={13}/></div></div>)}</div>)}</div>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="panel departments-mini"><div className="panel-head"><div><span className="eyebrow">ORGANIZATION</span><h3>Departments</h3></div></div><div className="dept-row">{state.departments.map(d=><button key={d.id} className={selected===d.id?'selected':''} onClick={()=>setSelected(d.id)} style={{'--accent':d.accent} as any}><i/><div><b>{d.name}</b><span>{d.agents.filter(a=>a.status==='working').length} working · {d.agents.length} agents</span></div></button>)}</div></div>
          <div className="panel tool-panel"><div className="panel-head"><div><span className="eyebrow">EXECUTION LAYER</span><h3>Connected tools</h3></div></div><div className="tools">{state.tools.map(t=><div key={t.name}><div className="tool-icon">{t.name.slice(0,2).toUpperCase()}</div><span>{t.name}</span><i className={t.status==='offline'?'off':''}/></div>)}</div></div>
        </section>
      </>}
    </main>
  </div>
}

function HQ({state,onOpen}:{state:State,onOpen:(id:string)=>void}){
  const total=state.departments.reduce((n,d)=>n+d.agents.length,0)
  return <div className="hq-view">
    <div className="hq-command"><div><span className="eyebrow">ORGANIZATION COMMAND</span><h2>What should the organization do?</h2><p>One instruction can become coordinated work across departments.</p></div><div className="hq-input"><MessageSquareText/><span>Ask the organization anything…</span><button><Sparkles/>Command</button></div></div>
    <div className="hq-stats"><div><strong>{total}</strong><span>Agents</span></div><div><strong>{state.departments.length}</strong><span>Departments</span></div><div><strong>{state.tasks.filter(t=>t.status==='Running').length}</strong><span>Running tasks</span></div><div><strong>{state.approvals}</strong><span>Approvals</span></div></div>
    <div className="department-cards">{state.departments.map(d=><button onClick={()=>onOpen(d.id)} key={d.id} style={{'--accent':d.accent} as any}><div className="dept-top"><div className="dept-orb"><Users/></div><span>{d.agents.filter(a=>a.status==='working').length} live</span></div><h3>{d.name}</h3><p>{d.lead} coordinating {d.agents.length} agents</p><div className="mini-agents">{d.agents.slice(0,6).map(a=><i key={a.id} className={statusClass(a.status)} title={a.name}/>)}</div><div className="open-link">Open department <ChevronRight/></div></button>)}</div>
    <div className="hq-lower"><div className="panel"><div className="panel-head"><div><span className="eyebrow">MISSION CONTROL</span><h3>Active missions</h3></div></div><div className="empty-mission"><GitBranch/><h4>No mission running yet</h4><p>Create a mission to coordinate multiple departments toward one outcome.</p><button>Create mission</button></div></div><div className="panel"><div className="panel-head"><div><span className="eyebrow">THE BRAIN</span><h3>Organization knowledge</h3></div></div><div className="brain-summary"><Brain/><div><strong>Brain structure ready</strong><span>Knowledge · SOP · Decisions · Skills · Work history</span></div><button>Open Brain</button></div></div></div>
  </div>
}
