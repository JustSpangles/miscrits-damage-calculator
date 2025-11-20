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
  // => Texto NEGRO en todos los chips; físico más claro
  if (e==='physical'||e==='neutral') return 'bg-violet-400 text-black';
  if (e==='fire')      return 'bg-orange-400 text-black';
  if (e==='water')     return 'bg-sky-400 text-black';
  if (e==='nature')    return 'bg-emerald-400 text-black';
  if (e==='lightning' || e==='light') return 'bg-yellow-300 text-black';
  if (e==='earth')     return 'bg-amber-400 text-black';
  if (e==='wind')      return 'bg-teal-300 text-black';
  return 'bg-zinc-300 text-black';
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
// ---------- Relics helpers ----------
const STAT_KEYS = ['PA','EA','PD','ED','SPD','HP'];

function formatRelicStats(stats = {}) {
  if (!stats) return '';
  const entries = [];
  const order = STAT_KEYS;
  for (const key of order) {
    const raw = stats[key];
    if (raw === undefined || raw === null) continue;
    const val = Number(raw);
    if (!Number.isFinite(val) || val === 0) continue;
    const sign = val > 0 ? '+' : '';
    entries.push(`${sign}${val} ${key}`);
  }
  return entries.join(', ');
}

function applyRelicStats(baseStats, slots, relicsDb) {
  if (!baseStats) return baseStats;
  const total = { ...baseStats };
  if (!slots || !relicsDb || relicsDb.length === 0) return total;

  const levels = [10, 20, 30, 35];
  for (const lvl of levels) {
    const relicName = slots[lvl];
    if (!relicName) continue;
    const relic = relicsDb.find(r => r.name === relicName);
    if (!relic || !relic.stats) continue;

    for (const key of STAT_KEYS) {
      const bonus = Number(relic.stats[key] ?? 0);
      if (!Number.isFinite(bonus) || bonus === 0) continue;
      const current = Number(total[key] ?? 0);
      total[key] = current + bonus;
    }
  }
  return total;
}

function subtractRelicStats(totalStats, slots, relicsDb) {
  if (!totalStats) return totalStats;
  const base = { ...totalStats };
  if (!slots || !relicsDb || relicsDb.length === 0) return base;

  const levels = [10, 20, 30, 35];
  for (const lvl of levels) {
    const relicName = slots[lvl];
    if (!relicName) continue;
    const relic = relicsDb.find(r => r.name === relicName);
    if (!relic || !relic.stats) continue;

    for (const key of STAT_KEYS) {
      const bonus = Number(relic.stats[key] ?? 0);
      if (!Number.isFinite(bonus) || bonus === 0) continue;
      const current = Number(base[key] ?? 0);
      base[key] = current - bonus;
    }
  }
  return base;
}

const BONUS_POOL = 136;

const EMPTY_BONUS = { HP: 0, EA: 0, PA: 0, SPD: 0, ED: 0, PD: 0 };

function sumBonusStats(bonus = {}) {
  return ['HP','EA','PA','SPD','ED','PD'].reduce(
    (acc, k) => acc + (Number(bonus[k]) || 0),
    0
  );
}

function applyBonusStats(baseStats, bonus) {
  if (!baseStats) return baseStats;
  const total = { ...baseStats };
  if (!bonus) return total;
  for (const k of ['HP','EA','PA','SPD','ED','PD']) {
    const add = Number(bonus[k] ?? 0);
    if (!Number.isFinite(add) || add === 0) continue;
    total[k] = (Number(total[k] ?? 0) || 0) + add;
  }
  return total;
}

function subtractBonusStats(totalStats, bonus) {
  if (!totalStats) return totalStats;
  const base = { ...totalStats };
  if (!bonus) return base;
  for (const k of ['HP','EA','PA','SPD','ED','PD']) {
    const add = Number(bonus[k] ?? 0);
    if (!Number.isFinite(add) || add === 0) continue;
    base[k] = (Number(base[k] ?? 0) || 0) - add;
  }
  return base;
}


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

const ToggleSwitch = ({ checked, onChange, label }) => (
  <div className="flex items-center gap-3">
    <label htmlFor={`toggle-${label}`} className="text-sm text-zinc-400">{label}</label>
    <div id={`toggle-${label}`} className={`toggle-switch ${checked ? 'checked' : ''}`} onClick={onChange}>
      <div className="toggle-switch-handle"></div>
    </div>
  </div>
);

const CustomStatInput = React.memo(({ statKey, value, onChange, isInvalid }) => (
  <div>
    <label className="block text-xs text-zinc-400">{statKey}</label>
    <input type="number" value={value} onChange={onChange} min="0" required
      className={`w-full h-10 rounded-md bg-[#0f1114] px-3 text-zinc-10 ${isInvalid ? 'border-red-500' : 'border border-[#26292d]'}`} />
  </div>
));

