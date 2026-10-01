import { useEffect, useMemo, useState } from 'react'
import { Brain, FileText, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import './brain.css'

type Department = { id:string; name:string; lead:string }
type KnowledgeItem = {
  id:string; type:string; title:string; content:string; scope:string;
  departmentId?:string|null; source:string; createdAt?:string; updatedAt?:string
}
type ModelStatus = { provider:string; model:string; configured:boolean }

const types=['knowledge','sop','decision','brand-rule','skill','customer','project']

export default function BrainWorkspace({departments}:{departments:Department[]}){
  const [items,setItems]=useState<KnowledgeItem[]>([])
  const [model,setModel]=useState<ModelStatus|null>(null)
  const [query,setQuery]=useState('')
  const [filter,setFilter]=useState('all')
  const [open,setOpen]=useState(false)
  const [busy,setBusy]=useState(false)
  const [form,setForm]=useState({type:'knowledge',title:'',content:'',scope:'organization',departmentId:'',source:'manual'})

  const refresh=async()=>{
    const [brainRes,modelRes]=await Promise.all([fetch('/api/brain'),fetch('/api/model/status')])
    if(brainRes.ok) setItems(await brainRes.json())
    if(modelRes.ok) setModel(await modelRes.json())
  }
  useEffect(()=>{refresh()},[])

  const visible=useMemo(()=>items.filter(item=>{
    const matchesType=filter==='all' || item.type===filter
    const hay=`${item.title} ${item.content} ${item.type} ${item.source}`.toLowerCase()
    return matchesType && hay.includes(query.toLowerCase())
  }),[items,filter,query])

  const create=async()=>{
    if(!form.title.trim() || !form.content.trim()) return
    setBusy(true)
    try{
      const body={...form,departmentId:form.scope==='department' ? form.departmentId || null : null}
      const r=await fetch('/api/brain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
      if(!r.ok) throw new Error('brain_create_failed')
      setForm({type:'knowledge',title:'',content:'',scope:'organization',departmentId:'',source:'manual'})
      setOpen(false)
      await refresh()
    }finally{setBusy(false)}
  }

  const remove=async(id:string)=>{
    setBusy(true)
    try{
      const r=await fetch(`/api/brain/${id}`,{method:'DELETE'})
      if(!r.ok) throw new Error('brain_delete_failed')
      await refresh()
    }finally{setBusy(false)}
  }

  return <div className="brain-workspace">
    <section className="brain-hero">
      <div className="brain-core"><Brain size={28}/></div>
      <div><span className="eyebrow">ORGANIZATION MEMORY</span><h2>The Brain</h2><p>Durable context shared with department leads and the model router.</p></div>
      <div className={`model-chip ${model?.configured?'ready':'fallback'}`}>
        <b>{model?.configured?'MODEL READY':'MODEL FALLBACK'}</b>
        <span>{model?.provider || 'openai'} · {model?.model || 'not configured'}</span>
      </div>
    </section>

    <section className="brain-toolbar">
      <div className="brain-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search knowledge, SOPs, decisions…"/></div>
      <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All types</option>{types.map(t=><option key={t}>{t}</option>)}</select>
      <button onClick={refresh} className="brain-refresh"><RefreshCw size={14}/></button>
      <button onClick={()=>setOpen(true)} className="brain-add"><Plus size={15}/> Add knowledge</button>
    </section>

    <section className="brain-summary-row">
      <div><strong>{items.length}</strong><span>Knowledge items</span></div>
      <div><strong>{items.filter(i=>i.type==='sop').length}</strong><span>SOPs</span></div>
      <div><strong>{items.filter(i=>i.type==='decision').length}</strong><span>Decisions</span></div>
      <div><strong>{items.filter(i=>i.scope==='department').length}</strong><span>Department scoped</span></div>
    </section>

    <section className="brain-grid">
      {visible.map(item=><article key={item.id} className="knowledge-card">
        <div className="knowledge-top"><span>{item.type}</span><button onClick={()=>remove(item.id)} disabled={busy}><Trash2 size={13}/></button></div>
        <div className="knowledge-icon"><FileText size={16}/></div>
        <h3>{item.title}</h3><p>{item.content}</p>
        <footer><span>{item.scope==='department' ? departments.find(d=>d.id===item.departmentId)?.name || 'Department' : 'Organization'}</span><small>{item.source}</small></footer>
      </article>)}
      {!visible.length && <div className="brain-empty"><Brain size={28}/><h3>No knowledge here yet</h3><p>Add SOPs, decisions, brand rules, project context, and skills so every lead works from the same brain.</p></div>}
    </section>

    {open && <div className="brain-modal-backdrop" onMouseDown={()=>setOpen(false)}><div className="brain-modal" onMouseDown={e=>e.stopPropagation()}>
      <div className="brain-modal-head"><div><span className="eyebrow">NEW MEMORY</span><h3>Add to Organization Brain</h3></div><button onClick={()=>setOpen(false)}>×</button></div>
      <label>Type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{types.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Title<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Brand voice rules"/></label>
      <label>Content<textarea value={form.content} onChange={e=>setForm({...form,content:e.target.value})} placeholder="What should agents know?"/></label>
      <div className="brain-form-row"><label>Scope<select value={form.scope} onChange={e=>setForm({...form,scope:e.target.value})}><option value="organization">Organization</option><option value="department">Department</option></select></label>
      {form.scope==='department' && <label>Department<select value={form.departmentId} onChange={e=>setForm({...form,departmentId:e.target.value})}><option value="">Select…</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}</div>
      <label>Source<input value={form.source} onChange={e=>setForm({...form,source:e.target.value})}/></label>
      <button className="brain-save" onClick={create} disabled={busy}>{busy?'Saving…':'Save to Brain'}</button>
    </div></div>}
  </div>
}
