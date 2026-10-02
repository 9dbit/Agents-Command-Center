import { useEffect, useState } from 'react'
import AgentDrawer from './AgentDrawer'

type MapEntry={id:string;name:string}

export default function AgentCapabilityOverlay(){
  const [agentId,setAgentId]=useState<string|null>(null)
  const [agents,setAgents]=useState<MapEntry[]>([])

  useEffect(()=>{
    fetch('/api/state')
      .then(r=>r.ok?r.json():Promise.reject())
      .then(s=>setAgents(s.departments.flatMap((d:any)=>d.agents.map((a:any)=>({id:a.id,name:a.name})))))
      .catch(()=>{})
  },[])

  useEffect(()=>{
    const version=document.querySelector('.system-live span')
    if(version) version.textContent='v0.8'
    const click=(event:MouseEvent)=>{
      const target=event.target as HTMLElement|null
      const card=target?.closest('.floor .agent') as HTMLElement|null
      if(!card) return
      const name=card.querySelector('.agent-label b')?.textContent?.trim()
      const found=agents.find(a=>a.name===name)
      if(found) setAgentId(found.id)
    }
    document.addEventListener('click',click)
    return()=>document.removeEventListener('click',click)
  },[agents])

  return agentId?<AgentDrawer agentId={agentId} onClose={()=>setAgentId(null)}/>:null
}
