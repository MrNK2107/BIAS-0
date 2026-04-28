import React, { useState } from 'react';
import { ChevronDown, Plus, LayoutGrid, Check } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { api, formApi } from '../api/client';

export default function ProjectSelector() {
  const { projects, projectId, setProjectId, refreshProjects } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('finance');

  const currentProject = projects?.find(p => String(p.id) === String(projectId));

  const handleCreate = async () => {
    if (!newName) return;
    try {
      const fd = new FormData();
      fd.append('name', newName);
      fd.append('domain', newDomain);
      const res = await formApi.post('/project/create', fd);
      await refreshProjects();
      setProjectId(String(res.data.project_id));
      setIsCreating(false);
      setNewName('');
      setIsOpen(false);
    } catch {}
  };

  return (
    <div style={{ position: 'relative' }}>
      <button 
        className="workflow-breadcrumb" 
        style={{ 
          cursor: 'pointer', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)',
          display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', borderRadius: 100,
          color: '#fff'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <LayoutGrid size={14} style={{ color: 'var(--accent)' }} />
        <span className="workflow-breadcrumb-label" style={{ fontWeight: 700, color: '#fff' }}>
          {currentProject?.name || 'Select Project'}
        </span>
        <ChevronDown size={14} style={{ opacity: 0.5, color: '#fff' }} />
      </button>

      {isOpen && (
        <>
          <div 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }} 
            onClick={() => { setIsOpen(false); setIsCreating(false); }} 
          />
          <div className="card fade-in" style={{ 
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 280, 
            zIndex: 101, padding: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' 
          }}>
            {!isCreating ? (
              <>
                <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
                  {projects.map(p => (
                    <div 
                      key={p.id} 
                      className="card-inset" 
                      style={{ 
                        padding: '10px 12px', cursor: 'pointer', display: 'flex', 
                        justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: 6, border: String(p.id) === String(projectId) ? '1px solid var(--accent)' : '1px solid transparent',
                        background: String(p.id) === String(projectId) ? 'rgba(212, 163, 115, 0.05)' : 'transparent'
                      }}
                      onClick={() => { setProjectId(String(p.id)); setIsOpen(false); }}
                    >
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{p.name}</span>
                      {String(p.id) === String(projectId) && <Check size={14} color="var(--accent)" />}
                    </div>
                  ))}
                </div>
                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%', fontSize: '0.8rem', gap: 6 }}
                  onClick={() => setIsCreating(true)}
                >
                  <Plus size={14} /> New Project
                </button>
              </>
            ) : (
              <div className="stack stack-md">
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Create Project</div>
                <input 
                  className="input" 
                  placeholder="Project Name" 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)}
                  autoFocus
                />
                <select className="select" value={newDomain} onChange={e => setNewDomain(e.target.value)}>
                   <option value="finance">Finance</option>
                   <option value="hiring">Hiring</option>
                   <option value="healthcare">Healthcare</option>
                   <option value="justice">Justice</option>
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, fontSize: '0.8rem' }} onClick={handleCreate}>Create</button>
                  <button className="btn" style={{ fontSize: '0.8rem' }} onClick={() => setIsCreating(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
