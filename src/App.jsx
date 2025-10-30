import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
// === True Damage (suma nominal, NO por hit) ===============================
function getTrueDamage(attack) {
  const raw = attack?.trueDamage ?? attack?.extraDamage ?? 0;
  const td = Number(raw);
  return Number.isFinite(td) ? td : 0;
}
function addTrueDamageToRange(range, attack) {
  const td = getTrueDamage(attack);
  if (!td) return null;
  const round = (x) => Math.round(x);
  return { min: round(range.min + td), avg: round(range.avg + td), max: round(range.max + td) };
}

/* ---------------------------------------------------- */
/* --- AUXILIARY FUNCTIONS ---------------------------- */
/* ---------------------------------------------------- */

/* ---------- visual helpers ---------- */
const toneByElement = (el) => {
  const e = (el||'').toLowerCase();
  if (e==='physical'||e==='neutral') return 'bg-violet-600 text-white';
  if (e==='fire') return 'bg-orange-500 text-white';
  if (e==='water') return 'bg-sky-500 text-white';
  if (e==='nature') return 'bg-emerald-500 text-white';
  if (e==='lightning' || e==='light') return 'bg-yellow-300 text-black';
  if (e==='earth') return 'bg-amber-700 text-white';
  if (e==='wind') return 'bg-teal-400 text-black';
  return 'bg-zinc-600 text-white';
};
const Chip = ({ children, tone }) => <span className={`chip ${tone}`}>{children}</span>;

/* ---------- normalization ---------- */
const KNOWN_ELEMENTS = ['fire','water','nature','lightning','earth','wind','physical','neutral','light'];
const toKey = s => (s||'').toString().trim();
function normalizeElements(input){
  if (input === undefined || input === null) return [];
  if (Array.isArray(input)) return input.map(i=>toKey(i).toLowerCase()).filter(Boolean);
  const s = String(input).trim();
  if (!s) return [];
  if (s.includes('/') || s.includes(',') || s.includes(' ')) return s.split(/[\/,\s]+/).map(p=>p.toLowerCase()).filter(Boolean);
  const camel = s.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g);
  if (camel && camel.length>1) return camel.map(p=>p.toLowerCase());
  const low = s.toLowerCase();
  const found = KNOWN_ELEMENTS.filter(k => low.includes(k));
  if (found.length) return found;
  return [low];
}

/* ---------- damage calculation ---------- */
const STRONG = { water:'fire', fire:'nature', nature:'water', lightning:'wind', wind:'earth', earth:'lightning' };
function elementMultiplier(attackElement, defenderElements){
  const atk = (attackElement||'').toLowerCase();
  if (!atk || atk==='neutral' || atk==='physical') return 1;
  const defs = normalizeElements(defenderElements);
  if (!defs.length) return 1;
  const adv = defs.some(d => STRONG[atk] === d);
  const dis = defs.some(d => STRONG[d] === atk);
  if (adv && !dis) return 2;
  if (dis && !adv) return 0.5;
  return 1;
}
function computePerHit(ap, atkStat, defStat, elemMul){
  const per = (ap * (atkStat / Math.max(1, defStat))) * elemMul;
  const min = Math.floor(per * 0.9);
  const avg = Math.round(per);
  const max = Math.ceil(per * 1.1);
  return { min, avg, max, raw: per };
}
function sumTriples(a,b){ return { min: a.min + b.min, avg: a.avg + b.avg, max: a.max + b.max }; }

/* ---------- Local Storage Persistance ---------- */
const LS_KEY = 'customMiscrits';
const loadCustomMiscrits = () => {
  try {
    const json = localStorage.getItem(LS_KEY);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error("Could not load custom miscrits:", e);
    return [];
  }
};
const saveCustomMiscrits = (customList) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(customList));
  } catch (e) {
    console.error("Could not save custom miscrits:", e);
  }
};


/* ---------------------------------------------------- */
/* --- COMPONENTS ------------------------------------- */
/* ---------------------------------------------------- */

// Componente para el Toggle Switch
const ToggleSwitch = ({ checked, onChange, label }) => (
    <div className="flex items-center gap-3">
        <label htmlFor={`toggle-${label}`} className="text-sm text-zinc-400">{label}</label>
        <div id={`toggle-${label}`} className={`toggle-switch ${checked ? 'checked' : ''}`} onClick={onChange}>
            <div className="toggle-switch-handle"></div>
        </div>
    </div>
);


// Componente estable para el input de estadísticas (corrige el problema de focus)
const CustomStatInput = React.memo(({ statKey, value, onChange, isInvalid }) => (
    <div>
      <label className="block text-xs text-zinc-400">{statKey}</label>
      <input type="number" value={value} onChange={onChange} min="0" required
        className={`w-full h-10 rounded-md bg-[#0f1114] px-3 text-zinc-10 ${isInvalid ? 'border-red-500' : 'border border-[#26292d]'}`} />
    </div>
));

