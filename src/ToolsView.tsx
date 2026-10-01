import { useEffect, useState } from 'react'
import { Brain, CheckCircle2, ExternalLink, GitBranch, RefreshCw, RotateCw } from 'lucide-react'
import './tools.css'

type Connector = { id:string; name:string; status:string; configured:boolean; mode:string; repository?:string; capabilities:string[] }
type AgentRun = { id:string; agentId:string; departmentId:string; skill:string; status:string; input?:string|null; output?:string|null; createdAt:string; completedAt?:string|null }
type Snapshot = {
  repository:string; fullName:string; description?:string|null; visibility:string; defaultBranch:string;
  stars:number; forks:number; openIssues:number; updatedAt:string; url:string;
  commits:{sha:string;message:string;author:string;date?:string|null;url:string}[]
}

export default function ToolsWorkspace(){
  const [connectors,setConnectors]=useState<Connector[]>([])
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null)
  const [busy,setBusy]=useState(false)
  const [runs,setRuns]=useState<AgentRun[]>([])
  const [note,setNote]=useState('')

  const refresh=async()=>{
    setBusy(true); setNote('')
    try{
      const [statusRes,githubRes,runsRes]=await Promise.all([fetch('/api/tools/status'),fetch('/api/tools/github'),fetch('/api/runs?department=engineering')])
      if(statusRes.ok) setConnectors((await statusRes.json()).connectors || [])
      if(githubRes.ok) setSnapshot(await githubRes.json())
      if(runsRes.ok) setRuns(await runsRes.json())
      else setNote('GitHub connector is reachable, but repository metadata could not be loaded.')
    }finally{setBusy(false)}
  }
  useEffect(()=>{refresh()},[])

  const syncBrain=async()=>{
    setBusy(true); setNote('')
    try{
      const r=await fetch('/api/tools/github/sync',{method:'POST'})
      const data=await r.json()
      if(!r.ok) throw new Error(data.error || 'sync_failed')
      setNote(`Synced ${data.snapshot?.repository || 'GitHub'} into Organization Brain.`)
    }catch(error){ setNote(error instanceof Error ? error.message : 'Sync failed') }
    finally{setBusy(false)}
  }

  const runForgeAudit=async()=>{
    setBusy(true); setNote('')
    try{
      const r=await fetch('/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentId:'e1',departmentId:'engineering',skill:'github.repo-audit',input:'Audit live repository health and recent change activity.'})})
      const data=await r.json()
      if(!r.ok) throw new Error(data.output || data.error || 'agent_run_failed')
      setNote(`Forge completed github.repo-audit and wrote the result to Organization Brain.`)
      await refresh()
    }catch(error){setNote(error instanceof Error?error.message:'Agent run failed')}
    finally{setBusy(false)}
  }

  const github=connectors.find(c=>c.id==='github')
  return <div className="tools-workspace">
    <section className="tools-hero">
      <div><span className="eyebrow">EXECUTION LAYER</span><h2>Tool Connections</h2><p>Connect agents to real systems, then promote trusted context into the Brain.</p></div>
      <button onClick={refresh} disabled={busy}><RefreshCw size={14}/> Refresh</button>
    </section>

    <section className="connector-grid">
      <article className="connector-card live">
        <div className="connector-title"><div className="connector-logo"><GitBranch/></div><div><h3>GitHub</h3><span><CheckCircle2 size={12}/> LIVE CONNECTOR</span></div></div>
        <div className="connector-meta"><div><span>Mode</span><b>{github?.mode || 'public-read'}</b></div><div><span>Repository</span><b>{github?.repository || snapshot?.repository || 'Loading…'}</b></div></div>
        <div className="capabilities">{(github?.capabilities || []).map(c=><span key={c}>{c}</span>)}</div>
        <div className="connector-actions"><button className="sync-brain" onClick={syncBrain} disabled={busy}><Brain size={14}/> Sync repository to Brain</button><button className="agent-run-btn" onClick={runForgeAudit} disabled={busy}><GitBranch size={14}/> Run Forge repo audit</button></div>
      </article>

      <article className="connector-card planned"><div className="connector-title"><div className="connector-logo">GD</div><div><h3>Google Drive</h3><span>PLANNED CONNECTOR</span></div></div><p>Documents, SOPs, briefs, and project files with provenance.</p></article>
      <article className="connector-card planned"><div className="connector-title"><div className="connector-logo">GM</div><div><h3>Gmail</h3><span>PLANNED CONNECTOR</span></div></div><p>Lead inbox triage, approvals, and controlled outbound actions.</p></article>
    </section>

    {snapshot && <section className="github-snapshot panel">
      <div className="snapshot-head"><div><span className="eyebrow">LIVE REPOSITORY SNAPSHOT</span><h3>{snapshot.fullName}</h3><p>{snapshot.description || 'No repository description.'}</p></div><a href={snapshot.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Open GitHub</a></div>
      <div className="repo-stats"><div><span>Branch</span><b>{snapshot.defaultBranch}</b></div><div><span>Visibility</span><b>{snapshot.visibility}</b></div><div><span>Stars</span><b>{snapshot.stars}</b></div><div><span>Open issues</span><b>{snapshot.openIssues}</b></div></div>
      <div className="commit-list"><div className="commit-list-head"><RotateCw size={13}/> Recent commits</div>{snapshot.commits.map(c=><a key={c.sha} href={c.url} target="_blank" rel="noreferrer"><code>{c.sha.slice(0,7)}</code><div><b>{c.message}</b><span>{c.author}{c.date?` · ${new Date(c.date).toLocaleString()}`:''}</span></div></a>)}</div>
    </section>}

    <section className="agent-runs panel">
      <div className="snapshot-head"><div><span className="eyebrow">REAL AGENT EXECUTION</span><h3>Forge · Engineering</h3><p>Skill runs are durable, auditable, and may write verified results into the Brain.</p></div><span className="run-count">{runs.length} runs</span></div>
      <div className="run-list">{runs.length===0?<div className="run-empty">No Forge runs yet. Run the repository audit to create the first real tool-backed execution.</div>:runs.slice(0,8).map(run=><div className="run-row" key={run.id}><span className={`run-status ${run.status}`}>{run.status}</span><div><b>{run.skill}</b><p>{run.output || run.input || 'Queued'}</p></div><small>{new Date(run.createdAt).toLocaleString()}</small></div>)}</div>
    </section>

    {note && <div className="tool-note">{note}</div>}
  </div>
}
