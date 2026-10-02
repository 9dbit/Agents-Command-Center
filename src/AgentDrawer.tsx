import { useEffect, useState } from 'react'
import { Activity, Brain, CheckCircle2, Cpu, LockKeyhole, Play, RefreshCw, Wrench, X } from 'lucide-react'
import './agent.css'

type Skill={id:string;label:string;tool:string;status:string;executable:boolean}
type Run={id:string;skill:string;status:string;output?:string|null;input?:string|null;createdAt:string}
type Task={id:string;title:string;status:string;priority:string;department:string}
type Profile={agent:{id:string;name:string;role:string;status:string;task?:string|null};department:{id:string;name:string;lead:string;accent:string};capabilities:{lead:boolean;skills:Skill[];tools:string[];permissions:string[];memoryScope:string};currentTasks:Task[];recentRuns:Run[];brain:{accessibleItems:number;scope:string}}

export default function AgentDrawer({agentId,onClose,onWorkspaceRefresh}:{agentId:string;onClose:()=>void;onWorkspaceRefresh:()=>Promise<void>|void}){
  const [profile,setProfile]=useState<Profile|null>(null)
  const [busy,setBusy]=useState(false)
  const [note,setNote]=useState('')
  const load=async()=>{setBusy(true);try{const r=await fetch(`/api/agents/${agentId}`);const d=await r.json();if(!r.ok)throw new Error(d.error||'agent_profile_failed');setProfile(d)}catch(e){setNote(e instanceof Error?e.message:'Profile unavailable')}finally{setBusy(false)}}
  useEffect(()=>{load()},[agentId])
  const runSkill=async(skill:Skill)=>{if(!profile)return;setBusy(true);setNote('');try{const r=await fetch('/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentId:profile.agent.id,departmentId:profile.department.id,skill:skill.id,input:`Run ${skill.label} from agent profile.`})});const d=await r.json();if(!r.ok)throw new Error(d.output||d.error||'agent_run_failed');setNote(`${profile.agent.name} completed ${skill.label}.`);await load();await onWorkspaceRefresh()}catch(e){setNote(e instanceof Error?e.message:'Run failed')}finally{setBusy(false)}}
  return <div className="agent-drawer-backdrop" onMouseDown={onClose}><aside className="agent-drawer" onMouseDown={e=>e.stopPropagation()}>
    <div className="agent-drawer-head"><div><span>AGENT PROFILE</span><h2>{profile?.agent.name||'Loading…'}</h2><p>{profile?`${profile.agent.role} · ${profile.department.name}`:'Resolving live capability profile'}</p></div><button onClick={onClose}><X/></button></div>
    {!profile?<div className="agent-loading"><RefreshCw className={busy?'spin':''}/> Loading durable profile…</div>:<>
      <div className="agent-identity"><div className="agent-monogram" style={{borderColor:profile.department.accent}}>{profile.agent.name[0]}</div><div><b>{profile.agent.name}</b><span className={`agent-state ${profile.agent.status}`}>{profile.agent.status}</span><p>{profile.capabilities.lead?'Department Lead':'Specialist Agent'} · Memory: {profile.capabilities.memoryScope}</p></div></div>
      <div className="agent-kpis"><div><Brain/><b>{profile.brain.accessibleItems}</b><span>Brain items</span></div><div><Activity/><b>{profile.recentRuns.length}</b><span>Recent runs</span></div><div><Cpu/><b>{profile.currentTasks.length}</b><span>Active tasks</span></div></div>
      <section><div className="agent-section-title"><Cpu/> Skills</div><div className="skill-stack">{profile.capabilities.skills.length?profile.capabilities.skills.map(skill=><div className="skill-row" key={skill.id}><div><b>{skill.label}</b><span>{skill.tool}</span></div><div className="skill-actions"><em className={skill.status}>{skill.status}</em>{skill.executable&&<button disabled={busy} onClick={()=>runSkill(skill)}><Play/>Run</button>}</div></div>):<div className="agent-empty">No registered skills yet.</div>}</div></section>
      <section><div className="agent-section-title"><Wrench/> Tool permissions</div><div className="chip-grid">{profile.capabilities.tools.map(t=><span key={t}>{t}</span>)}{profile.capabilities.tools.length===0&&<span>Brain only</span>}</div></section>
      <section><div className="agent-section-title"><LockKeyhole/> Permissions</div><div className="chip-grid permissions">{profile.capabilities.permissions.map(p=><span key={p}>{p}</span>)}</div></section>
      <section><div className="agent-section-title"><CheckCircle2/> Current work</div><div className="agent-task-list">{profile.currentTasks.length?profile.currentTasks.map(t=><div key={t.id}><b>{t.title}</b><span>{t.status} · {t.priority}</span></div>):<div className="agent-empty">No active durable tasks.</div>}</div></section>
      <section><div className="agent-section-title"><Activity/> Execution history</div><div className="agent-run-list">{profile.recentRuns.length?profile.recentRuns.slice(0,6).map(r=><div key={r.id}><em className={r.status}>{r.status}</em><div><b>{r.skill}</b><p>{r.output||r.input||'No output'}</p></div></div>):<div className="agent-empty">No runs recorded yet.</div>}</div></section>
    </>}
    {note&&<div className="agent-note">{note}</div>}
  </aside></div>
}