/* ---------- SearchableSelect (typeahead) --------- */
function SearchableSelect({ items, value, onChange, placeholder, disabled }){
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef();

  useEffect(()=>{
    function onDoc(e){ if (!ref.current?.contains(e.target)) setOpen(false); }
    document.addEventListener('click', onDoc);
    return ()=>document.removeEventListener('click', onDoc);
  },[]);

  const selectedItem = useMemo(() => items.find(i => i.name === value), [items, value]);

  useEffect(()=>{ 
    setQuery(selectedItem ? selectedItem.name : ''); 
  },[selectedItem]);
  

  const filtered = useMemo(()=>{
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(q) || (i.isCustom && i.baseName.toLowerCase().includes(q)));
  },[items, query]);

  return (
    <div ref={ref} className="relative">
      <input
        className="compact-input w-full"
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        onFocus={()=>setOpen(true)}
        onChange={(e)=>{ setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e)=>{ if (e.key==='Enter' && filtered[0]){ onChange(filtered[0].name); setOpen(false); } }}
      />
      {open && !disabled && (
        <div className="suggestions absolute z-10 mt-2 w-full">
          {filtered.length===0 && <div className="p-3 text-zinc-500">Not found</div>}
          {filtered.map(it => (
            <div key={it.name} className="suggestion-item flex items-center justify-between p-3 cursor-pointer" onClick={()=>{ onChange(it.name); setOpen(false); }}>
              <div className="pr-4">
                <div className="font-medium text-zinc-100">
                    {it.name}
                    {it.isCustom && it.baseName && <span className="text-sm font-normal text-zinc-400 ml-2">({it.baseName})</span>}
                </div>
              </div>
              <div className="flex gap-2">
                {normalizeElements(it.elements||it.type||[]).slice(0,2).map((e,i)=>(<span key={i} className={`chip ${toneByElement(e)}`} style={{padding:'4px 8px', fontSize:12}}>{e}</span>))}
                {it.isCustom && <span className="chip bg-fuchsia-600 text-white" style={{padding:'4px 8px', fontSize:12}}>Custom</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- MiscritPanel (Display) ---------- */
function MiscritPanel({ title, miscrit, stats, setStats, disabled }){
  const elements = normalizeElements(miscrit?.elements || miscrit?.type || miscrit?.element || []);
  const StatInput = useCallback(({ statKey, value, onChange }) => (
    <div>
      <label className="block text-xs text-zinc-400">{statKey}</label>
      <input type="number" value={value} onChange={onChange} disabled={disabled}
        className="w-full h-10 rounded-md bg-[#0f1114] border border-[#26292d] px-3 text-zinc-10 disabled:opacity-60 disabled:cursor-not-allowed" />
    </div>
  ), [disabled]);

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm text-zinc-300">{title}</div>
          <div className="flex items-center gap-3 mt-1 justify-between">
            <div>
              <h3 className="text-lg font-semibold text-zinc-100">
                {miscrit?.name || '—'}
                {miscrit?.isCustom && miscrit?.baseName && <span className="text-sm font-normal text-fuchsia-400 ml-2">({miscrit.baseName})</span>}
                {miscrit?.isCustom && !miscrit?.baseName && <span className="text-sm font-normal text-fuchsia-400 ml-2">(Custom)</span>}
              </h3>
            </div>
            <div className="flex gap-2">
              {elements.map((e,i)=>(<Chip key={i} tone={toneByElement(e)}>{e}</Chip>))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatInput statKey="EA" value={stats.EA} onChange={(e)=>setStats(p => ({...p, EA: Number(e.target.value||0)}))} />
        <StatInput statKey="PA" value={stats.PA} onChange={(e)=>setStats(p => ({...p, PA: Number(e.target.value||0)}))} />
        <StatInput statKey="ED" value={stats.ED} onChange={(e)=>setStats(p => ({...p, ED: Number(e.target.value||0)}))} />
        <StatInput statKey="PD" value={stats.PD} onChange={(e)=>setStats(p => ({...p, PD: Number(e.target.value||0)}))} />
        <StatInput statKey="SPD" value={stats.SPD} onChange={(e)=>setStats(p => ({...p, SPD: Number(e.target.value||0)}))} />
        <StatInput statKey="HP" value={stats.HP} onChange={(e)=>setStats(p => ({...p, HP: Number(e.target.value||0)}))} />
      </div>
    </div>
  );
}

/* ---------- Attack item ---------- */
const AttackItemCompact = ({ atk, onClick, active, disabled }) => (
  <li>
    <button onClick={onClick} disabled={disabled} className={`w-full text-left rounded-xl border px-4 py-3 transition ${active ? 'border-fuchsia-600/60 bg-fuchsia-600/10' : 'border-[#2B2F36] hover:border-zinc-500/60 bg-[#14161A]'} disabled:opacity-60 disabled:cursor-not-allowed`}>
      <div className="flex items-center gap-2">
        <span className={`chip ${toneByElement(atk.element)}`}>{(atk.element||'physical')}</span>
        <p className="font-medium text-zinc-100">{atk.name}</p>
      </div>
      <p className="text-sm text-zinc-400 mt-1">AP: {atk.ap}{(atk.hits||1)>1 ? ` × ${atk.hits}` : ''}</p>
    </button>
  </li>
);


/* ---------- Miscrit Customizer Modal (Add/Modify) ---------- */
function MiscritCustomizerModal({ miscrits, baseMiscrits, defaultStats, onSave, onClose, miscritToEdit }){
  const isEditing = !!miscritToEdit;

  const [tempBaseName, setTempBaseName] = useState(isEditing ? miscritToEdit.baseName : '');
  const [customName, setCustomName] = useState(isEditing ? miscritToEdit.name : '');
  const [customStats, setCustomStats] = useState(isEditing ? miscritToEdit.stats : defaultStats);
  const [error, setError] = useState(null);

  const baseMiscrit = useMemo(() => baseMiscrits.find(m => m.name === tempBaseName), [baseMiscrits, tempBaseName]);

  useEffect(() => {
    if (!isEditing && baseMiscrit) {
      setCustomStats({ ...(baseMiscrit.stats || defaultStats) });
      setCustomName(baseMiscrit.name);
    }
    if (isEditing && miscritToEdit) {
      setCustomStats({ ...miscritToEdit.stats });
    }
  }, [baseMiscrit, isEditing, miscritToEdit]);
  
  const handleStatChange = (statKey, value) => {
    const numValue = Math.max(0, Number(value||0));
    setCustomStats(p => ({...p, [statKey]: numValue}));
    setError(null);
  };

  const handleSave = () => {
    setError(null);

    const baseName = tempBaseName;
    if (!baseName) { setError('You must select a base Miscrit.'); return; }
    
    const statsValid = Object.values(customStats).every(v => v !== null && v !== undefined && v >= 0);
    if (!statsValid) { setError('All 6 stats (PA, EA, PD, ED, SPD, HP) must be non-negative numbers.'); return; }

    let finalName = (customName||'').trim().slice(0, 25);
    if (!finalName) {
        finalName = `${baseName} (Own)`;
    }

    // Check for conflict: only check if the new name is different from the old name being edited.
    const isNameTaken = miscrits.some(m => m.name === finalName && (!isEditing || m.name !== miscritToEdit.name));

    if (isNameTaken) {
        setError(`A Miscrit named "${finalName}" already exists. Please choose a different custom name.`);
        return;
    }

    const baseData = baseMiscrits.find(m => m.name === baseName);
    const newCustomMiscrit = {
      ...baseData,
      name: finalName,
      stats: customStats,
      baseName: baseData.name, // Ensure baseName is always the original name
      isCustom: true
    };

    onSave(newCustomMiscrit);
    onClose();
  };
  
  const handleCustomNameChange = (e) => {
    setCustomName(e.target.value.slice(0, 25));
    setError(null);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-semibold mb-6">{isEditing ? 'Modify Custom Miscrit Profile' : 'Create Custom Miscrit Profile'}</h2>
        
        {error && (
            <div className="bg-red-900/40 border border-red-500/80 p-3 rounded-lg text-sm mb-4">
                {error}
            </div>
        )}

        <div className="mb-4">
          <label className="block text-sm text-zinc-400 mb-1">1. Base Miscrit *</label>
          <SearchableSelect 
            items={baseMiscrits.filter(m => !m.isCustom)}
            value={tempBaseName} 
            onChange={setTempBaseName} 
            placeholder="Search base Miscrit..." 
            disabled={isEditing}
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-sm text-zinc-400 mb-1">2. Custom Name (Max 25 chars)</label>
          <input 
            type="text" 
            value={customName} 
            onChange={handleCustomNameChange}
            placeholder={tempBaseName ? `${tempBaseName} (Own)` : 'Custom Name'}
            disabled={!baseMiscrit}
            className="compact-input w-full"
            maxLength={25}
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm text-zinc-400 mb-3">3. Modified Stats *</label>
          <div className="grid grid-cols-2 gap-3">
            <CustomStatInput statKey="EA" value={customStats.EA} isInvalid={customStats.EA<0} onChange={(e)=>handleStatChange('EA', e.target.value)} />
            <CustomStatInput statKey="PA" value={customStats.PA} isInvalid={customStats.PA<0} onChange={(e)=>handleStatChange('PA', e.target.value)} />
            <CustomStatInput statKey="ED" value={customStats.ED} isInvalid={customStats.ED<0} onChange={(e)=>handleStatChange('ED', e.target.value)} />
            <CustomStatInput statKey="PD" value={customStats.PD} isInvalid={customStats.PD<0} onChange={(e)=>handleStatChange('PD', e.target.value)} />
            <CustomStatInput statKey="SPD" value={customStats.SPD} isInvalid={customStats.SPD<0} onChange={(e)=>handleStatChange('SPD', e.target.value)} />
            <CustomStatInput statKey="HP" value={customStats.HP} isInvalid={customStats.HP<0} onChange={(e)=>handleStatChange('HP', e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-[#2B2F36]">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-zinc-300 hover:bg-[#202227] transition">Cancel</button>
          <button onClick={handleSave} disabled={!baseMiscrit || !!error} className="px-4 py-2 rounded-md bg-fuchsia-600 text-white font-medium disabled:opacity-50 transition">
            {isEditing ? 'Save Changes' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Custom Miscrits List Modal (Management) ---------- */
function CustomMiscritsListModal({ customMiscrits, onModify, onDelete, onClose }) {
    return (
        <div className="modal-overlay">
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-6">My Custom Miscrit Profiles ({customMiscrits.length})</h2>

                {customMiscrits.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500">You have no custom miscrit profiles saved locally.</div>
                ) : (
                    <ul className="space-y-3">
                        {customMiscrits.map(m => (
                            <li key={m.name} className="flex items-center justify-between p-3 border border-[#2B2F36] rounded-lg bg-[#14161A]">
                                <div>
                                    <div className="font-medium text-zinc-100">
                                        {m.name}
                                        {m.baseName && <span className="text-sm font-normal text-zinc-400 ml-2">({m.baseName})</span>}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => onModify(m)} 
                                        className="text-sm px-3 py-1 rounded bg-fuchsia-600 hover:bg-fuchsia-500 text-white transition"
                                    >
                                        Modify
                                    </button>
                                    <button 
                                        onClick={() => onDelete(m.name)} 
                                        className="text-sm px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white transition"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex justify-end pt-4 border-t border-[#2B2F36] mt-6">
                    <button onClick={onClose} className="px-4 py-2 rounded-md text-zinc-300 hover:bg-[#202227] transition">Close</button>
                </div>
            </div>
        </div>
    );
}


/* ---------------------------------------------------- */
/* --- MAIN APP --------------------------------------- */
/* ---------------------------------------------------- */
const DEFAULT_DB_FILENAME = 'miscritsdb.json';

function App({ initialMiscrits }) {
  const defaultStats = { PA:60, EA:60, PD:60, ED:60, SPD:60, HP:153 };
  const [baseMiscrits, setBaseMiscrits] = useState([]);
  const [customMiscrits, setCustomMiscrits] = useState([]);
  
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [miscritToEdit, setMiscritToEdit] = useState(null);
  
  // NUEVO ESTADO: Toggles independientes
  const [showCustomOnlyAttacker, setShowCustomOnlyAttacker] = useState(false);
  const [showCustomOnlyDefender, setShowCustomOnlyDefender] = useState(false);

  // --- NUEVO: avgDef toggle para el defensor ---
  const [avgDef, setAvgDef] = useState(false);

  const miscrits = useMemo(() => {
    return [...baseMiscrits, ...customMiscrits];
  }, [baseMiscrits, customMiscrits]);
  
  // NUEVA LÓGICA: Listas de Miscrits filtradas según el toggle
  const miscritsAttackerDisplay = useMemo(() => {
    if (showCustomOnlyAttacker) {
      return miscrits.filter(m => m.isCustom);
    }
    return miscrits;
  }, [miscrits, showCustomOnlyAttacker]);

  const miscritsDefenderDisplay = useMemo(() => {
    if (showCustomOnlyDefender) {
      return miscrits.filter(m => m.isCustom);
    }
    return miscrits;
  }, [miscrits, showCustomOnlyDefender]);
  
  const [attackerName, setAttackerName] = useState('');
  const [defenderName, setDefenderName] = useState('');
  const [aStats, setAStats] = useState(defaultStats);
  const [dStats, setDStats] = useState(defaultStats);
  
  const [tab, setTab] = useState('base');
  const [selected, setSelected] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true); 
  const [dbError, setDbError] = useState(null); 


  // --- Data Processing and Merging ---
  const processAndSetMiscrits = (parsed) => {
    // 1. Normalize Base Miscrits and create a lookup map
    const list = Array.isArray(parsed.miscrits) ? parsed.miscrits : (Array.isArray(parsed) ? parsed : []);
    const normalizedBaseMap = new Map();
    const normalizedBase = list.map(m => {
        const baseMiscrit = { 
            ...m, 
            elements: normalizeElements(m.elements || m.type || m.element || []),
            isCustom: false
        };
        normalizedBaseMap.set(m.name, baseMiscrit);
        return baseMiscrit;
    });
    setBaseMiscrits(normalizedBase);

    // 2. Load and Rebuild Custom Miscrits
    const loadedCustom = loadCustomMiscrits();
    const validCustom = loadedCustom.map(c => {
        const base = normalizedBaseMap.get(c.baseName);
        if (!base) return null;

        return {
            ...base,
            name: c.name,
            stats: c.stats,
            baseName: c.baseName,
            isCustom: true
        };
    }).filter(Boolean);

    setCustomMiscrits(validCustom);
    
    setDbError(null);
    setLoading(false);
  }

  // --- Handlers for Custom Miscrits ---
  const handleSaveCustom = useCallback((newMiscrit) => {
    setCustomMiscrits(prev => {
        let newList = prev;
        
        // CORRECCIÓN 1: Lógica para renombrar (actualizar el mismo perfil)
        const isRenaming = miscritToEdit && miscritToEdit.name !== newMiscrit.name;
        
        if (isRenaming) {
            // Caso 1: Renombrando - Elimina el perfil anterior y añade el nuevo.
            newList = prev.filter(m => m.name !== miscritToEdit.name);
            newList.push(newMiscrit);
        } else {
            // Caso 2: Creación nueva o Editando sin renombrar.
            const existingIndex = prev.findIndex(m => m.name === newMiscrit.name);
            if (existingIndex > -1) {
                // Editando sin renombrar: reemplaza el existente
                newList = prev.map(m => m.name === newMiscrit.name ? newMiscrit : m);
            } else {
                // Creación nueva: añade a la lista
                newList = [...prev, newMiscrit];
            }
        }

        saveCustomMiscrits(newList);
        return newList;
    });
    setAttackerName(newMiscrit.name);
    setAStats(newMiscrit.stats);
  }, [miscritToEdit, setAttackerName, setAStats]);
  
  const handleEditMiscrit = useCallback((miscrit) => {
      setMiscritToEdit(miscrit);
      setShowListModal(false);
      setShowCustomizer(true);
  }, []);

  const handleDeleteCustom = useCallback((miscritName) => {
    if (!window.confirm(`Are you sure you want to delete the custom profile "${miscritName}"?`)) return;

    setCustomMiscrits(prev => {
        const newList = prev.filter(m => m.name !== miscritName);
        saveCustomMiscrits(newList);
        return newList;
    });
  }, []);

  const closeCustomizer = () => {
      setMiscritToEdit(null);
      setShowCustomizer(false);
  }


  // --- Auto Data Loading (on Mount) ---
  useEffect(()=>{
    async function loadDefaultData(){
      try{
        setLoading(true);
        const response = await fetch(`./${DEFAULT_DB_FILENAME}`);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}. Make sure ${DEFAULT_DB_FILENAME} is in the same directory.`);
        
        const parsed = await response.json();
        processAndSetMiscrits(parsed);

      } catch(err){
        console.error('Error loading default DB:', err);
        setDbError('Error loading default DB. Use the file selector to load manually.');
        setLoading(false);
      }
    }
    if (initialMiscrits && Array.isArray(initialMiscrits)) { processAndSetMiscrits(initialMiscrits); } else { loadDefaultData(); }
  },[]); 


  // --- Manual File Upload (Backup) ---
  async function handleManualFileLoad(e){
    setLoading(true);
    setDbError(null);
    const f = e.target.files && e.target.files[0];
    if (!f) { setLoading(false); return; }
    try{
      const text = await f.text();
      const parsed = JSON.parse(text);
      processAndSetMiscrits(parsed);
    }catch(err){ 
      alert('Invalid JSON or file error: '+err.message); 
      setDbError('Invalid JSON format or file error.');
      setLoading(false);
    }
  }


  // --- Selection Synchronization (Atacante) ---
  useEffect(() => {
    if (miscritsAttackerDisplay.length === 0) {
        setAttackerName('');
        return;
    }

    const miscritExists = (name) => miscritsAttackerDisplay.some(m => m.name === name);

    if (!attackerName || !miscritExists(attackerName)) {
        setAttackerName(miscritsAttackerDisplay[0].name);
    }
  }, [miscritsAttackerDisplay, attackerName]);

  // --- Selection Synchronization (Defensor) ---
  useEffect(() => {
    if (miscritsDefenderDisplay.length === 0) {
        setDefenderName('');
        return;
    }

    const miscritExists = (name) => miscritsDefenderDisplay.some(m => m.name === name);
    const defaultDefenderName = miscritsDefenderDisplay.length > 1 
                                  ? miscritsDefenderDisplay[1].name 
                                  : miscritsDefenderDisplay[0].name;

    if (!defenderName || !miscritExists(defenderName)) {
        setDefenderName(defaultDefenderName);
    }
  }, [miscritsDefenderDisplay, defenderName]);


  // --- Miscrits Selection Logic ---
  // Estos objetos SIEMPRE deben buscarse en la lista completa (`miscrits`), no en la filtrada.
  const attacker = useMemo(()=> miscrits.find(m=>m.name===attackerName) || miscrits[0] || null, [miscrits, attackerName]);
  const defender = useMemo(()=> miscrits.find(m=>m.name===defenderName) || miscrits[1] || miscrits[0] || null, [miscrits, defenderName]);

  // Load stats when a miscrit is selected by search (Base or Custom)
  const handleAttackerSelect = useCallback((name) => {
    setAttackerName(name);
    const selectedMiscrit = miscrits.find(m => m.name === name);
    if (selectedMiscrit) setAStats({ ...(selectedMiscrit.stats || defaultStats) });
  }, [miscrits, defaultStats]);

  const handleDefenderSelect = useCallback((name) => {
    setDefenderName(name);
    const selectedMiscrit = miscrits.find(m => m.name === name);
    if (selectedMiscrit) setDStats({ ...(selectedMiscrit.stats || defaultStats) });
  }, [miscrits, defaultStats]);


  // Effect to ensure Attacker stats are loaded when the object changes
  useEffect(()=>{ 
    if (attacker && attacker.name === attackerName) {
        setAStats({ ...(attacker.stats || defaultStats) });
    }
    setCollapsed(false); 
  }, [attacker?.name, attacker?.isCustom]);

  useEffect(()=>{ 
    if (defender && defender.name === defenderName) {
      setDStats({ ...(defender.stats || defaultStats) }); 
    }
  }, [defender?.name, defender?.isCustom]);


  // --- NUEVO: mapAvgValue y efecto que aplica/restaura las defensas ---
  const mapAvgValue = (base, kind) => {
    // kind: 'ED' or 'PD'
    // Mapeo según lo que pediste:
    // Elemental: 60→85, 72→99, 83→112, 95→127, 107→141
    // Física:     60→78, 72→93, 83→108, 95→124, 107→139
    const elemMap = { 60:85, 72:99, 83:112, 95:127, 107:141 };
    const physMap = { 60:78, 72:93, 83:108, 95:124, 107:139 };

    const lookup = (kind === 'ED') ? elemMap : physMap;
    // Si base coincide exactamente con una clave: devolver mapping.
    if (base !== undefined && base !== null) {
      const intBase = Number(base);
      if (lookup[intBase]) return lookup[intBase];
    }
    // Si no hay match exacto, buscamos la clave más cercana por diferencia absoluta
    if (base !== undefined && base !== null) {
      const keys = Object.keys(lookup).map(k=>Number(k));
      let best = keys[0];
      let bestDiff = Math.abs(Number(base)-best);
      for (let k of keys){
        const d = Math.abs(Number(base)-k);
        if (d < bestDiff){ best = k; bestDiff = d; }
      }
      return lookup[best];
    }
    // fallback: devolver base mismo
    return base;
  };

  // Cuando cambie el toggle avgDef o cambie el defensor, aplicamos o restauramos
  useEffect(() => {
    if (!defender) return;
    const base = defender.stats || defaultStats;
    if (avgDef) {
      const mappedED = mapAvgValue(base.ED ?? base.ED, 'ED');
      const mappedPD = mapAvgValue(base.PD ?? base.PD, 'PD');
      setDStats(prev => ({ ...prev, ED: Number(mappedED), PD: Number(mappedPD) }));
    } else {
      // restaurar a las stats del defensor (o default)
      setDStats({ ...(defender.stats || defaultStats) });
    }
  }, [avgDef, defender]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Swap Functionality ---
  const handleSwap = useCallback(() => {
    const tempName = attackerName;
    const tempStats = aStats; 
    setAttackerName(defenderName);
    setAStats(dStats); 
    setDefenderName(tempName);
    setDStats(tempStats); 
    setCollapsed(false);
  }, [attackerName, defenderName, aStats, dStats]);


  // --- Attack List Generation (Omitido por brevedad, es el mismo) ---
  const attacks = useMemo(()=>{
    if (!attacker) return [];
    const list = (tab==='enhanced' ? (attacker.enhancedAttacks||[]) : (attacker.attacks||[]));
    const normalized = list.map(a => {
      const element = (a.element||'physical').toLowerCase();
      const hits = a.hits || 1;
      const ap = a.ap || a.AP || 0;
      const extraDamage = Number(a.trueDamage ?? a.extraDamage ?? 0) || 0;
      const chained = a.chained || a.extra || null;
      return { ...a, element, hits, ap, chained, extraDamage, keySort: ap * hits };
    });
    normalized.sort((x,y)=> (y.keySort - x.keySort));
    return normalized;
  },[attacker, tab]);

  // Sync selected attack when attack list changes
  useEffect(()=>{
    setSelected(prev => {
      if (!prev) return attacks[0] || null;
      const found = attacks.find(a => a.name === prev.name);
      return found || (attacks[0] || null);
    });
  }, [attacks, attackerName]);


  // --- Damage Calculation Logic (Omitido por brevedad, es el mismo) ---
  const result = useMemo(()=>{
    if (!selected || !attacker || !defender) return null;
    const defenderElements = defender.elements || defender.type || defender.element;
    const atkElem = selected.element;
    const elemMul = elementMultiplier(atkElem, defenderElements);
    const isPhysical = (atkElem==='physical' || atkElem==='neutral');
    const atkStat = isPhysical ? aStats.PA : aStats.EA;
    const defStat = isPhysical ? dStats.PD : dStats.ED;
    const ap = selected.ap || 0;
    const per = computePerHit(ap, atkStat, defStat, elemMul);
    const hits = Math.max(1, selected.hits || 1);
    const total = { min: per.min * hits, avg: per.avg * hits, max: per.max * hits };
    const mainResult = { per, hits, total, elemMul, atkdefRatio: (atkStat/Math.max(1,defStat)).toFixed(2), element: atkElem };
    
    let extraResult = null;
    if (selected.chained){
      const ch = selected.chained;
      const chElem = (ch.element || '').toLowerCase() || selected.element;
      const chMul = elementMultiplier(chElem, defenderElements);
      const chIsPhysical = (chElem==='physical' || chElem==='neutral');
      const chAtkStat = chIsPhysical ? aStats.PA : aStats.EA;
      const chDefStat = chIsPhysical ? dStats.PD : dStats.ED;
      const chPer = computePerHit(ch.ap||0, chAtkStat, chDefStat, chMul);
      extraResult = { per: chPer, elemMul: chMul, atkdefRatio: (chAtkStat/Math.max(1,chDefStat)).toFixed(2), element: chElem, ap: ch.ap, name: ch.name || 'Extra Hit' };
    }
    return { main: mainResult, extra: extraResult };
  }, [selected, attacker, defender, aStats, dStats]);


  return (
    <div className="max-w-screen-xl mx-auto">
      {/* MODALS */}
      {showCustomizer && (
        <MiscritCustomizerModal 
          miscrits={miscrits} 
          baseMiscrits={baseMiscrits}
          defaultStats={defaultStats} 
          onSave={handleSaveCustom} 
          onClose={closeCustomizer}
          miscritToEdit={miscritToEdit}
        />
      )}
      {showListModal && (
        <CustomMiscritsListModal
            customMiscrits={customMiscrits}
            onModify={handleEditMiscrit}
            onDelete={handleDeleteCustom}
            onClose={() => setShowListModal(false)}
        />
      )}

      {/* HEADER AND CONTROLS */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Miscrits Damage Calculator</h1>
        
        {loading ? (
            <div className="text-zinc-400 font-medium flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-fuchsia-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Cargando DB...
            </div>
        ) : (
            <div className="flex items-center gap-3">
                {dbError && <div className="text-red-400 text-sm">{dbError}</div>}
                
                {customMiscrits.length > 0 && (
                    <button 
                        onClick={() => setShowListModal(true)} 
                        className="bg-zinc-700 text-white px-3 py-2 rounded-md font-medium cursor-pointer hover:bg-zinc-600 transition"
                    >
                        Show My Miscrits
                    </button>
                )}

                <button 
                    onClick={() => miscrits.length > 0 && setShowCustomizer(true)} 
                    disabled={baseMiscrits.length === 0}
                    className="bg-fuchsia-600 text-white px-3 py-2 rounded-md font-medium cursor-pointer hover:bg-fuchsia-500 transition disabled:opacity-50"
                >
                    + Add Custom Miscrit
                </button>
            </div>
        )}

      </div>

      {loading && (
        <div className="text-center py-20 text-xl text-zinc-500">Please wait while the Miscrits database loads...</div>
      )}

      {/* MAIN CONTENT */}
      {!loading && (
        <div className="grid grid-cols-3 gap-6">
          
          {/* ATTACKER PANEL (Column 1) */}
          <div className="flex flex-col">
            <div className="flex justify-between items-center h-[44px] mb-2">
                <label className="block text-sm text-zinc-400">Attacker</label>
                {/* TOGGLE ATTACKER */}
                <ToggleSwitch 
                    checked={showCustomOnlyAttacker} 
                    onChange={() => setShowCustomOnlyAttacker(p => !p)} 
                    label="Show Custom Only"
                />
            </div>
            <div className="mb-3">
              <SearchableSelect 
                items={miscritsAttackerDisplay} 
                value={attackerName} 
                disabled={miscrits.length === 0} 
                onChange={handleAttackerSelect} 
                placeholder="Search attacker..." 
              />
            </div>
            <MiscritPanel title="Attacker ·" miscrit={attacker} stats={aStats} setStats={setAStats} disabled={miscrits.length === 0} />
          </div>
          
          {/* DEFENDER PANEL (Column 2) */}
          <div className="flex flex-col">
            <div className="flex justify-between items-center h-[44px] mb-2">
                <label className="block text-sm text-zinc-400">Defender</label>
                {/* NUEVO TOGGLE avg def: entre el label y el show custom only */}
                <div className="flex items-center gap-3 mr-3">
                  <ToggleSwitch 
                      checked={avgDef} 
                      onChange={() => setAvgDef(p => !p)} 
                      label="avg def"
                  />
                </div>
                {/* TOGGLE DEFENDER */}
                <ToggleSwitch 
                    checked={showCustomOnlyDefender} 
                    onChange={() => setShowCustomOnlyDefender(p => !p)} 
                    label="Show Custom Only"
                />
            </div>
            <div className="mb-3">
              <SearchableSelect 
                items={miscritsDefenderDisplay} 
                value={defenderName} 
                disabled={miscrits.length === 0} 
                onChange={handleDefenderSelect} 
                placeholder="Search defender..." 
              />
            </div>
            <MiscritPanel title="Defender ·" miscrit={defender} stats={dStats} setStats={setDStats} disabled={miscrits.length === 0} />
          </div>
          
          {/* ATTACK & RESULTS (Column 3, stacked) */}
          <div className="col-span-1 flex flex-col gap-6"> 
            
            {/* Espacio de alineación (ajustado de 74px a 52px) */}
            <div className="h-[34px]"></div> 
            
            {/* ATTACK PANEL */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                {/* HEADER WITH SWAP BUTTON */}
                <div className="w-full flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Attacks of {attacker?.name||'—'} ({tab})</h3>
                  
                  {/* SWAP BUTTON */}
                  <button onClick={handleSwap} disabled={miscrits.length === 0} className="text-zinc-400 hover:text-fuchsia-400 transition ml-4 disabled:opacity-30 disabled:cursor-not-allowed" title="Swap Miscrits and Stats">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right-left"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
                  </button>
                </div>
              </div>
              
              <div className="mb-4 pt-2">
                  <button onClick={()=>setTab('base')} disabled={miscrits.length === 0} className={`px-3 py-1 rounded-full mr-2 disabled:opacity-30 ${tab==='base' ? 'bg-fuchsia-600 text-white' : 'bg-[#101214] text-zinc-300'}`}>Base</button>
                  <button onClick={()=>setTab('enhanced')} disabled={miscrits.length === 0} className={`px-3 py-1 rounded-full disabled:opacity-30 ${tab==='enhanced' ? 'bg-fuchsia-600 text-white' : 'bg-[#101214] text-zinc-300'}`}>Enhanced</button>
              </div>

              {!collapsed && (
                <ul className="space-y-3 max-h-[44vh] overflow-auto">
                  {attacks.map(atk => <AttackItemCompact key={atk.name} atk={atk} disabled={miscrits.length === 0} onClick={() => { setSelected(atk); setCollapsed(true); }} active={selected && selected.name===atk.name} />)}
                  {attacks.length===0 && <li className="text-zinc-400">No attacks available</li>}
                </ul>
              )}

              {collapsed && selected && (
                <div className="mt-3">
                  <div className="rounded-lg border p-3 border-[#2B2F36] bg-[#0f1114]">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Chip tone={toneByElement(selected.element)}>{selected.element}</Chip>
                          <div className="font-medium">{selected.name}</div>
                        </div>
                        <div className="text-sm text-zinc-400">AP: {selected.ap}{selected.hits>1 ? ` × ${selected.hits}` : ''}</div>
                        {selected.chained && <div className="text-sm text-zinc-400 mt-2">Extra: {selected.chained.element} · AP: {selected.chained.ap}</div>}
                      </div>
                      <div>
                        <button onClick={()=>setCollapsed(false)} className="text-sm px-3 py-1 rounded bg-[#202227]">Change attack</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* RESULTS PANEL */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold mb-3">Damage Results</h3>
              {!selected && <div className="text-zinc-400">Select an attack</div>}
              {selected && result && (
                <div className="rounded-lg border p-4 border-[#2B2F36] bg-[#0f1114]">
                  
                  {/* --- Main Attack Block --- */}
                  <div className="mb-4 pb-4 border-b border-zinc-700/50">
                    <div className="flex items-center gap-3 mb-2">
                      <Chip tone={toneByElement(result.main.element)}>{result.main.element}</Chip>
                      <div className="font-semibold">{selected.name} · AP: {selected.ap}{selected.hits>1 ? ` × ${selected.hits}` : ''}</div>
                    </div>

                    <div className="text-sm text-zinc-400 mb-3">
                      Elemental multiplier: <strong className="text-white">{result.main.elemMul.toFixed(2)}</strong>
                      <br/>Atk/Def ratio: <strong className="text-white">{result.main.atkdefRatio}</strong>
                    </div>

                    {selected.hits>1 && (
                      <div className="text-sm text-zinc-400 font-medium space-y-1">
                        <div>Damage per hit:</div>
                        <div className="text-white text-lg font-bold">
                          Min: {result.main.per.min}
                          <span className="mx-2">·</span>Avg: {result.main.per.avg}
                          <span className="mx-2">·</span>Max: {result.main.per.max}
                        </div>
                      </div>
                    )}

                    <div className="text-sm text-zinc-400 font-medium mt-3 space-y-1">
                      <div>Total damage:</div>
                      <div className="text-white text-lg font-bold">
                        Min: {result.main.total.min}
                        <span className="mx-2">·</span>Avg: {result.main.total.avg}
                        <span className="mx-2">·</span>Max: {result.main.total.max}
                      </div>
                    </div>
<div className="mt-2 text-sm opacity-80">
  {(() => {
    const withTD = addTrueDamageToRange(result.main.total, selected);
    return withTD ? (<>with true damage: min {withTD.min} · avg {withTD.avg} · max {withTD.max}</>) : null;
  })()}
</div>
                  </div>

                  {/* --- Extra Attack Block --- */}
                  {result.extra && (
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <Chip tone={toneByElement(result.extra.element)}>{result.extra.element}</Chip>
                        <div className="font-semibold">{result.extra.name} · AP: {result.extra.ap}</div>
                      </div>

                      <div className="text-sm text-zinc-400 mb-3">
                        Elemental multiplier: <strong className="text-white">{result.extra.elemMul.toFixed(2)}</strong>
                        <br/>Atk/Def ratio: <strong className="text-white">{result.extra.atkdefRatio}</strong>
                      </div>

                      <div className="text-sm text-zinc-400 font-medium space-y-1">
                        <div>Damage:</div>
                        <div className="pl-3 text-white">
                          Min: {result.extra.per.min}
                          <span className="mx-2">·</span>Avg: {result.extra.per.avg}
                          <span className="mx-2">·</span>Max: {result.extra.per.max}
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-zinc-700/50">
                        <div className="text-sm text-zinc-300 font-medium">TOTAL DAMAGE (Base + Extra)</div>
                        {(() => {
                          const mainTotal = result.main.total;
                          const extraTotal = { min: result.extra.per.min, avg: result.extra.per.avg, max: result.extra.per.max };
                          const total = sumTriples(mainTotal, extraTotal);
                          
return (
  <>
    <div className="text-lg font-bold text-white mt-2">
      Min: {total.min}
      <span className="mx-2">·</span>Avg: {total.avg}
      <span className="mx-2">·</span>Max: {total.max}
    </div>
    <div className="mt-2 text-sm opacity-80">
      {(() => {
        const withTD = addTrueDamageToRange(total, selected);
        return withTD ? (<>with true damage: min {withTD.min} — avg {withTD.avg} — max {withTD.max}</>) : null;
      })()}
    </div>
  </>
);
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* footer notes removed as requested */}
    </div>
  );
}



export default App;