function SearchableSelect({ items, value, onChange, placeholder, disabled }){
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef();
  const isFirstSync = useRef(true);   // <- para saltear la primera sincronización

  useEffect(()=>{
    function onDoc(e){ if (!ref.current?.contains(e.target)) setOpen(false); }
    document.addEventListener('click', onDoc);
    return ()=>document.removeEventListener('click', onDoc);
  },[]);

  const selectedItem = useMemo(
    () => items.find(i => i.name === value),
    [items, value]
  );

  // Sincroniza el texto del input con el miscrit seleccionado,
  // pero NO en el primer cambio (para que en el load quede vacío).
  useEffect(()=>{ 
    if (!selectedItem) {
      setQuery('');
      return;
    }
    if (isFirstSync.current) {
      isFirstSync.current = false;
      return;               // deja el query vacío en el primer load
    }
    setQuery(selectedItem.name);
  },[selectedItem]);

  const filtered = useMemo(()=>{
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.isCustom && i.baseName.toLowerCase().includes(q))
    );
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
        onKeyDown={(e)=>{
          if (e.key==='Enter' && filtered[0]){
            onChange(filtered[0].name);
            setOpen(false);
          }
        }}
      />
      {open && !disabled && (
  <div className="suggestions absolute z-10 mt-2 w-full space-y-1">
    {filtered.length === 0 && (
      <div className="p-3 text-zinc-500">Not found</div>
    )}
    {filtered.map((it) => (
      <div
        key={it.name}
        className="suggestion-item flex items-center justify-between cursor-pointer py-1 px-3"
        onClick={() => {
          onChange(it.name);
          setOpen(false);
        }}
      >
        <div className="pr-4">
          <div className="font-medium text-zinc-100">
            {it.name}
            {it.isCustom && it.baseName && (
              <span className="text-sm font-normal text-zinc-400 ml-2">
                ({it.baseName})
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {normalizeElements(it.elements || it.type || [])
            .slice(0, 2)
            .map((e, i) => (
              <span
                key={i}
                className={`chip ${toneByElement(e)}`}
                style={{ padding: '4px 8px', fontSize: 12 }}
              >
                {e}
              </span>
            ))}
          {it.isCustom && (
            <span
              className="chip bg-fuchsia-400 text-black"
              style={{ padding: '4px 8px', fontSize: 12 }}
            >
              Custom
            </span>
          )}
        </div>
      </div>
    ))}
  </div>
)}
    </div>
  );
}


/* ---------- MiscritPanel (Display) ---------- */
function MiscritPanel({ title, miscrit, stats, setStats, disabled, onRefresh }) {
  const elements = normalizeElements(miscrit?.elements || miscrit?.type || miscrit?.element || []);

  // Nombre base para el PNG (si es custom usa el baseName)
  const imgNameBase = miscrit?.baseName || miscrit?.name;
  const imgFile = imgNameBase
    ? imgNameBase
        .toLowerCase()
        .replace(/\s+/g, '_') + '.png'
    : null;

  // respeta el subpath (miscrits-damage-calculator) en dev y en build
  const baseUrl = import.meta.env.BASE_URL || '/';
  const imgSrc = imgFile ? `${baseUrl}miscrits/${imgFile}` : null;

  const StatInput = useCallback(
    ({ statKey, value, onChange, labelClassName }) => (
      <div>
        {/* LABEL MÁS GRANDE Y EN NEGRITA */}
        <label
          className={`block text-sm font-semibold ${
            labelClassName || 'text-zinc-400'
          }`}
        >
          {statKey}
        </label>
        <input
          type="number"
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="w-full h-10 rounded-md bg-[#0f1114] border border-[#26292d] px-3 text-zinc-10 disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>
    ),
    [disabled]
  );

  return (
    <div className="card p-6 relative">
      {/* Imagen del miscrit en la esquina superior derecha, SIN RECUADRO */}
      {imgSrc && (
        <div className="absolute top-4 right-6">
          <img
            src={imgSrc}
            alt={imgNameBase}
            className="w-20 h-20 object-contain select-none pointer-events-none"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Header del panel: título a la izquierda y chips (con refresh) a la derecha */}
      <div className="mb-2 flex items-center">
        <div className="text-sm text-zinc-300 mr-2">{title}</div>
        <div className="flex flex-wrap items-center gap-2">
          {elements.map((e, i) => (
            <Chip key={i} tone={toneByElement(e)}>
              {e}
            </Chip>
          ))}
          <button
            onClick={onRefresh}
            disabled={disabled || !miscrit}
            className="p-1 rounded hover:bg-[#202227] text-zinc-300 disabled:opacity-50"
            title="Reset to base stats"
            aria-label="Reset to base stats"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0114.13-3.36L23 10"></path>
              <path d="M20.49 15a9 9 0 01-14.13 3.36L1 14"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Fila nombre (dejamos espacio a la derecha por el PNG) */}
      <div className="mb-4 pr-24">
        <h3
          className="text-lg font-semibold text-zinc-100 truncate"
          title={miscrit?.name || '—'}
        >
          {miscrit?.name || '—'}
        </h3>
        {miscrit?.isCustom && miscrit?.baseName && (
          <div
            className="text-sm text-zinc-400 truncate"
            title={miscrit.baseName}
          >
            ({miscrit.baseName})
          </div>
        )}
      </div>

      {/* Orden y colores de stats */}
      <div className="grid grid-cols-2 gap-3">
        {/* Fila 1 */}
        <StatInput
          statKey="HP"
          labelClassName="text-green-400"
          value={stats.HP}
          onChange={(e) =>
            setStats((p) => ({ ...p, HP: Number(e.target.value || 0) }))
          }
        />
        <StatInput
          statKey="SPD"
          labelClassName="text-yellow-300"
          value={stats.SPD}
          onChange={(e) =>
            setStats((p) => ({ ...p, SPD: Number(e.target.value || 0) }))
          }
        />
        {/* Fila 2 */}
        <StatInput
          statKey="EA"
          labelClassName="text-rose-300"
          value={stats.EA}
          onChange={(e) =>
            setStats((p) => ({ ...p, EA: Number(e.target.value || 0) }))
          }
        />
        <StatInput
          statKey="PA"
          labelClassName="text-blue-300"
          value={stats.PA}
          onChange={(e) =>
            setStats((p) => ({ ...p, PA: Number(e.target.value || 0) }))
          }
        />
        {/* Fila 3 */}
        <StatInput
          statKey="ED"
          labelClassName="text-rose-500"
          value={stats.ED}
          onChange={(e) =>
            setStats((p) => ({ ...p, ED: Number(e.target.value || 0) }))
          }
        />
        <StatInput
          statKey="PD"
          labelClassName="text-blue-500"
          value={stats.PD}
          onChange={(e) =>
            setStats((p) => ({ ...p, PD: Number(e.target.value || 0) }))
          }
        />
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

                                     /* ---------- Relic Picker Modal ---------- */
function RelicPickerModal({ side, level, relics, equippedSlots, onSelect, onClose }) {
  if (!side || !level) return null;
  const levelNum = Number(level);
  const available = (relics || []).filter(r => Number(r.level) === levelNum);
  const currentName = equippedSlots?.[levelNum] || null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-semibold mb-4">
          Relics lvl {levelNum} · {side === 'attacker' ? 'Attacker' : 'Defender'}
        </h2>
        <p className="text-sm text-zinc-400 mb-4">
          Choose a relic for this slot, or leave it empty.
        </p>

        <div className="grid grid-cols-3 gap-3 max-h-[60vh] overflow-auto mb-4">
          {/* Empty option */}
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={`border border-[#2B2F36] rounded-lg p-3 flex flex-col items-center justify-center hover:border-fuchsia-500/80 hover:bg-[#15171c] transition ${
              !currentName ? 'bg-[#15171c]' : ''
            }`}
          >
            <div className="w-12 h-12 rounded-full border border-[#3A3F47] flex items-center justify-center mb-2">
              <span className="text-2xl text-zinc-400">×</span>
            </div>
            <div className="text-sm text-zinc-200 font-medium">Empty</div>
          </button>

          {available.map(r => (
            <button
              key={r.name}
              type="button"
              onClick={() => onSelect(r.name)}
              title={formatRelicStats(r.stats)}
              className={`border border-[#2B2F36] rounded-lg p-3 flex flex-col items-center hover:border-fuchsia-500/80 hover:bg-[#15171c] transition ${
                currentName === r.name ? 'bg-[#15171c]' : ''
              }`}
            >
              <div className="w-12 h-12 rounded-full border border-[#3A3F47] bg-[#111317] flex items-center justify-center mb-2 overflow-hidden">
                {r.png ? (
                  <img
                    src={`./relics/${r.png}`}
                    alt={r.name}
                    className="w-10 h-10 object-contain"
                  />
                ) : (
                  <span className="text-xs text-zinc-200 font-semibold">
                    {r.name.slice(0, 2)}
                  </span>
                )}
              </div>
              <div className="text-sm text-zinc-100 font-medium text-center truncate w-full">
                {r.name}
              </div>
              <div className="mt-1 text-[11px] text-zinc-400 text-center">
                {formatRelicStats(r.stats)}
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-end pt-3 border-t border-[#2B2F36]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-zinc-300 hover:bg-[#202227] transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Relic Slots Panel (debajo del card) ---------- */
function RelicSlotsPanel({
  miscrit,
  equippedSlots,
  relics,
  recommendedDb,
  onOpenSlot,
  setEquippedSlots,
  mode,             // 'relics' | 'bonus'
  onModeChange,
  bonusDraft,
  setBonusDraft,
  bonusApplied,
  setBonusApplied
}) {
  const levels = [10, 20, 30, 35];

  // --- RECOMMENDED RELICS ---
  const recommendedEntry = useMemo(() => {
    if (!miscrit) return null;
    const baseName = miscrit.baseName || miscrit.name;
    return (recommendedDb || []).find(r => r.miscrit === baseName) || null;
  }, [miscrit, recommendedDb]);

  const recommendedActive = useMemo(() => {
    if (!recommendedEntry) return false;
    return levels.every(lvl => {
      const expected = recommendedEntry[`lvl${lvl}`] || null; // lvl10, lvl20...
      const current  = equippedSlots?.[lvl] || null;
      return expected === current;
    });
  }, [recommendedEntry, equippedSlots]);

  const handleRecommendedClick = () => {
    if (!recommendedEntry) return;
    setEquippedSlots(prev => {
      const next = { ...(prev || {}) };
      levels.forEach(lvl => {
        next[lvl] = recommendedEntry[`lvl${lvl}`] || null;
      });
      return next;
    });
  };

  const handleRelicsClean = () => {
    // deja todos los slots vacíos
    setEquippedSlots({});
  };

  const getRelicForLevel = (lvl) => {
    if (!equippedSlots) return null;
    const name = equippedSlots[lvl];
    if (!name) return null;
    return (relics || []).find(r => r.name === name) || null;
  };

  // --- BONUS HELPERS ---

  const usedDraft = sumBonusStats(bonusDraft || {});
  const remainingDraft = Math.max(0, BONUS_POOL - usedDraft);
  const usedApplied = sumBonusStats(bonusApplied || {});

  const isDirty =
    JSON.stringify(bonusDraft || {}) !== JSON.stringify(bonusApplied || {});

  const canUsePool = (nextDraft) => sumBonusStats(nextDraft) <= BONUS_POOL;

  const handleBonusChange = (statKey, rawValue) => {
    const num = Math.max(0, Math.floor(Number(rawValue) || 0));
    setBonusDraft(prev => {
      const next = { ...(prev || {}), [statKey]: num };
      if (!canUsePool(next)) return prev; // no dejamos pasarse del pool
      return next;
    });
  };

  const adjustBonus = (statKey, delta) => {
    setBonusDraft(prev => {
      const curr = Number(prev?.[statKey] || 0);
      const nextVal = Math.max(0, curr + delta);
      const next = { ...(prev || {}), [statKey]: nextVal };
      if (!canUsePool(next)) return prev;
      return next;
    });
  };

  const handleBonusApply = () => {
    if (!canUsePool(bonusDraft || {})) return;
    setBonusApplied(bonusDraft || { ...EMPTY_BONUS });
  };

  const handleBonusClean = () => {
    const empty = { ...EMPTY_BONUS };
    setBonusDraft(empty);
    setBonusApplied(empty);
  };

  return (
    <div className="card mt-4 p-4">
      {/* Tabs Relics / Bonus + Pool */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onModeChange('relics')}
            className={`px-3 py-1 rounded-full text-sm ${
              mode === 'relics'
                ? 'bg-fuchsia-600 text-white'
                : 'bg-[#101214] text-zinc-300'
            }`}
          >
            Relics
          </button>
          <button
            type="button"
            onClick={() => onModeChange('bonus')}
            className={`px-3 py-1 rounded-full text-sm ${
              mode === 'bonus'
                ? 'bg-fuchsia-600 text-white'
                : 'bg-[#101214] text-zinc-300'
            }`}
          >
            Bonus
          </button>
        </div>

        {mode === 'bonus' && (
          <div className="text-right text-xs text-zinc-400">
            <div>
              Pool:&nbsp;
              <span className="text-white font-semibold">
                {remainingDraft}
              </span>
              <span className="text-zinc-500"> / {BONUS_POOL}</span>
            </div>
            {isDirty && (
              <div className="text-[11px] text-zinc-500">
                (not applied yet)
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- MODE RELICS --- */}
      {mode === 'relics' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-zinc-400">Relics</div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRelicsClean}
                className="text-xs text-zinc-300 hover:text-white"
              >
                Clean
              </button>
              <button
                type="button"
                onClick={handleRecommendedClick}
                disabled={!recommendedEntry}
                className={`px-3 py-1 rounded-full text-xs border border-[#2B2F36] ${
                  recommendedActive
                    ? 'bg-fuchsia-600 text-white'
                    : 'text-zinc-200 hover:bg-[#181b22]'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Recommended
              </button>
          </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {levels.map((lvl) => {
              const relic = getRelicForLevel(lvl);
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => onOpenSlot(lvl)}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="w-14 h-14 rounded-full border border-[#3A3F47] bg-[#111317] flex items-center justify-center overflow-hidden">
                    {relic ? (
                      relic.png ? (
                        <img
                          src={`./relics/${relic.png}`}
                          alt={relic.name}
                          className="w-10 h-10 object-contain"
                        />
                      ) : (
                        <span className="text-xs text-zinc-100 font-semibold">
                          {relic.name.slice(0, 2)}
                        </span>
                      )
                    ) : (
                      <span className="text-2xl text-zinc-400">+</span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400">lvl {lvl}</div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* --- MODE BONUS --- */}
      {mode === 'bonus' && (
        <div>
          <div className="text-sm text-zinc-400 mb-3">Bonus stats</div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {['HP', 'EA', 'PA', 'SPD', 'ED', 'PD'].map((k) => (
              <div key={k}>
                <label className="block text-xs text-zinc-400 mb-1">
                  {k}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={bonusDraft?.[k] ?? 0}
                    onChange={(e) => handleBonusChange(k, e.target.value)}
                    className="flex-1 h-9 rounded-md bg-[#0f1114] border border-[#26292d] px-2 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-[#2B2F36] pt-3 mt-2">
            <div className="text-xs text-zinc-500">
              Applied:&nbsp;
              <span className="text-zinc-200 font-medium">
                {usedApplied} / {BONUS_POOL}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBonusClean}
                className="px-3 py-1 text-xs rounded-md text-zinc-300 hover:bg-[#202227]"
              >
                Clean
              </button>
              <button
                type="button"
                onClick={handleBonusApply}
                disabled={!canUsePool(bonusDraft || {})}
                className="px-3 py-1 text-xs rounded-md bg-fuchsia-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



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
      baseName: baseData.name,
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
          <label className="block text-sm text-zinc-400 mb-1">1. Base Miscrit </label>
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
          <label className="block text-sm text-zinc-400 mb-3">3. Stats *</label>
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
        <h2 className="text-xl font-semibold mb-6">My Miscrits ({customMiscrits.length})</h2>

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
const RELICS_DB_FILENAME = 'relics.json';
const RECOMMENDED_DB_FILENAME = 'recommended.json';

function App({ initialMiscrits }) {
  const defaultStats = { PA:60, EA:60, PD:60, ED:60, SPD:60, HP:153 };
  const EMPTY_RELIC_SLOTS = { 10: null, 20: null, 30: null, 35: null };
  const [baseMiscrits, setBaseMiscrits] = useState([]);
  const [customMiscrits, setCustomMiscrits] = useState([]);
  
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [miscritToEdit, setMiscritToEdit] = useState(null);

  // Relics DB
  const [relicsDb, setRelicsDb] = useState([]);
  const [recommendedRelicsDb, setRecommendedRelicsDb] = useState([]);

  // Relics equipped on each side
  const [attackerRelics, setAttackerRelics] = useState(EMPTY_RELIC_SLOTS);
  const [defenderRelics, setDefenderRelics] = useState(EMPTY_RELIC_SLOTS);

  // Modal de selección de reliquia
  const [relicModal, setRelicModal] = useState({ side: null, level: null });

  // Bonus (pool de 136 puntos por lado)
  const [attackerBonusDraft, setAttackerBonusDraft] = useState(EMPTY_BONUS);
  const [defenderBonusDraft, setDefenderBonusDraft] = useState(EMPTY_BONUS);
  const [attackerBonusApplied, setAttackerBonusApplied] = useState(EMPTY_BONUS);
  const [defenderBonusApplied, setDefenderBonusApplied] = useState(EMPTY_BONUS);

  // Pestaña activa en el panel inferior (Relics / Bonus)
  const [attackerExtrasTab, setAttackerExtrasTab] = useState('relics');
  const [defenderExtrasTab, setDefenderExtrasTab] = useState('relics');

  // Error específico para avg def (defender)
  const [avgDefError, setAvgDefError] = useState(false);
  
    // NUEVO ESTADO: Toggles independientes
  const [showCustomOnlyAttacker, setShowCustomOnlyAttacker] = useState(false);
  const [showCustomOnlyDefender, setShowCustomOnlyDefender] = useState(false);

  // avgDef toggle para el defensor
  const [avgDef, setAvgDef] = useState(false);

  // Toggles para "Negate" del multiplicador elemental
  const [negateMain, setNegateMain] = useState(false);
  const [negateExtra, setNegateExtra] = useState(false);

  const miscrits = useMemo(() => {

    return [...baseMiscrits, ...customMiscrits];
  }, [baseMiscrits, customMiscrits]);
  
  // Listas filtradas según el toggle
  const miscritsAttackerDisplay = useMemo(() => {
    if (showCustomOnlyAttacker) return miscrits.filter(m => m.isCustom);
    return miscrits;
  }, [miscrits, showCustomOnlyAttacker]);

  const miscritsDefenderDisplay = useMemo(() => {
    if (showCustomOnlyDefender) return miscrits.filter(m => m.isCustom);
    return miscrits;
  }, [miscrits, showCustomOnlyDefender]);
  
  const [attackerName, setAttackerName] = useState('');
  const [defenderName, setDefenderName] = useState('');
  const [aStats, setAStats] = useState(defaultStats);
  const [dStats, setDStats] = useState(defaultStats);

  // Stats visibles (base + reliquias)
  const aStatsWithRelics = useMemo(
    () => applyBonusStats(
      applyRelicStats(aStats, attackerRelics, relicsDb),
      attackerBonusApplied
    ),
    [aStats, attackerRelics, relicsDb, attackerBonusApplied]
  );

  const dStatsWithRelics = useMemo(
    () => applyBonusStats(
      applyRelicStats(dStats, defenderRelics, relicsDb),
      defenderBonusApplied
    ),
    [dStats, defenderRelics, relicsDb, defenderBonusApplied]
  );


  // Setter especial para editar el card (edita base, no la suma de reliquias)
  const setAStatsFromPanel = useCallback((updater) => {
    setAStats(prevBase => {
      const combinedBefore = applyBonusStats(
        applyRelicStats(prevBase, attackerRelics, relicsDb),
        attackerBonusApplied
      );
      const nextCombined = typeof updater === 'function' ? updater(combinedBefore) : updater;
      const withoutRelics = subtractRelicStats(nextCombined, attackerRelics, relicsDb);
      const baseOnly = subtractBonusStats(withoutRelics, attackerBonusApplied);
      return baseOnly;
    });
  }, [attackerRelics, relicsDb, attackerBonusApplied]);

  const setDStatsFromPanel = useCallback((updater) => {
    setDStats(prevBase => {
      const combinedBefore = applyBonusStats(
        applyRelicStats(prevBase, defenderRelics, relicsDb),
        defenderBonusApplied
      );
      const nextCombined = typeof updater === 'function' ? updater(combinedBefore) : updater;
      const withoutRelics = subtractRelicStats(nextCombined, defenderRelics, relicsDb);
      const baseOnly = subtractBonusStats(withoutRelics, defenderBonusApplied);
      return baseOnly;
    });
  }, [defenderRelics, relicsDb, defenderBonusApplied]);


  
  // => Tab por defecto ENHANCED
  const [tab, setTab] = useState('enhanced');
  const [selected, setSelected] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true); 
  const [dbError, setDbError] = useState(null); 

  // Cargar DB
  const processAndSetMiscrits = (parsed) => {
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

  const handleSaveCustom = useCallback((newMiscrit) => {
    setCustomMiscrits(prev => {
      let newList = prev;
      const isRenaming = miscritToEdit && miscritToEdit.name !== newMiscrit.name;
      if (isRenaming) {
        newList = prev.filter(m => m.name !== miscritToEdit.name);
        newList.push(newMiscrit);
      } else {
        const existingIndex = prev.findIndex(m => m.name === newMiscrit.name);
        if (existingIndex > -1) newList = prev.map(m => m.name === newMiscrit.name ? newMiscrit : m);
        else newList = [...prev, newMiscrit];
      }
      saveCustomMiscrits(newList);
      return newList;
    });
    setAttackerName(newMiscrit.name);
    setAStats(newMiscrit.stats);
  }, [miscritToEdit]);

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

  // Auto load
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

  // Cargar DB de reliquias y recommended
  useEffect(() => {
async function loadRelics() {
  try {
    const resp = await fetch(`./${RELICS_DB_FILENAME}`);
    if (!resp.ok) return;
    const parsed = await resp.json();
    // Formato esperado: { "relics": [ ... ] } o array directo
    const list = Array.isArray(parsed.relics)
      ? parsed.relics
      : (Array.isArray(parsed) ? parsed : []);

    const normalized = list.map(r => ({
      // En tu relics.json las claves son: name, level, icon, stats
      name: r.name || r.nombre || '',
      level: Number(r.level),
      stats: r.stats || {},
      png: r.icon || r.png || ''
    }));

    setRelicsDb(normalized);
  } catch (err) {
    console.error('Error loading relics DB:', err);
  }
}

    async function loadRecommended() {
      try {
        const resp = await fetch(`./${RECOMMENDED_DB_FILENAME}`);
        if (!resp.ok) return;
        const parsed = await resp.json();
        // Formato esperado: { "recommended": [ ... ] } o array directo
        const list = Array.isArray(parsed.recommended) ? parsed.recommended : (Array.isArray(parsed) ? parsed : []);
        setRecommendedRelicsDb(list);
      } catch (err) {
        console.error('Error loading recommended relics DB:', err);
      }
    }

    loadRelics();
    loadRecommended();
  }, []);


  // Carga manual (backup)
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

  // Sync selección atacante
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

  // Sync selección defensor
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

  const miscritsAll = miscrits;
  const attacker = useMemo(()=> miscritsAll.find(m=>m.name===attackerName) || miscritsAll[0] || null, [miscritsAll, attackerName]);
  const defender = useMemo(()=> miscritsAll.find(m=>m.name===defenderName) || miscritsAll[1] || miscritsAll[0] || null, [miscritsAll, defenderName]);

  const handleAttackerSelect = useCallback((name) => {
    setAttackerName(name);
    const selectedMiscrit = miscritsAll.find(m => m.name === name);
    if (selectedMiscrit) setAStats({ ...(selectedMiscrit.stats || defaultStats) });
  }, [miscritsAll, defaultStats]);

  const handleDefenderSelect = useCallback((name) => {
    setDefenderName(name);
    const selectedMiscrit = miscritsAll.find(m => m.name === name);
    if (selectedMiscrit) setDStats({ ...(selectedMiscrit.stats || defaultStats) });
  }, [miscritsAll, defaultStats]);

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

  const mapAvgValue = (base, kind) => {
    const elemMap = { 60:85, 72:99, 83:112, 95:127, 107:141 };
    const physMap = { 60:78, 72:93, 83:108, 95:124, 107:139 };
    const lookup = (kind === 'ED') ? elemMap : physMap;
    if (base !== undefined && base !== null) {
      const intBase = Number(base);
      if (lookup[intBase]) return lookup[intBase];
    }
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
    return base;
  };


const handleSwap = useCallback(() => {
  // nombres y stats actuales
  const tempName = attackerName;
  const tempStats = aStats;
  const tempRelics = attackerRelics;
  const tempBonusDraft = attackerBonusDraft;
  const tempBonusApplied = attackerBonusApplied;

  // Miscrits actuales de cada lado
  const attackerMiscrit = miscritsAll.find(m => m.name === attackerName);
  const defenderMiscrit = miscritsAll.find(m => m.name === defenderName);

  // Si el ATTACKER tiene activado "show custom only"
  // y del lado DEFENDER hay un miscrit base (no custom),
  // al swappear ese base pasaría al lado custom -> desactivamos el toggle.
  if (showCustomOnlyAttacker && defenderMiscrit && !defenderMiscrit.isCustom) {
    setShowCustomOnlyAttacker(false);
  }

  // Si el DEFENDER tiene activado "show custom only"
  // y del lado ATTACKER hay un miscrit base,
  // al swappear ese base pasaría al lado custom -> desactivamos el toggle.
  if (showCustomOnlyDefender && attackerMiscrit && !attackerMiscrit.isCustom) {
    setShowCustomOnlyDefender(false);
  }

  // Swap de nombres, stats y reliquias
  setAttackerName(defenderName);
  setAStats(dStats);
  setAttackerRelics(defenderRelics);
  setAttackerBonusDraft(defenderBonusDraft);
  setAttackerBonusApplied(defenderBonusApplied);

  setDefenderName(tempName);
  setDStats(tempStats);
  setDefenderRelics(tempRelics);
  setDefenderBonusDraft(tempBonusDraft);
  setDefenderBonusApplied(tempBonusApplied);

  setCollapsed(false);
}, [
  attackerName, defenderName,
  aStats, dStats,
  attackerRelics, defenderRelics,
  attackerBonusDraft, defenderBonusDraft,
  attackerBonusApplied, defenderBonusApplied,
  miscritsAll,
  showCustomOnlyAttacker, showCustomOnlyDefender,
  setShowCustomOnlyAttacker, setShowCustomOnlyDefender
]);
// === AVG DEF TOGGLE HANDLER (NUEVO) ===
const handleToggleAvgDef = () => {
  if (!defender) return;

  const base = defender.stats || defaultStats;

  // Valores objetivo (avg)
  const mappedED = mapAvgValue(base.ED, 'ED');
  const mappedPD = mapAvgValue(base.PD, 'PD');

  // BONUS que hay que sumar para llegar a esos valores
  const deltaED = Math.max(0, mappedED - Number(base.ED ?? 0));
  const deltaPD = Math.max(0, mappedPD - Number(base.PD ?? 0));

  const costED = deltaED;
  const costPD = deltaPD;

  // Solo contamos lo que ya está usando el pool en HP/EA/PA/SPD
  const otherUsed =
    (defenderBonusDraft.HP ?? 0) +
    (defenderBonusDraft.EA ?? 0) +
    (defenderBonusDraft.PA ?? 0) +
    (defenderBonusDraft.SPD ?? 0);

  const totalIfApplied = otherUsed + costED + costPD;

  if (!avgDef) {
    // ACTIVAR
    if (totalIfApplied > BONUS_POOL) {
      setAvgDefError(true);
      return;
    }
    setAvgDef(true);
    setAvgDefError(false);

    // Escribimos el bonus SOLO de defensas en el borrador
    setDefenderBonusDraft(prev => ({
      ...prev,
      ED: costED,
      PD: costPD,
    }));

    // Y lo aplicamos SOLO en defensas
    setDefenderBonusApplied(prev => ({
      ...prev,
      ED: costED,
      PD: costPD,
    }));

  } else {
    // DESACTIVAR → volver defensas de bonus a 0
    setAvgDef(false);
    setAvgDefError(false);

    setDefenderBonusDraft(prev => ({
      ...prev,
      ED: 0,
      PD: 0,
    }));

    setDefenderBonusApplied(prev => ({
      ...prev,
      ED: 0,
      PD: 0,
    }));
  }
};



  const refreshAttacker = useCallback(() => {
    if (!attacker) return;
    setAStats({ ...(attacker.stats || defaultStats) });
  }, [attacker]);

  const refreshDefender = useCallback(() => {
    if (!defender) return;
    setDStats({ ...(defender.stats || defaultStats) });
  }, [defender]);

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

  useEffect(()=>{
    setSelected(prev => {
      if (!prev) return attacks[0] || null;
      const found = attacks.find(a => a.name === prev.name);
      return found || (attacks[0] || null);
    });
  }, [attacks, attackerName]);

  const result = useMemo(() => {
    if (!selected || !attacker || !defender) return null;

    const defenderElements = defender.elements || defender.type || defender.element;
    const atkElem = (selected.element || 'physical').toLowerCase();

    // --- Main attack ---
    let mainElemMul = elementMultiplier(atkElem, defenderElements);
    if (negateMain) mainElemMul = 1;

    const mainIsPhysical = atkElem === 'physical' || atkElem === 'neutral';
    const mainAtkStat = mainIsPhysical ? (aStatsWithRelics.PA ?? 0) : (aStatsWithRelics.EA ?? 0);
    const mainDefStat = mainIsPhysical ? (dStatsWithRelics.PD ?? 0) : (dStatsWithRelics.ED ?? 0);
    const mainAp = selected.ap || 0;

    const mainPer = computePerHit(mainAp, mainAtkStat, mainDefStat, mainElemMul);
    const mainHits = Math.max(1, selected.hits || 1);
    const mainTotal = {
      min: mainPer.min * mainHits,
      avg: mainPer.avg * mainHits,
      max: mainPer.max * mainHits,
    };

    const mainResult = {
      per: mainPer,
      hits: mainHits,
      total: mainTotal,
      elemMul: mainElemMul,
      atkdefRatio: (mainAtkStat / Math.max(1, mainDefStat)).toFixed(2),
      element: atkElem,
      ap: mainAp,
      name: selected.name || 'Main Attack',
    };

    // --- Extra / chained attack ---
    let extraResult = null;
    if (selected.chained) {
      const ch = selected.chained;
      const chElem = (ch.element || atkElem || 'physical').toLowerCase();

      let chElemMul = elementMultiplier(chElem, defenderElements);
      if (negateExtra) chElemMul = 1;

      const chIsPhysical = chElem === 'physical' || chElem === 'neutral';
      const chAtkStat = chIsPhysical ? (aStatsWithRelics.PA ?? 0) : (aStatsWithRelics.EA ?? 0);
      const chDefStat = chIsPhysical ? (dStatsWithRelics.PD ?? 0) : (dStatsWithRelics.ED ?? 0);
      const chAp = ch.ap || 0;

      const chPer = computePerHit(chAp, chAtkStat, chDefStat, chElemMul);
      const chHits = Math.max(1, ch.hits || 1);
      const chTotal = {
        min: chPer.min * chHits,
        avg: chPer.avg * chHits,
        max: chPer.max * chHits,
      };

      extraResult = {
        per: chPer,
        hits: chHits,
        total: chTotal,
        elemMul: chElemMul,
        atkdefRatio: (chAtkStat / Math.max(1, chDefStat)).toFixed(2),
        element: chElem,
        ap: chAp,
        name: ch.name || 'Extra Hit',
      };
    }

    return { main: mainResult, extra: extraResult };
  }, [selected, attacker, defender, aStatsWithRelics, dStatsWithRelics, negateMain, negateExtra]);


  return (
    <div className="max-w-screen-xl mx-auto">
      {/* MODALS */}
      {showCustomizer && (
        <MiscritCustomizerModal 
          miscrits={miscritsAll} 
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
      {relicModal.side && (
        <RelicPickerModal
          side={relicModal.side}
          level={relicModal.level}
          relics={relicsDb}
          equippedSlots={relicModal.side === 'attacker' ? attackerRelics : defenderRelics}
          onSelect={(nameOrNull) => {
            if (relicModal.side === 'attacker') {
              setAttackerRelics(prev => ({ ...(prev || {}), [relicModal.level]: nameOrNull }));
            } else if (relicModal.side === 'defender') {
              setDefenderRelics(prev => ({ ...(prev || {}), [relicModal.level]: nameOrNull }));
            }
            setRelicModal({ side: null, level: null });
          }}
          onClose={() => setRelicModal({ side: null, level: null })}
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
              onClick={() => miscritsAll.length > 0 && setShowCustomizer(true)} 
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
          
          {/* ATTACKER PANEL (Col 1) */}
          <div className="flex flex-col">
            <div className="flex justify-between items-center h-[44px] mb-2">
              <label className="block text-sm text-zinc-400">Attacker</label>
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
                disabled={miscritsAll.length === 0} 
                onChange={handleAttackerSelect} 
                placeholder="Search attacker..." 
              />
            </div>
            <MiscritPanel
              title="Attacker ·"
              miscrit={attacker}
              stats={aStatsWithRelics}
              setStats={setAStatsFromPanel}
              disabled={miscritsAll.length === 0}
              onRefresh={refreshAttacker}
            />
            <RelicSlotsPanel
  miscrit={attacker}
  equippedSlots={attackerRelics}
  relics={relicsDb}
  recommendedDb={recommendedRelicsDb}
  onOpenSlot={(lvl) => setRelicModal({ side: 'attacker', level: lvl })}
  setEquippedSlots={setAttackerRelics}
  mode={attackerExtrasTab}
  onModeChange={setAttackerExtrasTab}
  bonusDraft={attackerBonusDraft}
  setBonusDraft={setAttackerBonusDraft}
  bonusApplied={attackerBonusApplied}
  setBonusApplied={setAttackerBonusApplied}
/> 
          </div>
          
          {/* DEFENDER PANEL (Col 2) */}
          <div className="flex flex-col">
            <div className="flex justify-between items-center h-[44px] mb-2">
              <label className="block text-sm text-zinc-400">Defender</label>
              <div className="flex items-center gap-3 mr-3">
                <ToggleSwitch 
                  checked={avgDef} 
                  onChange={handleToggleAvgDef} 
                  label="avg def"
                />
                {avgDefError && (
                  <div className="text-red-400 text-xs mt-1">
                    exceeds the limits
                  </div>
                )}

              </div>
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
                disabled={miscritsAll.length === 0} 
                onChange={handleDefenderSelect} 
                placeholder="Search defender..." 
              />
            </div>
            <MiscritPanel
              title="Defender ·"
              miscrit={defender}
              stats={dStatsWithRelics}
              setStats={setDStatsFromPanel}
              disabled={miscritsAll.length === 0}
              onRefresh={refreshDefender}
            />
            <RelicSlotsPanel
  miscrit={defender}
  equippedSlots={defenderRelics}
  relics={relicsDb}
  recommendedDb={recommendedRelicsDb}
  onOpenSlot={(lvl) => setRelicModal({ side: 'defender', level: lvl })}
  setEquippedSlots={setDefenderRelics}
  mode={defenderExtrasTab}
  onModeChange={setDefenderExtrasTab}
  bonusDraft={defenderBonusDraft}
  setBonusDraft={setDefenderBonusDraft}
  bonusApplied={defenderBonusApplied}
  setBonusApplied={setDefenderBonusApplied}
/>

          </div>
          
          {/* ATTACK & RESULTS (Col 3) */}
          <div className="col-span-1 flex flex-col gap-6"> 
            <div className="h-[34px]"></div> 
            
            {/* ATTACK PANEL */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-full flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Attacks of {attacker?.name||'—'} ({tab})</h3>
                  <button onClick={handleSwap} disabled={miscritsAll.length === 0} className="text-zinc-400 hover:text-fuchsia-400 transition ml-4 disabled:opacity-30 disabled:cursor-not-allowed" title="Swap Miscrits and Stats">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right-left"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
                  </button>
                </div>
              </div>
              
              <div className="mb-4 pt-2">
                <button onClick={()=>setTab('base')} disabled={miscritsAll.length === 0} className={`px-3 py-1 rounded-full mr-2 disabled:opacity-30 ${tab==='base' ? 'bg-fuchsia-600 text-white' : 'bg-[#101214] text-zinc-300'}`}>Base</button>
                <button onClick={()=>setTab('enhanced')} disabled={miscritsAll.length === 0} className={`px-3 py-1 rounded-full disabled:opacity-30 ${tab==='enhanced' ? 'bg-fuchsia-600 text-white' : 'bg-[#101214] text-zinc-300'}`}>Enhanced</button>
              </div>

              {!collapsed && (
                <ul className="space-y-3 max-h-[44vh] overflow-auto">
                  {attacks.map(atk => <AttackItemCompact key={atk.name} atk={atk} disabled={miscritsAll.length === 0} onClick={() => { setSelected(atk); setCollapsed(true); }} active={selected && selected.name===atk.name} />)}
                  {attacks.length===0 && <li className="text-zinc-400">No attacks available</li>}
                </ul>
              )}

              {collapsed && selected && (
                <div className="mt-3">
                  <div className="rounded-lg border p-3 border-[#2B2F36] bg-[#0f1114]">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
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
                      <div className="font-semibold">
                        {selected.name} · AP: {selected.ap}
                        {selected.hits > 1 ? ` × ${selected.hits}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm text-zinc-400 mb-3">
                      <div>
                        Elemental multiplier:{' '}
                        <strong className="text-white">{result.main.elemMul.toFixed(2)}</strong>
                        <br />
                        Atk/Def ratio:{' '}
                        <strong className="text-white">{result.main.atkdefRatio}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNegateMain(prev => !prev)}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          negateMain
                            ? 'bg-fuchsia-600 text-white'
                            : 'bg-[#202227] text-zinc-200 hover:bg-[#262a33]'
                        }`}
                      >
                        Negate
                      </button>
                    </div>

                    {/* Per-hit info solo si hay múltiples golpes */}
                    {result.main.hits > 1 && (
                      <div className="mt-2 text-sm text-zinc-400 space-y-1">
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

                    {/* with true damage (texto adicional) */}
                    <div className="mt-2 text-sm opacity-80">
                      {(() => {
                        const withTD = addTrueDamageToRange(result.main.total, selected);
                        return withTD ? (
                          <>
                            with true damage: min: {withTD.min} · avg: {withTD.avg} · max: {withTD.max}
                          </>
                        ) : null;
                      })()}
                    </div>
                  </div>

                  {/* --- Hits to KO (solo ataque principal) --- */}
                  {(() => {
                    if (!defender || !result?.main?.total) return null;
                    const withTD = addTrueDamageToRange(result.main.total, selected);
                    const avgWithTD = withTD ? withTD.avg : result.main.total.avg;
                    const hp = Number(dStatsWithRelics?.HP || 0);
                    if (!avgWithTD || avgWithTD <= 0 || hp <= 0) return null;
                    const hits = Math.ceil(hp / avgWithTD);
                    return (
                      <div className="mb-4 p-3 rounded-lg border border-zinc-700/50 bg-zinc-900/50">
                        <div className="text-sm text-zinc-400">Hits to KO:</div>
                        <div className="text-2xl font-bold text-white">≈{hits}</div>
                      </div>
                    );
                  })()}

                  {/* --- Extra Attack Block --- */}
                  {result.extra && (
                    <div className="mt-2">
                      <div className="flex items-center gap-3 mb-2">
                        <Chip tone={toneByElement(result.extra.element)}>{result.extra.element}</Chip>
                        <div className="font-semibold">
                          {result.extra.name} · AP: {result.extra.ap}
                          {result.extra.hits > 1 ? ` × ${result.extra.hits}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm text-zinc-400 mb-3">
                        <div>
                          Elemental multiplier:{' '}
                          <strong className="text-white">{result.extra.elemMul.toFixed(2)}</strong>
                          <br />
                          Atk/Def ratio:{' '}
                          <strong className="text-white">{result.extra.atkdefRatio}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNegateExtra(prev => !prev)}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            negateExtra
                              ? 'bg-fuchsia-600 text-white'
                              : 'bg-[#202227] text-zinc-200 hover:bg-[#262a33]'
                          }`}
                        >
                          Negate
                        </button>
                      </div>

                      <div className="text-sm text-zinc-400 font-medium space-y-1">
                        <div>Damage:</div>
                        <div className="text-white">
                          Min: {result.extra.per.min}
                          <span className="mx-2">·</span>Avg: {result.extra.per.avg}
                          <span className="mx-2">·</span>Max: {result.extra.per.max}
                        </div>
                      </div>

                      {/* TOTAL damage (base + extra) */}
                      <div className="mt-4 pt-4 border-t border-zinc-700/50">
                        <div className="text-sm text-zinc-300 font-medium">TOTAL DAMAGE (Base + Extra)</div>
                        {(() => {
                          const total = sumTriples(result.main.total, result.extra.total);
                          return (
                            <div className="mt-1 text-white text-lg font-bold">
                              Min: {total.min}
                              <span className="mx-2">·</span>Avg: {total.avg}
                              <span className="mx-2">·</span>Max: {total.max}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* --- Hits to KO usando daño TOTAL (base + extra) --- */}
                  {result.extra && (() => {
                    if (!defender || !result.main?.total || !result.extra?.total) return null;

                    const mainRangeWithTD =
                      addTrueDamageToRange(result.main.total, selected) || result.main.total;

                    const chainedAttack = selected.chained || null;
                    const extraRangeWithTD =
                      (chainedAttack && addTrueDamageToRange(result.extra.total, chainedAttack)) ||
                      result.extra.total;

                    const totalWithTD = sumTriples(mainRangeWithTD, extraRangeWithTD);
                    const avgTotal = totalWithTD.avg;

                    const hp = Number(dStatsWithRelics?.HP || 0);
                    if (!avgTotal || avgTotal <= 0 || hp <= 0) return null;

                    const hitsTotal = Math.ceil(hp / avgTotal);

                    return (
                      <div className="mt-4 p-3 rounded-lg border border-zinc-700/50 bg-zinc-900/50">
                        <div className="text-sm text-zinc-400">Hits to KO:</div>
                        <div className="text-2xl font-bold text-white">≈{hitsTotal}</div>
                      </div>
                    );
                  })()}

                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* footer notes removed */}
    </div>
  );
}

export default App;
