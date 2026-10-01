import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, GitBranch, Pause, Play, Plus, RefreshCw, X } from 'lucide-react'
import './missions.css'

type Department={id:string;name:string;lead:string}
type MissionTask={id:string;title:string;department:string;status:string;owner:string;priority:string}
type Mission={id:string;title:string;objective:string;status:string;departmentIds:string[];createdAt:string;updatedAt:string;tasks:MissionTask[]}

export default function MissionsWorkspace({departments}:{departments:Department[]}){
  const [missions,setMissions]=useState<Mission[]>([])
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [form,setForm]=useState({title:'',objective:'',departmentIds:departments.slice(0,2).map(d=>d.id)})

  const refresh=async()=>{ const r=await fetch('/api/missions'); if(r.ok) setMissions(await r.json()) }
  useEffect(()=>{refresh()},[])
  const active=useMemo(()=>missions.filter(m=>m.status==='active').length,[missions])

  const create=async()=>{
    if(!form.title.trim()||!form.objective.trim()||!form.departmentIds.length)return
    setBusy(true)
    try{
      const r=await fetch('/api/missions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(form)})
      if(!r.ok) throw new Error('mission_create_failed')
      setOpen(false);setForm({title:'',objective:'',departmentIds:departments.slice(0,2).map(d=>d.id)});await refresh()
    }finally{setBusy(false)}
  }

  const setStatus=async(id:string,status:string)=>{
    setBusy(true)
    try{ const r=await fetch(`/api/missions/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status})});if(!r.ok)throw new Error('mission_update_failed');await refresh() }
    finally{setBusy(false)}
  }

  const toggleDepartment=(id:string)=>setForm(f=>({...f,departmentIds:f.departmentIds.includes(id)?f.departmentIds.filter(x=>x!==id):[...f.departmentIds,id]}))

  return <div className="missions-workspace">
    <section className="missions-hero"><div><span className="eyebrow">CROSS-DEPARTMENT ORCHESTRATION</span><h2>Missions</h2><p>Turn one outcome into durable workstreams owned by multiple department leads.</p></div><div className="mission-hero-actions"><span>{active} active</span><button onClick={refresh}><RefreshCw size={14}/></button><button className="launch" onClick={()=>setOpen(true)}><Plus size={14}/> Launch mission</button></div></section>

    <section className="mission-grid">
      {missions.map(m=>{const done=m.tasks.filter(t=>t.status==='Done').length;const pct=m.tasks.length?Math.round(done/m.tasks.length*100):0;return <article className={`mission-card ${m.status}`} key={m.id}>
        <div className="mission-top"><div className="mission-icon"><GitBranch/></div><span>{m.status}</span></div><h3>{m.title}</h3><p>{m.objective}</p>
        <div className="mission-depts">{m.departmentIds.map(id=><span key={id}>{departments.find(d=>d.id===id)?.name||id}</span>)}</div>
        <div className="mission-progress"><div><span>Workstreams</span><b>{done}/{m.tasks.length} done</b></div><div className="progress-track"><i style={{width:`${pct}%`}}/></div></div>
        <div className="mission-tasks">{m.tasks.slice(0,5).map(t=><div key={t.id}><i className={`task-state ${t.status.toLowerCase()}`}/><span>{t.department}</span><b>{t.title}</b><small>{t.owner} · {t.status}</small></div>)}</div>
        <footer>{m.status==='active'?<button disabled={busy} onClick={()=>setStatus(m.id,'paused')}><Pause size={13}/> Pause</button>:m.status==='paused'?<button disabled={busy} onClick={()=>setStatus(m.id,'active')}><Play size={13}/> Resume</button>:<span><CheckCircle2 size={13}/> Completed</span>} {m.status!=='completed'&&<button className="complete" disabled={busy} onClick={()=>setStatus(m.id,'completed')}><CheckCircle2 size={13}/> Complete mission</button>}</footer>
      </article>})}
      {!missions.length&&<div className="mission-empty"><GitBranch size={30}/><h3>No missions yet</h3><p>Launch an outcome that needs several departments. Each selected lead receives a durable Planned workstream.</p><button onClick={()=>setOpen(true)}><Plus size={14}/> Launch first mission</button></div>}
    </section>

    {open&&<div className="mission-modal-backdrop" onMouseDown={()=>setOpen(false)}><div className="mission-modal" onMouseDown={e=>e.stopPropagation()}><div className="mission-modal-head"><div><span className="eyebrow">NEW MISSION</span><h3>Coordinate the organization</h3></div><button onClick={()=>setOpen(false)}><X/></button></div><label>Mission title<input autoFocus value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Launch Indonesia hospitality report"/></label><label>Outcome / objective<textarea value={form.objective} onChange={e=>setForm({...form,objective:e.target.value})} placeholder="Describe the measurable outcome, constraints, and what done looks like."/></label><div className="department-picker"><span>Departments</span>{departments.map(d=><button key={d.id} className={form.departmentIds.includes(d.id)?'selected':''} onClick={()=>toggleDepartment(d.id)}><i/>{d.name}<small>{d.lead}</small></button>)}</div><button className="mission-save" disabled={busy||!form.title.trim()||!form.objective.trim()||!form.departmentIds.length} onClick={create}>{busy?'Launching…':'Launch mission + workstreams'}</button></div></div>}
  </div>
}
