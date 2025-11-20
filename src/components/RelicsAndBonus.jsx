import React, {useEffect, useMemo, useState, useRef} from "react";

/** Utilidades */
const BONUS_LIMIT = 136;
const SLOT_ORDER = ["s10","s20","s30","s35"];
const LS = {
  relicsKey: (role, name) => `relics-${role}-${name || "none"}`,
  bonusKey:  (role, name) => `bonus-${role}-${name || "none"}`,
  injKey:    (role, name) => `avgdef-injected-${role}-${name || "none"}`, // para limpiar inyecciones
};

function clampInt(n){ n = Number(n||0); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function sum(obj){ return Object.values(obj||{}).reduce((a,b)=>a+Number(b||0),0); }
function addStats(a,b){
  const out = {...a};
  for (const k of ["HP","SPD","EA","PA","ED","PD"]) out[k] = clampInt((out[k]||0) + (b?.[k]||0));
  return out;
}
function emptyBonus(){ return {HP:0, SPD:0, EA:0, PA:0, ED:0, PD:0}; }

/** Tooltip simple con title */
function RelicTile({rel, selected, onPick}) {
  const label = Object.entries(rel.bonus||{}).map(([k,v])=>`${v>0?"+":""}${v}${k}`).join(" · ");
  return (
    <button
      onClick={onPick}
      title={label}
      className={`flex flex-col items-center p-2 rounded hover:bg-zinc-800 ${selected?"ring-2 ring-fuchsia-500":""}`}
    >
      <img
        src={rel.png}
        alt={rel.name}
        className="w-12 h-12 object-contain"
        onError={(e)=>{ e.currentTarget.src="/relics/placeholder.png"; }}
      />
      <div className="text-[11px] mt-1 text-zinc-300 text-center leading-tight">
        {rel.name}
      </div>
    </button>
  );
}

/** Modal básico */
function Modal({open,onClose,children}) {
  if(!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#0d0f12] border border-zinc-800 rounded-xl p-4 w-[min(920px,92vw)] max-h-[85vh] overflow-auto" onClick={(e)=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/** Panel principal */
export default function RelicsAndBonus({
  role,                           // "attacker" | "defender"
  miscritName,                    // nombre visible exacto
  baseStats,                      // {HP,SPD,EA,PA,ED,PD}
  disabledRelics=false,           // true si custom marcado "reliced?"
  disabledBonus=false,            // true si custom marcado "bonused?"
  avgDef=false,                   // estado actual del toggle global (lo lees en App)
  getAvgDefTargets,               // fn(baseStatsFinalSinOverrides) => {ED,PD}
  onApplyToCard,                  // fn(derivedStats) => setStats en la card
  onBlockAvgDef,                  // fn() => si no hay puntos suficientes, desactivar toggle arriba
  onClearAvgDefInjected,          // fn() => para “hard reset”: limpiar toggle arriba
  onRecommendedApplied            // (opcional) callback cuando se aplica recommended
}){
  const [db, setDb] = useState(null);               // { slots, relics[], recommended{} }
  const [openSlot, setOpenSlot] = useState(null);   // "s10"|"s20"|"s30"|"s35"|null
  const [filter, setFilter] = useState("");

  // Estado de selección persistente por rol+miscrit
  const [relicsSel, setRelicsSel] = useState([null,null,null,null]);
  const [bonus, setBonus] = useState(emptyBonus());
  const [warnNoPoints, setWarnNoPoints] = useState(false);
  const lastAvgInjected = useRef({ED:0,PD:0}); // para revertir sólo lo inyectado

  // Carga del JSON
  useEffect(()=>{
    let alive=true;
    fetch("/relics.json").then(r=>r.json()).then(j=>{ if(alive) setDb(j); });
    return ()=>{ alive=false; }
  },[]);

  // Cargar desde LS cuando cambia miscrit
  useEffect(()=>{
    const lsRel = localStorage.getItem(LS.relicsKey(role, miscritName));
    const lsBon = localStorage.getItem(LS.bonusKey(role, miscritName));
    setRelicsSel(lsRel ? JSON.parse(lsRel) : [null,null,null,null]);
    setBonus(lsBon ? JSON.parse(lsBon) : emptyBonus());
    // limpiar marca de inyección previa
    lastAvgInjected.current = {ED:0, PD:0};
    setWarnNoPoints(false);
  }, [role, miscritName]);

  // Guardar en LS
  useEffect(()=>{
    localStorage.setItem(LS.relicsKey(role, miscritName), JSON.stringify(relicsSel));
  }, [relicsSel, role, miscritName]);
  useEffect(()=>{
    localStorage.setItem(LS.bonusKey(role, miscritName), JSON.stringify(bonus));
  }, [bonus, role, miscritName]);

  // Indexaciones
  const relicsBySlot = useMemo(()=>{
    if(!db) return {};
    const map = {s10:[],s20:[],s30:[],s35:[]};
    for(const r of db.relics||[]) map[r.slot]?.push(r);
    // ordenar por nombre
    for(const k of Object.keys(map)) map[k].sort((a,b)=>a.name.localeCompare(b.name));
    return map;
  },[db]);

  const relicIndex = useMemo(()=>{
    if(!db) return new Map();
    const m = new Map();
    for(const r of db.relics||[]) m.set(r.id, r);
    return m;
  },[db]);

  // Derived sin overrides: base + relics + bonus
  const relicSum = useMemo(()=>{
    let out = {HP:0,SPD:0,EA:0,PA:0,ED:0,PD:0};
    for(const id of relicsSel){
      const r = id ? relicIndex.get(id) : null;
      if(!r) continue;
      out = addStats(out, r.bonus);
    }
    return out;
  },[relicsSel, relicIndex]);

  const derived = useMemo(()=>{
    return addStats(addStats(baseStats||emptyBonus(), relicSum), bonus);
  },[baseStats, relicSum, bonus]);

  const bonusLeft = useMemo(()=>{
    const used = sum(bonus);
    return Math.max(0, BONUS_LIMIT - used);
  },[bonus]);

  /** AVG DEF => inyectar en BONUS (ED/PD) si alcanza */
  useEffect(()=>{
    if(!avgDef) return; // si lo apagan arriba, no hacemos nada aquí
    if(!getAvgDefTargets) return;

    const target = getAvgDefTargets(addStats(baseStats, relicSum)); // SIN overrides
    if(!target) return;

    const needED = Math.max(0, clampInt(target.ED) - clampInt((baseStats.ED||0) + (relicSum.ED||0) + (bonus.ED||0)));
    const needPD = Math.max(0, clampInt(target.PD) - clampInt((baseStats.PD||0) + (relicSum.PD||0) + (bonus.PD||0)));
    const need = needED + needPD;
    if(need<=0){ lastAvgInjected.current={ED:0,PD:0}; setWarnNoPoints(false); return; }

    if(need > bonusLeft){
      // no alcanza → bloquear arriba
      setWarnNoPoints(true);
      onBlockAvgDef?.(); // pediste que se apague el toggle si no llega
      return;
    }
    // inyectar
    setWarnNoPoints(false);
    lastAvgInjected.current = {ED:needED, PD:needPD};
    setBonus(b => ({...b, ED: b.ED + needED, PD: b.PD + needPD}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avgDef, baseStats, relicSum, getAvgDefTargets]);

  /** Hard reset solicitado (doble clic en refresh del header) */
  useEffect(()=>{
    // señal para limpiar la inyección al hacer hard reset desde arriba
    const key = LS.injKey(role, miscritName);
    const flag = localStorage.getItem(key);
    if(flag === "CLEAR"){
      // quitar lo inyectado
      const inj = lastAvgInjected.current;
      if(inj.ED || inj.PD){
        setBonus(b => ({...b, ED: Math.max(0, b.ED - inj.ED), PD: Math.max(0, b.PD - inj.PD)}));
      }
      lastAvgInjected.current = {ED:0,PD:0};
      localStorage.removeItem(key);
      onClearAvgDefInjected?.();
    }
  }, [role, miscritName, onClearAvgDefInjected]);

  // UI helpers
  const slotIdx = (slot)=> SLOT_ORDER.indexOf(slot);

  function openSelector(slot){ if(disabledRelics) return; setOpenSlot(slot); setFilter(""); }
  function pickRelic(slot, id){
    setRelicsSel(arr=>{
      const a=[...arr];
      a[slotIdx(slot)] = id;
      return a;
    });
    setOpenSlot(null);
  }
  function clearSlot(slot){ pickRelic(slot, null); }
  function applyRecommended(){
    if(!db?.recommended || !miscritName) return;
    const rec = db.recommended[miscritName];
    if(!rec || rec.length!==4) return;
    setRelicsSel([rec[0]||null, rec[1]||null, rec[2]||null, rec[3]||null]);
    onRecommendedApplied?.(rec);
  }
  function refreshRelics(){ if(disabledRelics) return; setRelicsSel([null,null,null,null]); }
  function refreshBonus(){ if(disabledBonus) return; setBonus(emptyBonus()); setWarnNoPoints(false); }

  function setBonusStat(k, v){
    if(disabledBonus) return;
    v = clampInt(v);
    const next = {...bonus, [k]: v};
    const used = sum(next);
    if(used > BONUS_LIMIT) return; // bloquear subir si no hay puntos
    setBonus(next);
  }

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {/* RELICS */}
      <div className={`border border-zinc-800 rounded-xl p-3 ${disabledRelics ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-zinc-200">Relics</div>
          <div className="flex items-center gap-2">
            <button
              onClick={applyRecommended}
              className="px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-xs"
              title="Apply recommended build for this miscrit"
            >
              Recommended
            </button>
            <button
              onClick={refreshRelics}
              className="px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-xs"
              title="Clear slots"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {SLOT_ORDER.map(slot=>{
            const id = relicsSel[slotIdx(slot)];
            const rel = id ? relicIndex.get(id) : null;
            return (
              <button key={slot} onClick={()=>openSelector(slot)} className="h-16 rounded border border-zinc-800 bg-[#101214] flex items-center justify-center hover:bg-[#151820]">
                {rel ? (
                  <img src={rel.png} alt={rel.name} className="w-10 h-10 object-contain"
                       onError={(e)=>{ e.currentTarget.src="/relics/placeholder.png"; }}/>
                ) : (
                  <div className="text-xs text-zinc-400">{slot.toUpperCase()}</div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selector modal */}
        <Modal open={!!openSlot} onClose={()=>setOpenSlot(null)}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-zinc-200">{openSlot?.toUpperCase()} — Select a relic</div>
            <button className="px-2 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-white" onClick={()=>clearSlot(openSlot)}>Empty slot</button>
          </div>
          <input
            placeholder="Search by name..."
            value={filter}
            onChange={(e)=>setFilter(e.target.value)}
            className="w-full mb-3 px-3 py-2 rounded bg-[#0a0c0f] border border-zinc-800 text-zinc-200 outline-none"
          />
          <div className="grid gap-2 grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {(relicsBySlot[openSlot]||[]).filter(r => !filter.trim() || r.name.toLowerCase().includes(filter.toLowerCase())).map(r=>{
              const sel = relicsSel[slotIdx(openSlot)] === r.id;
              return <RelicTile key={r.id} rel={r} selected={sel} onPick={()=>pickRelic(openSlot, r.id)} />;
            })}
          </div>
        </Modal>
      </div>

      {/* BONUSES */}
      <div className={`border border-zinc-800 rounded-xl p-3 ${disabledBonus ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-zinc-200">Bonuses</div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-zinc-400">Bonus left: <span className="text-zinc-200">{bonusLeft}</span></div>
            <button onClick={refreshBonus} className="px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-xs">Reset</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {["HP","SPD","EA","PA","ED","PD"].map(k=>(
            <div key={k} className="flex items-center justify-between bg-[#101214] border border-zinc-800 rounded px-2 py-1">
              <label className="text-xs text-zinc-300">{k}</label>
              <input
                type="number"
                value={bonus[k]||0}
                onChange={(e)=>setBonusStat(k, e.target.value)}
                className="w-20 text-right text-sm bg-transparent outline-none text-zinc-200"
              />
            </div>
          ))}
        </div>
        {warnNoPoints && (
          <div className="mt-2 text-xs text-red-400">No hay puntos suficientes para activar Avg Def.</div>
        )}
      </div>

      {/* APLICAR AL CARD */}
      <div className="md:col-span-2 flex items-center justify-end">
        <button
          onClick={()=> onApplyToCard?.(derived)}
          className="px-3 py-2 rounded bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm"
          title="Aplicar Base + Relics + Bonuses a la card"
        >
          Apply to Card
        </button>
      </div>
    </div>
  );
}
