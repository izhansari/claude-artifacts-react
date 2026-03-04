import React, { useState, useMemo, useRef, useCallback, useContext, createContext, useEffect } from "react";

// ─── Shopify Config ───────────────────────────────────────────────────────────
// Token and store are set as Vercel environment variables — not stored here.
// See: Vercel Dashboard → Your Project → Settings → Environment Variables
// Add: SHOPIFY_STORE = your-store.myshopify.com
//      SHOPIFY_TOKEN = shpat_xxxxxxxxxxxx
// ─────────────────────────────────────────────────────────────────────────────

// ─── Product Catalog ──────────────────────────────────────────────────────────
const SKU_MAP = {
  "H-MD-WP":    "Medjool (Palestine) 11lbs — With Pits",
  "H-MD-NP":    "Medjool (Palestine) No Pits",
  "G-CC-R-111": "Crown Core",       "G-CC-L-112": "Crown Core",
  "G-DC-R-121": "Desert Crunch",    "G-DC-L-122": "Desert Crunch",
  "G-VS-R-131": "Velvet Sands",     "G-VS-L-132": "Velvet Sands",
  "G-OO-R-141": "Oasis Orchard",    "G-OO-L-142": "Oasis Orchard",
  "G-HB-R-151": "Harvest Blush",    "G-HB-L-152": "Harvest Blush",
  "G-GT-R-161": "Golden Threads",   "G-GT-L-162": "Golden Threads",
  "C-PH-R-211": "Pure Harvest",     "C-PH-L-212": "Pure Harvest",
  "C-OS-R-221": "Orchard Select",   "C-OS-L-222": "Orchard Select",
  "C-BB-R-231": "Balanced Bounty",  "C-BB-L-232": "Balanced Bounty",
  "C-CM-R-241": "Caravan Medley",   "C-CM-L-242": "Caravan Medley",
  "V-CA-R-411": "The Classic Atelier",
  "V-IS-R-421": "The Indulgent Society",
  "V-FF-R-431": "The Fresh & Floral",
  "V-GA-R-451": "The Grand Assortment",
  "V-IE-R-441": "The Ivory Edit",
};

const COLLECTION_GROUPS = [
  { label:"Harvest", prefix:"H-", pairs:[
    ["Medjool 11lbs — With Pits", "H-MD-WP", null],
    ["Medjool 11lbs — No Pits",   "H-MD-NP", null],
  ]},
  { label:"Gourmet", prefix:"G-", pairs:[
    ["Crown Core","G-CC-R-111","G-CC-L-112"],["Desert Crunch","G-DC-R-121","G-DC-L-122"],
    ["Velvet Sands","G-VS-R-131","G-VS-L-132"],["Oasis Orchard","G-OO-R-141","G-OO-L-142"],
    ["Harvest Blush","G-HB-R-151","G-HB-L-152"],["Golden Threads","G-GT-R-161","G-GT-L-162"],
  ]},
  { label:"Caravan", prefix:"C-", pairs:[
    ["Pure Harvest","C-PH-R-211","C-PH-L-212"],["Orchard Select","C-OS-R-221","C-OS-L-222"],
    ["Balanced Bounty","C-BB-R-231","C-BB-L-232"],["Caravan Medley","C-CM-R-241","C-CM-L-242"],
  ]},
  { label:"Velour", prefix:"V-", pairs:[
    ["The Classic Atelier","V-CA-R-411",null],["The Indulgent Society","V-IS-R-421",null],
    ["The Fresh & Floral","V-FF-R-431",null],["The Grand Assortment","V-GA-R-451",null],
    ["The Ivory Edit","V-IE-R-441",null],
  ]},
];

const COLLECTION_COLORS = {
  "H-":{ accent:"#84CC16", light:"#F7FEE7", border:"#BEF264", text:"#3F6212", muted:"#D9F99D" },
  "G-":{ accent:"#F59E0B", light:"#FFFBEB", border:"#FDE68A", text:"#78350F", muted:"#FEF3C7" },
  "C-":{ accent:"#8B5CF6", light:"#F5F3FF", border:"#DDD6FE", text:"#4C1D95", muted:"#EDE9FE" },
  "V-":{ accent:"#EC4899", light:"#FDF2F8", border:"#FBCFE8", text:"#831843", muted:"#FCE7F3" },
};

function getCol(sku) {
  const p = Object.keys(COLLECTION_COLORS).find(p => sku && sku.startsWith(p));
  return p ? COLLECTION_COLORS[p] : { accent:"#94A3B8", light:"#F8FAFC", border:"#E2E8F0", text:"#475569", muted:"#F1F5F9" };
}

// ─── Box Rules Engine ─────────────────────────────────────────────────────────
// Each rule has:
//   id, name (display), dimensions (string), color, priority (lower = checked first),
//   conditions: array of condition objects evaluated top-to-bottom, first match wins
//
// Condition object:
//   { skuCategories: [...], minQty, maxQty }
//   skuCategories: "gourmet-reg" | "gourmet-grand" | "velour" | "caravan" | "harvest" | "any"
//
// The engine classifies each item in an order, then checks rules in priority order.
// First matching rule wins. If no rule matches → "TBD".

const DEFAULT_BOX_RULES = [
  {
    id: "box-small",
    name: "Small Box",
    dimensions: "10 × 8 × 4",
    color: "#3B82F6",
    priority: 1,
    note: "Fits 1–2 Regular (Gourmet or Velour) items",
    conditions: [
      // All items must be gourmet-reg or velour, and total qty 1–2
      { require: ["gourmet-reg","velour"], forbid: ["gourmet-grand","caravan","harvest"], minTotal: 1, maxTotal: 2 },
    ],
  },
  {
    id: "box-medium",
    name: "Medium Box",
    dimensions: "10 × 10 × 4",
    color: "#8B5CF6",
    priority: 2,
    note: "Fits 1–2 Grand (Gourmet) items; or mixed Regular+Grand",
    conditions: [
      // Has at least one grand item, no caravan/harvest
      { require: ["gourmet-grand"], forbid: ["caravan","harvest"], minTotal: 1, maxTotal: 2 },
    ],
  },
  {
    id: "box-tbd",
    name: "Box TBD",
    dimensions: "—",
    color: "#F59E0B",
    priority: 99,
    note: "Caravan, Harvest, or mixed/oversized orders — box size not yet defined",
    conditions: [
      { require: ["any"], forbid: [], minTotal: 1, maxTotal: 999 },
    ],
  },
];

// Classify a SKU into a category string
function skuCategory(sku) {
  if (!sku) return "unknown";
  if (sku.startsWith("G-") && sku.includes("-R-")) return "gourmet-reg";
  if (sku.startsWith("G-") && sku.includes("-L-")) return "gourmet-grand";
  if (sku.startsWith("V-")) return "velour";
  if (sku.startsWith("C-")) return "caravan";
  if (sku.startsWith("H-")) return "harvest";
  return "unknown";
}

// Evaluate a single rule against an order's items
// Returns true if the rule matches
function ruleMatches(rule, categoryCounts, totalQty) {
  for (const cond of rule.conditions) {
    const { require, forbid, minTotal, maxTotal } = cond;

    // Check forbidden categories — if any present, no match
    const hasForbidden = forbid.some(cat => (categoryCounts[cat] || 0) > 0);
    if (hasForbidden) continue;

    // Check required categories — at least one must be present (or "any")
    const hasRequired = require.includes("any") ||
      require.some(cat => (categoryCounts[cat] || 0) > 0);
    if (!hasRequired) continue;

    // Check total qty bounds
    if (totalQty < minTotal || totalQty > maxTotal) continue;

    return true;
  }
  return false;
}

// Assign a box to an order given current rules
function assignBox(order, rules) {
  const categoryCounts = {};
  let totalQty = 0;
  for (const item of order.items) {
    const cat = skuCategory(item.sku);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + item.qty;
    totalQty += item.qty;
  }

  const sorted = [...rules].sort((a,b) => a.priority - b.priority);
  for (const rule of sorted) {
    if (rule.id === "box-tbd") continue; // handled as fallback
    if (ruleMatches(rule, categoryCounts, totalQty)) {
      return { rule, categoryCounts, totalQty };
    }
  }

  // Fallback: TBD
  const tbd = rules.find(r => r.id === "box-tbd") || rules[rules.length - 1];
  return { rule: tbd, categoryCounts, totalQty };
}

// ─── Quick-type parser ────────────────────────────────────────────────────────
const QUICK_ALIASES = {
  cc:["G-CC-R-111","G-CC-L-112"], dc:["G-DC-R-121","G-DC-L-122"],
  vs:["G-VS-R-131","G-VS-L-132"], oo:["G-OO-R-141","G-OO-L-142"],
  hb:["G-HB-R-151","G-HB-L-152"], gt:["G-GT-R-161","G-GT-L-162"],
  ph:["C-PH-R-211","C-PH-L-212"], os:["C-OS-R-221","C-OS-L-222"],
  bb:["C-BB-R-231","C-BB-L-232"], cm:["C-CM-R-241","C-CM-L-242"],
  ca:["V-CA-R-411",null], is:["V-IS-R-421",null],
  ff:["V-FF-R-431",null], ga:["V-GA-R-451",null],
  ie:["V-IE-R-441",null], md:["H-MD-WP",null], mdnp:["H-MD-NP",null],
};

// Build a flat lookup of all enterable SKU targets for autocomplete
// Each entry: { code, side, sku, label, colPrefix }
const SKU_ENTRIES = (() => {
  const entries = [];
  for (const [code, [regSku, grandSku]] of Object.entries(QUICK_ALIASES)) {
    if (regSku) entries.push({ code, side:"r", sku:regSku, label:SKU_MAP[regSku]||regSku, colPrefix:regSku.slice(0,2), size: grandSku ? "Regular" : null });
    if (grandSku) entries.push({ code, side:"g", sku:grandSku, label:SKU_MAP[grandSku]||grandSku, colPrefix:grandSku.slice(0,2), size: "Grand" });
  }
  return entries;
})();

// Parse a token like "4ccr" → { qty:4, code:"cc", side:"r" }
// Key fix: greedily match known codes first, then optional r/g suffix
function parseToken(token) {
  const t = token.toLowerCase().trim();
  // Extract leading digits
  const numMatch = t.match(/^(\d+)/);
  const qty = numMatch ? parseInt(numMatch[1]) : 0;
  const rest = numMatch ? t.slice(numMatch[1].length) : t;

  // Try to match a known code (longest first to avoid partial matches)
  const codes = Object.keys(QUICK_ALIASES).sort((a,b)=>b.length-a.length);
  for (const code of codes) {
    if (rest.startsWith(code)) {
      const after = rest.slice(code.length);
      // after must be empty, "r", or "g"
      if (after === "" || after === "r" || after === "g") {
        return { qty, code, side: after || null }; // null = no side specified
      }
    }
  }
  return null; // unrecognized
}

// Parse the full input string — returns pending items that need size resolution
// and direct updates for items where side is clear
function parseQuickInput(raw) {
  const updates = {}, errors = [], ambiguous = [];
  const tokens = raw.trim().split(/[\s,;]+/).filter(Boolean);

  for (const token of tokens) {
    const parsed = parseToken(token);
    if (!parsed) { errors.push(token); continue; }

    const { qty, code, side } = parsed;
    const skus = QUICK_ALIASES[code];
    if (!skus) { errors.push(token); continue; }
    const [regSku, grandSku] = skus;

    if (!grandSku) {
      // Single-size item — always reg
      if (regSku) updates[regSku] = qty;
    } else if (side === "r") {
      updates[regSku] = qty;
    } else if (side === "g") {
      updates[grandSku] = qty;
    } else {
      // No side specified — flag as ambiguous, needs resolution
      ambiguous.push({ token, qty, code, regSku, grandSku });
    }
  }
  return { updates, errors, ambiguous };
}

// ─── Smart Inventory Input ────────────────────────────────────────────────────
function QuickInput({ onApply }) {
  const [val, setVal]           = useState("");
  const [feedback, setFeedback] = useState(null);
  const [dropdown, setDropdown] = useState([]); // autocomplete suggestions
  const [activeIdx, setActiveIdx] = useState(-1); // keyboard-selected index
  const [pending, setPending]   = useState([]); // ambiguous items needing size pick
  const inputRef = useRef();

  // Live-parse the last token as user types → drive dropdown
  const handleChange = (e) => {
    const raw = e.target.value;
    setVal(raw);
    setFeedback(null);

    const tokens = raw.trim().split(/[\s,;]+/).filter(Boolean);
    const lastToken = tokens[tokens.length - 1] || "";
    if (!lastToken) { setDropdown([]); return; }

    // Try to parse last token
    const numMatch = lastToken.match(/^(\d+)/);
    const qty = numMatch ? parseInt(numMatch[1]) : 0;
    const rest = (numMatch ? lastToken.slice(numMatch[1].length) : lastToken).toLowerCase();

    if (!rest) { setDropdown([]); return; }

    // Find matching entries by prefix of code
    const matches = SKU_ENTRIES.filter(e =>
      e.code.startsWith(rest.replace(/[rg]$/, "")) ||
      (rest.length >= 2 && e.code === rest.replace(/[rg]$/, ""))
    ).slice(0, 8);

    setDropdown(matches.map(e => ({
      ...e, qty,
      display: `${qty > 0 ? qty : "?"}  ${e.size ? `${e.size} · ` : ""}${e.label}`,
      insertToken: `${qty > 0 ? qty : ""}${e.code}${e.size === "Grand" ? "g" : e.size === "Regular" ? "r" : ""}`,
    })));
    setActiveIdx(-1);
  };

  const selectSuggestion = (suggestion) => {
    // Replace the last token with the selected one
    const tokens = val.trim().split(/[\s,;]+/).filter(Boolean);
    tokens[tokens.length - 1] = suggestion.insertToken;
    setVal(tokens.join(" ") + " ");
    setDropdown([]);
    inputRef.current?.focus();
  };

  const apply = () => {
    if (!val.trim() && pending.length === 0) return;
    const { updates, errors, ambiguous } = parseQuickInput(val);

    if (ambiguous.length > 0) {
      // Show size picker for ambiguous items
      setPending(ambiguous.map(a => ({ ...a, regQty: a.qty, grandQty: a.qty, include: "both" })));
      // Apply the unambiguous ones immediately
      if (Object.keys(updates).length > 0) onApply(updates);
      setVal("");
      setDropdown([]);
      return;
    }

    onApply(updates);
    setFeedback({ applied: Object.keys(updates).length, errors });
    setVal("");
    setDropdown([]);
    setTimeout(() => setFeedback(null), 3500);
  };

  const resolvePending = (resolved) => {
    // resolved: array of { regSku, grandSku, regQty, grandQty, include }
    const updates = {};
    for (const item of resolved) {
      if ((item.include === "both" || item.include === "r") && item.regSku) updates[item.regSku] = item.regQty;
      if ((item.include === "both" || item.include === "g") && item.grandSku) updates[item.grandSku] = item.grandQty;
    }
    onApply(updates);
    setPending([]);
    setFeedback({ applied: Object.keys(updates).length, errors: [] });
    setTimeout(() => setFeedback(null), 3500);
  };

  // Pending resolution UI
  if (pending.length > 0) {
    return (
      <div style={{ marginBottom:"20px", background:"#fff", border:"2px solid #C9A84C", borderRadius:"12px", padding:"16px" }}>
        <div style={{ fontSize:"12px", fontWeight:700, color:"#78350F", marginBottom:"12px" }}>
          Choose sizes for ambiguous items — no suffix was given:
        </div>
        {pending.map((item, i) => {
          const col = getCol(item.regSku);
          const update = (field, val) => setPending(p => p.map((x,j) => j===i ? {...x,[field]:val} : x));
          return (
            <div key={item.token} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"10px 0", borderBottom: i < pending.length-1 ? "1px solid #F0EDEA" : "none", flexWrap:"wrap" }}>
              <div style={{ minWidth:"100px", fontWeight:700, fontSize:"13px", color:col.text }}>{SKU_MAP[item.regSku]||item.code.toUpperCase()}</div>
              {/* Size toggle */}
              <div style={{ display:"flex", gap:"5px" }}>
                {[["both","Both"],["r","Regular only"],["g","Grand only"]].map(([v,lbl]) => (
                  <button key={v} onClick={() => update("include", v)} style={{
                    padding:"4px 10px", borderRadius:"6px", fontSize:"11px", fontWeight:700, cursor:"pointer", border:"1.5px solid",
                    background: item.include===v ? col.accent : "transparent",
                    color: item.include===v ? "#fff" : col.text,
                    borderColor: item.include===v ? col.accent : col.border,
                  }}>{lbl}</button>
                ))}
              </div>
              {/* Qty inputs */}
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                {(item.include==="both"||item.include==="r") && (
                  <div style={{ display:"flex", alignItems:"center", gap:"4px" }}>
                    <span style={{ fontSize:"11px", color:"#78716C" }}>Reg:</span>
                    <input type="number" min="0" value={item.regQty} onChange={e=>update("regQty",parseInt(e.target.value)||0)}
                      style={{ width:"44px", padding:"3px 6px", border:"1.5px solid #E7E5E4", borderRadius:"6px", fontSize:"13px", fontFamily:"'DM Mono',monospace", textAlign:"center", outline:"none" }}/>
                  </div>
                )}
                {(item.include==="both"||item.include==="g") && item.grandSku && (
                  <div style={{ display:"flex", alignItems:"center", gap:"4px" }}>
                    <span style={{ fontSize:"11px", color:"#78716C" }}>Grand:</span>
                    <input type="number" min="0" value={item.grandQty} onChange={e=>update("grandQty",parseInt(e.target.value)||0)}
                      style={{ width:"44px", padding:"3px 6px", border:"1.5px solid #E7E5E4", borderRadius:"6px", fontSize:"13px", fontFamily:"'DM Mono',monospace", textAlign:"center", outline:"none" }}/>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div style={{ display:"flex", gap:"8px", marginTop:"12px" }}>
          <button onClick={() => resolvePending(pending)} style={{ background:"#C9A84C", color:"#1C1917", border:"none", borderRadius:"8px", padding:"7px 18px", fontSize:"13px", fontWeight:700, cursor:"pointer" }}>Apply</button>
          <button onClick={() => setPending([])} style={{ background:"none", border:"1px solid #D6D3CD", borderRadius:"8px", padding:"7px 14px", fontSize:"12px", cursor:"pointer", color:"#78716C" }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom:"20px" }}>
      <div style={{ display:"flex", gap:"8px", alignItems:"stretch" }}>
        <div style={{ flex:1, position:"relative" }}>
          <input
            ref={inputRef}
            value={val}
            onChange={handleChange}
            onKeyDown={e => {
              if (dropdown.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIdx(i => Math.min(i + 1, dropdown.length - 1));
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIdx(i => Math.max(i - 1, -1));
                  return;
                }
                if (e.key === "Enter" && activeIdx >= 0) {
                  e.preventDefault();
                  selectSuggestion(dropdown[activeIdx]);
                  return;
                }
                if (e.key === "Escape") { setDropdown([]); setActiveIdx(-1); return; }
              }
              if (e.key === "Enter") apply();
            }}
            onBlur={() => setTimeout(() => { setDropdown([]); setActiveIdx(-1); }, 150)}
            placeholder="e.g.  8gtr  3hbg  4ccr  5cmg  →  press Enter"
            style={{ width:"100%", padding:"11px 14px", fontFamily:"'DM Mono',monospace", fontSize:"14px", border:"2px solid #D6D3CD", borderRadius:"10px", outline:"none", background:"#fff", color:"#1C1917", transition:"border-color 0.15s" }}
            onFocus={e => e.target.style.borderColor="#C9A84C"}
          />
          {/* Autocomplete dropdown */}
          {dropdown.length > 0 && (
            <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#fff", border:"1.5px solid #C9A84C", borderRadius:"10px", boxShadow:"0 4px 16px rgba(0,0,0,0.1)", zIndex:50, overflow:"hidden" }}>
              {dropdown.map((s, i) => {
                const col = getCol(s.sku);
                const isActive = i === activeIdx;
                return (
                  <div key={s.sku} onMouseDown={() => selectSuggestion(s)} style={{
                    display:"flex", alignItems:"center", gap:"10px",
                    padding:"9px 14px", cursor:"pointer",
                    background: isActive ? col.light : i%2===0 ? "#fff" : "#FAFAF8",
                    borderBottom: i < dropdown.length-1 ? "1px solid #F0EDEA" : "none",
                    borderLeft: isActive ? `3px solid ${col.accent}` : "3px solid transparent",
                    transition:"background 0.08s",
                  }}
                  onMouseEnter={e=>{ setActiveIdx(i); }}
                  >
                    <span style={{ fontSize:"10px", fontWeight:700, color:col.text, background:col.muted, border:`1px solid ${col.border}`, borderRadius:"4px", padding:"1px 6px", fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>
                      {s.insertToken || s.code}
                    </span>
                    {s.size && <span style={{ fontSize:"11px", color:"#A8A29E", fontWeight:600 }}>{s.size}</span>}
                    <span style={{ fontSize:"13px", color:"#292524", fontWeight: s.qty > 0 ? 600 : 400 }}>
                      {s.qty > 0 ? <><span style={{ fontFamily:"'DM Mono',monospace", color:col.accent, fontWeight:700 }}>{s.qty}×</span> </> : ""}{s.label}
                    </span>
                  </div>
                );
              })}
              <div style={{ padding:"5px 14px", fontSize:"10px", color:"#A8A29E", background:"#F7F6F3", borderTop:"1px solid #F0EDEA" }}>
                Click to insert · append more tokens after
              </div>
            </div>
          )}
        </div>
        <button onClick={apply} style={{ background:"#C9A84C", color:"#1C1917", border:"none", borderRadius:"10px", padding:"0 20px", fontSize:"13px", fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>Apply</button>
      </div>

      {!feedback && (
        <div style={{ marginTop:"7px", fontSize:"11px", color:"#A8A29E", lineHeight:1.5 }}>
          Type <span style={{ fontFamily:"DM Mono,monospace", color:"#78716C" }}>[qty][code][r/g]</span> — always include r or g suffix to specify size · e.g. <span style={{ fontFamily:"DM Mono,monospace", color:"#78716C" }}>8gtr 3hbg 4ccr</span> · omit suffix to get a size picker
        </div>
      )}
      {feedback && (
        <div style={{ marginTop:"7px", display:"flex", gap:"10px", flexWrap:"wrap" }}>
          {feedback.applied > 0 && <span style={{ fontSize:"12px", color:"#059669", fontWeight:600 }}>✓ Updated {feedback.applied} SKU{feedback.applied!==1?"s":""}</span>}
          {feedback.errors.length > 0 && <span style={{ fontSize:"12px", color:"#DC2626" }}>✕ Unrecognized: {feedback.errors.join(", ")}</span>}
        </div>
      )}
    </div>
  );
}
function parseShopifyCSV(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const headers = parseCSVLine(lines[0]);
  const idx = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  const nameIdx=idx("Name"), emailIdx=idx("Email"), finIdx=idx("Financial Status"),
    ffIdx=idx("Fulfillment Status"), cancelIdx=idx("Cancelled at"), createdIdx=idx("Created at"),
    qtyIdx=idx("Lineitem quantity"), itemIdx=idx("Lineitem name"), skuIdx=idx("Lineitem sku"),
    shipNameIdx=idx("Shipping Name"), shipCityIdx=idx("Shipping City"), shipProvIdx=idx("Shipping Province"),
    notesIdx=idx("Notes");
  const orderMap = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (!cols[nameIdx]) continue;
    const orderId = cols[nameIdx];
    const financial = (cols[finIdx]||"").toLowerCase();
    const fulfill   = (cols[ffIdx]||"").toLowerCase();
    const cancelled = cols[cancelIdx]||"";
    const sku = (cols[skuIdx]||"").trim();
    const qty = parseInt(cols[qtyIdx])||0;
    if (cancelled||financial==="refunded"||financial==="voided"||fulfill==="fulfilled"||!sku||!qty) continue;
    if (!orderMap[orderId]) {
      const dateOnly = (cols[createdIdx]||"").split(" ")[0];
      const shipTo = [cols[shipNameIdx]||"", cols[shipCityIdx]||"", cols[shipProvIdx]||""].filter(Boolean).join(", ");
      orderMap[orderId] = { id:orderId, date:dateOnly, customer:cols[emailIdx]||"", shipTo, notes:cols[notesIdx]||"", items:[] };
    }
    const existing = orderMap[orderId].items.find(it=>it.sku===sku);
    if (existing) existing.qty += qty;
    else orderMap[orderId].items.push({ sku, qty, name:cols[itemIdx]||"" });
  }
  return Object.values(orderMap).filter(o=>o.items.length>0)
    .sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
}

function parseCSVLine(line) {
  const result=[]; let cur="", inQ=false;
  for (let i=0;i<line.length;i++) {
    const c=line[i];
    if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
    else if(c===','&&!inQ){result.push(cur);cur="";}
    else cur+=c;
  }
  result.push(cur); return result;
}

// ─── Fulfillment Engine ───────────────────────────────────────────────────────
function runFulfillment(orders, inventory) {
  const stock = {...inventory};
  const fulfilled=[], partial=[], unfulfillable=[];
  for (const order of orders) {
    const tempStock={...stock}; let canFulfill=true; const needed=[];
    for (const item of order.items) {
      const avail=tempStock[item.sku]||0;
      if(avail<item.qty){canFulfill=false;needed.push({sku:item.sku,needed:item.qty,have:avail});}
      else tempStock[item.sku]=avail-item.qty;
    }
    const partialItems=[], missingItems=[];
    for (const item of order.items) {
      if((stock[item.sku]||0)>=item.qty) partialItems.push(item);
      else missingItems.push({...item,have:stock[item.sku]||0});
    }
    if(canFulfill){ for(const item of order.items) stock[item.sku]=(stock[item.sku]||0)-item.qty; fulfilled.push({...order,status:"fulfill"}); }
    else if(partialItems.length>0) partial.push({...order,status:"partial",partialItems,missingItems});
    else unfulfillable.push({...order,status:"skip",missingItems:needed});
  }
  return {fulfilled,partial,unfulfillable,remainingStock:stock};
}

// ─── UI Components ────────────────────────────────────────────────────────────
// ─── Global Tooltip ───────────────────────────────────────────────────────────
const TooltipContext = createContext(null);

function TooltipLayer({ children }) {
  const [tip, setTip] = useState(null); // { x, y, info, name, sizeLabel }
  return (
    <TooltipContext.Provider value={setTip}>
      {children}
      {tip && (
        <div style={{
          position:"fixed", left:tip.x + 14, top:tip.y - 10,
          background:"#1C1917", color:"#F5EFE3",
          borderRadius:"8px", padding:"9px 12px",
          fontSize:"11px", fontFamily:"'DM Mono',monospace",
          boxShadow:"0 4px 20px rgba(0,0,0,0.55)",
          pointerEvents:"none", zIndex:2147483647,
          minWidth:"160px", lineHeight:"1.7",
          border:"1px solid #3D3530",
        }}>
          <div style={{fontWeight:700, fontSize:"12px", color:tip.col.accent, marginBottom:"5px", whiteSpace:"nowrap"}}>
            {tip.name}{tip.sizeLabel ? ` · ${tip.sizeLabel}` : ""}
          </div>
          <div style={{display:"grid", gridTemplateColumns:"auto auto", gap:"1px 12px"}}>
            <span style={{color:"#A8A29E"}}>Ordered</span>
            <span style={{textAlign:"right", fontWeight:700}}>{tip.info.ord}</span>
            <span style={{color:"#A8A29E"}}>Inv boxes</span>
            <span style={{textAlign:"right", fontWeight:700, color:tip.info.inv>0?"#86EFAC":"#F5EFE3"}}>{tip.info.inv}</span>
            <span style={{color:"#A8A29E"}}>Make boxes</span>
            <span style={{textAlign:"right", fontWeight:700, color:tip.info.toMake>0?"#FCD34D":"#6EE7B7"}}>{tip.info.toMake}</span>
            {tip.info.isGourmet && <>
              <span style={{color:"#A8A29E"}}>Dates needed</span>
              <span style={{textAlign:"right", fontWeight:700, color:tip.info.dates>0?"#FCA5A5":"#A8A29E"}}>{tip.info.dates ?? "—"}</span>
            </>}
          </div>
        </div>
      )}
    </TooltipContext.Provider>
  );
}

function SkuBadge({sku, qty, strikethrough=false, info=null}) {
  const setTip = useContext(TooltipContext);
  const col = getCol(sku);
  const isReg   = sku.includes("-R-");
  const isGrand = sku.includes("-L-");
  const sizeLabel = isReg ? "Reg" : isGrand ? "Grand" : null;
  const name = SKU_MAP[sku]||sku;

  return (
    <span
      onMouseEnter={e => info && setTip && setTip({ x: e.clientX, y: e.clientY, info, name, sizeLabel, col })}
      onMouseMove={e => info && setTip && setTip({ x: e.clientX, y: e.clientY, info, name, sizeLabel, col })}
      onMouseLeave={() => setTip && setTip(null)}
      style={{
        display:"inline-flex", alignItems:"center", gap:"4px",
        background: strikethrough?"#FEE2E2":col.muted, color: strikethrough?"#991B1B":col.text,
        border:`1px solid ${strikethrough?"#FCA5A5":col.border}`,
        borderRadius:"4px", padding:"2px 8px", fontSize:"11px", fontWeight:600,
        fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap",
        textDecoration: strikethrough?"line-through":"none", opacity: strikethrough?0.65:1,
        cursor:"default",
      }}>
      {qty>1&&<span style={{background:strikethrough?"#EF4444":col.accent,color:"#fff",borderRadius:"3px",padding:"0 4px",fontSize:"10px",marginRight:"1px"}}>×{qty}</span>}
      {name}
      {sizeLabel && <span style={{fontSize:"9px",opacity:0.7,marginLeft:"1px"}}>{sizeLabel}</span>}
    </span>
  );
}

function OrderCard({order, index, onMarkDone, isDone=false, skuInfo={}}) {
  const cfg = isDone ? {
    label:"✓ DONE", bg:"#F0FDF4", border:"#86EFAC", pill:"#DCFCE7", pillText:"#166534"
  } : {
    fulfill:{label:"✓ SHIP",  bg:"#ECFDF5",border:"#6EE7B7",pill:"#D1FAE5",pillText:"#065F46"},
    partial:{label:"◑ PARTIAL",bg:"#FFFBEB",border:"#FCD34D",pill:"#FEF3C7",pillText:"#92400E"},
    skip:   {label:"✕ HOLD", bg:"#FFF1F2",border:"#FCA5A5",pill:"#FEE2E2",pillText:"#991B1B"},
  }[order.status];

  return (
    <div style={{background:cfg.bg,border:`1.5px solid ${cfg.border}`,borderRadius:"10px",padding:"12px 15px",marginBottom:"6px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",animation:`fadeSlide 0.16s ease ${Math.min(index*0.02,0.35)}s both`,opacity:isDone?0.75:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"8px",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
          <span style={{fontWeight:700,fontSize:"13px",color:"#111",fontFamily:"'DM Mono',monospace"}}>{order.id}</span>
          <span style={{fontSize:"10px",color:"#999",background:"#F3F4F6",borderRadius:"3px",padding:"1px 5px"}}>{order.date}</span>
          <span style={{fontSize:"12px",color:"#555"}}>{order.shipTo}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
          <span style={{background:cfg.pill,color:cfg.pillText,padding:"2px 9px",borderRadius:"20px",fontSize:"10px",fontWeight:700,letterSpacing:"0.07em",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>{cfg.label}</span>
          {!isDone && onMarkDone && (
            <button onClick={()=>onMarkDone(order.id)} style={{
              background:"#1C1917",color:"#C9A84C",border:"1px solid #C9A84C",
              borderRadius:"6px",padding:"2px 9px",fontSize:"10px",fontWeight:700,
              cursor:"pointer",whiteSpace:"nowrap",letterSpacing:"0.04em",
            }}>✓ Mark Done</button>
          )}
          {isDone && onMarkDone && (
            <button onClick={()=>onMarkDone(order.id)} style={{
              background:"none",color:"#78716C",border:"1px solid #D6D3CD",
              borderRadius:"6px",padding:"2px 9px",fontSize:"10px",fontWeight:600,
              cursor:"pointer",whiteSpace:"nowrap",
            }}>↩ Undo</button>
          )}
        </div>
      </div>
      <div style={{marginTop:"7px",display:"flex",flexWrap:"wrap",gap:"5px"}}>
        {order.status==="partial" && !isDone
          ? <>{order.partialItems.map(it=><SkuBadge key={it.sku} sku={it.sku} qty={it.qty} info={skuInfo[it.sku]}/>)}{order.missingItems.map(it=><SkuBadge key={it.sku} sku={it.sku} qty={it.qty} strikethrough info={skuInfo[it.sku]}/>)}</>
          : order.items.map(it=><SkuBadge key={it.sku} sku={it.sku} qty={it.qty} info={skuInfo[it.sku]}/>)
        }
      </div>
      {!isDone&&(order.status==="partial"||order.status==="skip")&&(
        <div style={{marginTop:"5px",fontSize:"11px",color:order.status==="partial"?"#D97706":"#DC2626",fontStyle:"italic"}}>
          Need: {(order.missingItems||[]).map(i=>{const sz=i.sku.includes("-R-")?" Reg":i.sku.includes("-L-")?" Grand":"";return`${SKU_MAP[i.sku]||i.sku}${sz} (have ${i.have}, need ${i.needed||i.qty})`;}).join(" · ")}
        </div>
      )}
      {order.notes&&order.notes.trim()&&(
        <div style={{marginTop:"5px",fontSize:"11px",color:"#7C3AED",background:"#F5F3FF",borderRadius:"4px",padding:"3px 8px",display:"inline-block"}}>
          📝 {order.notes.trim()}
        </div>
      )}
    </div>
  );
}

function InlineStepper({value, onChange, col}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
      <button onClick={()=>onChange(Math.max(0,value-1))} style={{background:value>0?col.accent:"#E5E7EB",color:value>0?"#fff":"#9CA3AF",border:"none",borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"14px",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>−</button>
      <input type="number" min="0" value={value} onChange={e=>onChange(Math.max(0,parseInt(e.target.value)||0))}
        style={{width:"36px",textAlign:"center",fontSize:"14px",fontWeight:700,color:value>0?col.text:"#9CA3AF",background:"transparent",border:"none",outline:"none",fontFamily:"'DM Mono',monospace"}}/>
      <button onClick={()=>onChange(value+1)} style={{background:col.accent,color:"#fff",border:"none",borderRadius:"4px",width:"22px",height:"22px",cursor:"pointer",fontSize:"14px",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>+</button>
    </div>
  );
}

// old QuickInput replaced by new version above

// ─── Box Rule Editor ──────────────────────────────────────────────────────────
const CATEGORY_LABELS = {
  "gourmet-reg":"Gourmet Regular", "gourmet-grand":"Gourmet Grand",
  "velour":"Velour", "caravan":"Caravan", "harvest":"Harvest", "any":"Any"
};
const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

function RuleEditor({rules, onChange}) {
  const [editing, setEditing] = useState(null); // rule id being edited, or "new"
  const [draft, setDraft] = useState(null);

  const startEdit = (rule) => {
    setDraft(JSON.parse(JSON.stringify(rule)));
    setEditing(rule.id);
  };

  const startNew = () => {
    const newRule = {
      id: `rule-${Date.now()}`,
      name: "New Box",
      dimensions: "",
      color: "#64748B",
      priority: rules.length + 1,
      note: "",
      conditions: [{ require:["any"], forbid:[], minTotal:1, maxTotal:99 }],
    };
    setDraft(newRule);
    setEditing("new");
  };

  const save = () => {
    if (editing === "new") onChange([...rules, draft]);
    else onChange(rules.map(r => r.id === editing ? draft : r));
    setEditing(null); setDraft(null);
  };

  const remove = (id) => {
    if (id === "box-tbd") return; // can't delete fallback
    onChange(rules.filter(r => r.id !== id));
  };

  const setDraftField = (field, val) => setDraft(d => ({...d,[field]:val}));

  const setCondField = (ci, field, val) => setDraft(d => {
    const conds = [...d.conditions];
    conds[ci] = {...conds[ci],[field]:val};
    return {...d,conditions:conds};
  });

  const toggleCatIn = (ci, listKey, cat) => {
    const list = draft.conditions[ci][listKey] || [];
    const next = list.includes(cat) ? list.filter(c=>c!==cat) : [...list.filter(c=>c!=="any"), cat];
    setCondField(ci, listKey, next.length ? next : (listKey==="require" ? ["any"] : []));
  };

  if (editing !== null && draft) {
    return (
      <div style={{background:"#fff",border:"2px solid #C9A84C",borderRadius:"14px",padding:"20px",marginBottom:"16px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
          <h3 style={{margin:0,fontSize:"14px",fontWeight:700,color:"#292524"}}>{editing==="new"?"New Box Rule":"Edit Box Rule"}</h3>
          <button onClick={()=>{setEditing(null);setDraft(null);}} style={{background:"none",border:"1px solid #D6D3CD",borderRadius:"6px",padding:"3px 10px",fontSize:"12px",cursor:"pointer",color:"#78716C"}}>Cancel</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"14px"}}>
          {[["name","Box Name"],["dimensions","Dimensions (e.g. 10 × 8 × 4)"],["note","Note / description"]].map(([f,lbl])=>(
            <div key={f} style={{gridColumn:f==="note"?"1/-1":"auto"}}>
              <label style={{display:"block",fontSize:"11px",fontWeight:600,color:"#78716C",marginBottom:"4px"}}>{lbl}</label>
              <input value={draft[f]||""} onChange={e=>setDraftField(f,e.target.value)}
                style={{width:"100%",padding:"7px 10px",border:"1.5px solid #E7E5E4",borderRadius:"8px",fontSize:"13px",outline:"none",fontFamily:"'DM Sans',sans-serif"}}/>
            </div>
          ))}
          <div>
            <label style={{display:"block",fontSize:"11px",fontWeight:600,color:"#78716C",marginBottom:"4px"}}>Priority (lower = checked first)</label>
            <input type="number" min="1" value={draft.priority} onChange={e=>setDraftField("priority",parseInt(e.target.value)||1)}
              style={{width:"80px",padding:"7px 10px",border:"1.5px solid #E7E5E4",borderRadius:"8px",fontSize:"13px",outline:"none",fontFamily:"'DM Mono',monospace"}}/>
          </div>
          <div>
            <label style={{display:"block",fontSize:"11px",fontWeight:600,color:"#78716C",marginBottom:"4px"}}>Color</label>
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
              {["#3B82F6","#8B5CF6","#EC4899","#F59E0B","#10B981","#EF4444","#64748B","#F97316"].map(c=>(
                <button key={c} onClick={()=>setDraftField("color",c)} style={{width:"22px",height:"22px",borderRadius:"50%",background:c,border:draft.color===c?"3px solid #1C1917":"2px solid transparent",cursor:"pointer"}}/>
              ))}
            </div>
          </div>
        </div>

        {/* Conditions */}
        <div style={{marginBottom:"14px"}}>
          <div style={{fontSize:"12px",fontWeight:700,color:"#44403C",marginBottom:"8px"}}>Match Conditions</div>
          {draft.conditions.map((cond, ci) => (
            <div key={ci} style={{background:"#F7F6F3",borderRadius:"10px",padding:"12px 14px",marginBottom:"8px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"10px"}}>
                <div>
                  <div style={{fontSize:"10px",fontWeight:700,color:"#78716C",marginBottom:"5px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Must include (at least one)</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
                    {ALL_CATEGORIES.map(cat=>(
                      <button key={cat} onClick={()=>toggleCatIn(ci,"require",cat)} style={{
                        padding:"3px 8px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1.5px solid",
                        background: cond.require.includes(cat)?"#1C1917":"transparent",
                        color: cond.require.includes(cat)?"#fff":"#78716C",
                        borderColor: cond.require.includes(cat)?"#1C1917":"#D6D3CD",
                      }}>{CATEGORY_LABELS[cat]}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:"10px",fontWeight:700,color:"#78716C",marginBottom:"5px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Must NOT include</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
                    {ALL_CATEGORIES.filter(c=>c!=="any").map(cat=>(
                      <button key={cat} onClick={()=>toggleCatIn(ci,"forbid",cat)} style={{
                        padding:"3px 8px",borderRadius:"5px",fontSize:"11px",fontWeight:600,cursor:"pointer",border:"1.5px solid",
                        background: cond.forbid.includes(cat)?"#DC2626":"transparent",
                        color: cond.forbid.includes(cat)?"#fff":"#78716C",
                        borderColor: cond.forbid.includes(cat)?"#DC2626":"#D6D3CD",
                      }}>{CATEGORY_LABELS[cat]}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"12px",flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                  <label style={{fontSize:"11px",color:"#78716C",fontWeight:600}}>Total items:</label>
                  <input type="number" min="1" value={cond.minTotal} onChange={e=>setCondField(ci,"minTotal",parseInt(e.target.value)||1)}
                    style={{width:"44px",padding:"4px 6px",border:"1.5px solid #E7E5E4",borderRadius:"6px",fontSize:"12px",textAlign:"center",outline:"none",fontFamily:"'DM Mono',monospace"}}/>
                  <span style={{fontSize:"11px",color:"#A8A29E"}}>to</span>
                  <input type="number" min="1" value={cond.maxTotal} onChange={e=>setCondField(ci,"maxTotal",parseInt(e.target.value)||1)}
                    style={{width:"44px",padding:"4px 6px",border:"1.5px solid #E7E5E4",borderRadius:"6px",fontSize:"12px",textAlign:"center",outline:"none",fontFamily:"'DM Mono',monospace"}}/>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{display:"flex",gap:"8px",justifyContent:"flex-end"}}>
          <button onClick={save} style={{background:"#C9A84C",color:"#1C1917",border:"none",borderRadius:"8px",padding:"8px 20px",fontSize:"13px",fontWeight:700,cursor:"pointer"}}>Save Rule</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{marginBottom:"16px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
        <div style={{fontSize:"13px",fontWeight:600,color:"#57534E"}}>Box Rules — checked in priority order, first match wins</div>
        <button onClick={startNew} style={{background:"#C9A84C",color:"#1C1917",border:"none",borderRadius:"7px",padding:"5px 14px",fontSize:"12px",fontWeight:700,cursor:"pointer"}}>+ Add Rule</button>
      </div>
      {[...rules].sort((a,b)=>a.priority-b.priority).map(rule=>(
        <div key={rule.id} style={{display:"flex",alignItems:"center",gap:"10px",background:"#fff",border:"1.5px solid #E7E5E4",borderRadius:"10px",padding:"11px 14px",marginBottom:"7px"}}>
          <div style={{width:"10px",height:"10px",borderRadius:"50%",background:rule.color,flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
              <span style={{fontWeight:700,fontSize:"13px",color:"#292524"}}>{rule.name}</span>
              {rule.dimensions!=="—"&&<span style={{fontSize:"11px",color:"#78716C",background:"#F3F4F6",borderRadius:"4px",padding:"1px 6px",fontFamily:"'DM Mono',monospace"}}>{rule.dimensions}</span>}
              <span style={{fontSize:"10px",color:"#A8A29E",background:"#F9F9F8",border:"1px solid #E7E5E4",borderRadius:"4px",padding:"1px 5px"}}>priority {rule.priority}</span>
            </div>
            {rule.note&&<div style={{fontSize:"11px",color:"#78716C",marginTop:"2px"}}>{rule.note}</div>}
          </div>
          {rule.id!=="box-tbd"&&(
            <div style={{display:"flex",gap:"5px",flexShrink:0}}>
              <button onClick={()=>startEdit(rule)} style={{background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:"6px",padding:"4px 10px",fontSize:"11px",cursor:"pointer",fontWeight:600}}>Edit</button>
              <button onClick={()=>remove(rule.id)} style={{background:"#FEF2F2",color:"#DC2626",border:"1px solid #FECACA",borderRadius:"6px",padding:"4px 10px",fontSize:"11px",cursor:"pointer",fontWeight:600}}>Remove</button>
            </div>
          )}
          {rule.id==="box-tbd"&&<span style={{fontSize:"10px",color:"#A8A29E",fontStyle:"italic"}}>fallback</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Boxes Tab Content ────────────────────────────────────────────────────────
function BoxesTab({orders, rules, onRulesChange}) {
  const [showRules, setShowRules] = useState(false);

  const assignments = useMemo(() => {
    return orders.map(order => ({ order, ...assignBox(order, rules) }));
  }, [orders, rules]);

  // Tally boxes needed
  const boxCounts = useMemo(() => {
    const counts = {};
    for (const {rule} of assignments) {
      counts[rule.id] = (counts[rule.id]||0) + 1;
    }
    return counts;
  }, [assignments]);

  if (!orders.length) {
    return (
      <div style={{textAlign:"center",color:"#A8A29E",padding:"60px 24px",fontSize:"14px"}}>
        <div style={{fontSize:"32px",marginBottom:"10px"}}>📦</div>
        Upload a CSV in the Orders tab first, then come back here.
      </div>
    );
  }

  const sortedRules = [...rules].sort((a,b)=>a.priority-b.priority).filter(r=>boxCounts[r.id]);

  return (
    <>
      {/* Summary cards */}
      <div style={{display:"flex",gap:"10px",marginBottom:"20px",flexWrap:"wrap"}}>
        {sortedRules.map(rule => (
          <div key={rule.id} style={{flex:"1",minWidth:"130px",background:"#fff",border:`2px solid ${rule.color}22`,borderLeft:`4px solid ${rule.color}`,borderRadius:"10px",padding:"14px 16px"}}>
            <div style={{fontSize:"26px",fontWeight:700,color:rule.color,fontFamily:"'DM Mono',monospace"}}>{boxCounts[rule.id]||0}</div>
            <div style={{fontSize:"12px",fontWeight:700,color:"#292524",marginTop:"2px"}}>{rule.name}</div>
            {rule.dimensions!=="—"&&<div style={{fontSize:"11px",color:"#78716C",fontFamily:"'DM Mono',monospace",marginTop:"1px"}}>{rule.dimensions}</div>}
          </div>
        ))}
        <div style={{flex:"1",minWidth:"130px",background:"#F8FAFC",border:"2px solid #E2E8F0",borderRadius:"10px",padding:"14px 16px"}}>
          <div style={{fontSize:"26px",fontWeight:700,color:"#334155",fontFamily:"'DM Mono',monospace"}}>{orders.length}</div>
          <div style={{fontSize:"12px",fontWeight:700,color:"#292524",marginTop:"2px"}}>Total Orders</div>
          <div style={{fontSize:"11px",color:"#78716C",marginTop:"1px"}}>all unfulfilled</div>
        </div>
      </div>

      {/* Toggle rules editor */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
        <div style={{fontSize:"13px",fontWeight:700,color:"#44403C"}}>Order Breakdown</div>
        <button onClick={()=>setShowRules(s=>!s)} style={{background:showRules?"#1C1917":"#F3F4F6",color:showRules?"#F5EFE3":"#374151",border:"1px solid #E5E7EB",borderRadius:"7px",padding:"5px 13px",fontSize:"12px",fontWeight:600,cursor:"pointer",transition:"all 0.15s"}}>
          {showRules?"Hide Rules":"⚙ Edit Box Rules"}
        </button>
      </div>

      {showRules && <RuleEditor rules={rules} onChange={onRulesChange}/>}

      {/* Per-box group */}
      {sortedRules.map(rule => {
        const ordersForRule = assignments.filter(a=>a.rule.id===rule.id);
        return (
          <div key={rule.id} style={{marginBottom:"18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px",padding:"8px 14px",background:"#fff",border:`1.5px solid ${rule.color}33`,borderLeft:`3px solid ${rule.color}`,borderRadius:"8px"}}>
              <div style={{width:"9px",height:"9px",borderRadius:"50%",background:rule.color,flexShrink:0}}/>
              <span style={{fontWeight:700,fontSize:"13px",color:"#292524"}}>{rule.name}</span>
              {rule.dimensions!=="—"&&<span style={{fontSize:"11px",color:"#78716C",background:"#F3F4F6",borderRadius:"3px",padding:"1px 6px",fontFamily:"'DM Mono',monospace"}}>{rule.dimensions}</span>}
              <span style={{marginLeft:"auto",fontSize:"11px",fontWeight:700,color:rule.color,fontFamily:"'DM Mono',monospace"}}>{ordersForRule.length} box{ordersForRule.length!==1?"es":""}</span>
            </div>
            {ordersForRule.map(({order},i) => (
              <div key={order.id} style={{background:"#fff",border:"1px solid #F0EDEA",borderRadius:"8px",padding:"10px 14px",marginBottom:"5px",display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
                <span style={{fontWeight:700,fontSize:"12px",color:"#111",fontFamily:"'DM Mono',monospace",minWidth:"52px"}}>{order.id}</span>
                <span style={{fontSize:"10px",color:"#999",background:"#F3F4F6",borderRadius:"3px",padding:"1px 5px"}}>{order.date}</span>
                <span style={{fontSize:"11px",color:"#555",flex:1,minWidth:"120px"}}>{order.shipTo}</span>
                <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                  {order.items.map(it=><SkuBadge key={it.sku} sku={it.sku} qty={it.qty}/>)}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

// ─── Prep Plan Tab ────────────────────────────────────────────────────────────
// Dates per box by size — Gourmet only
const DATES_PER_BOX = { reg: 5, grand: 8 };

// Build the full prep plan data structure from orders + inventory
function buildPrepPlan(orders, inventory) {
  // Tally items across ALL orders
  const skuTotals = {}; // sku → total qty ordered
  for (const order of orders) {
    for (const item of order.items) {
      skuTotals[item.sku] = (skuTotals[item.sku] || 0) + item.qty;
    }
  }

  // For each collection group, build rows
  const sections = COLLECTION_GROUPS.map(group => {
    const isGourmet = group.prefix === "G-";
    const col = COLLECTION_COLORS[group.prefix];

    // Determine sizes present in this collection
    // Velour has no size dimension; Harvest has no size
    const hasSizes = group.pairs.some(([,r,g]) => g !== null);

    if (!hasSizes) {
      // Flat list — no size grouping (Velour, Harvest)
      const rows = group.pairs.map(([name, regSku]) => {
        const ordered = skuTotals[regSku] || 0;
        const inInv   = inventory[regSku] || 0;
        const toMake  = Math.max(0, ordered - inInv);
        return { name, sku: regSku, ordered, inInv, toMake, datesNeeded: null };
      }).filter(r => r.ordered > 0 || r.inInv > 0);

      const totalOrdered  = rows.reduce((s,r)=>s+r.ordered,0);
      const totalInInv    = rows.reduce((s,r)=>s+r.inInv,0);
      const totalToMake   = rows.reduce((s,r)=>s+r.toMake,0);

      return { label: group.label, prefix: group.prefix, col, hasSizes: false, rows, totalOrdered, totalInInv, totalToMake };
    }

    // Build Regular and Grand groups
    const regRows = [], grandRows = [];

    for (const [name, regSku, grandSku] of group.pairs) {
      // Regular
      if (regSku) {
        const ordered = skuTotals[regSku] || 0;
        const inInv   = inventory[regSku] || 0;
        const toMake  = Math.max(0, ordered - inInv);
        const datesNeeded = isGourmet && toMake > 0 ? toMake * DATES_PER_BOX.reg : null;
        if (ordered > 0 || inInv > 0) {
          regRows.push({ name, sku: regSku, ordered, inInv, toMake, datesNeeded });
        }
      }
      // Grand
      if (grandSku) {
        const ordered = skuTotals[grandSku] || 0;
        const inInv   = inventory[grandSku] || 0;
        const toMake  = Math.max(0, ordered - inInv);
        const datesNeeded = isGourmet && toMake > 0 ? toMake * DATES_PER_BOX.grand : null;
        if (ordered > 0 || inInv > 0) {
          grandRows.push({ name, sku: grandSku, ordered, inInv, toMake, datesNeeded });
        }
      }
    }

    const regTotal   = { ordered: regRows.reduce((s,r)=>s+r.ordered,0),   inInv: regRows.reduce((s,r)=>s+r.inInv,0),   toMake: regRows.reduce((s,r)=>s+r.toMake,0),   dates: isGourmet ? regRows.reduce((s,r)=>s+(r.datesNeeded||0),0) : null };
    const grandTotal = { ordered: grandRows.reduce((s,r)=>s+r.ordered,0), inInv: grandRows.reduce((s,r)=>s+r.inInv,0), toMake: grandRows.reduce((s,r)=>s+r.toMake,0), dates: isGourmet ? grandRows.reduce((s,r)=>s+(r.datesNeeded||0),0) : null };
    const totalOrdered = regTotal.ordered + grandTotal.ordered;
    const totalInInv   = regTotal.inInv + grandTotal.inInv;
    const totalToMake  = regTotal.toMake + grandTotal.toMake;
    const totalDates   = isGourmet ? (regTotal.dates||0) + (grandTotal.dates||0) : null;

    return { label: group.label, prefix: group.prefix, col, hasSizes: true, isGourmet, regRows, grandRows, regTotal, grandTotal, totalOrdered, totalInInv, totalToMake, totalDates };
  });

  // Combined flavor summary for Gourmet (Reg + Grand split by flavor name)
  const gourmetSection = sections.find(s => s.prefix === "G-");
  const flavorSummary = [];
  if (gourmetSection) {
    const flavorMap = {};
    for (const row of (gourmetSection.regRows||[])) {
      if (!flavorMap[row.name]) flavorMap[row.name] = { name: row.name, regToMake: 0, grandToMake: 0, datesNeeded: 0 };
      flavorMap[row.name].regToMake   += row.toMake;
      flavorMap[row.name].datesNeeded += row.datesNeeded || 0;
    }
    for (const row of (gourmetSection.grandRows||[])) {
      if (!flavorMap[row.name]) flavorMap[row.name] = { name: row.name, regToMake: 0, grandToMake: 0, datesNeeded: 0 };
      flavorMap[row.name].grandToMake += row.toMake;
      flavorMap[row.name].datesNeeded += row.datesNeeded || 0;
    }
    flavorSummary.push(...Object.values(flavorMap).filter(f => f.regToMake > 0 || f.grandToMake > 0 || f.datesNeeded > 0));
  }

  const grandTotal = {
    ordered: sections.reduce((s,sec)=>s+sec.totalOrdered,0),
    inInv:   sections.reduce((s,sec)=>s+sec.totalInInv,0),
    toMake:  sections.reduce((s,sec)=>s+sec.totalToMake,0),
    dates:   sections.filter(s=>s.isGourmet).reduce((s,sec)=>s+(sec.totalDates||0),0),
  };

  return { sections, flavorSummary, grandTotal };
}

// ─── Prep Plan helpers ────────────────────────────────────────────────────────

// Default column widths in px
const DEFAULT_COL_WIDTHS = [80, 55, 130, 44, 44, 44, 50];

// TH that accepts a width and shows a drag handle
const TH = ({ children, right=false, width, onResizeStart }) => (
  <th style={{ padding:"5px 6px", fontSize:"9px", fontWeight:700, color:"#78716C", textTransform:"uppercase", letterSpacing:"0.04em", textAlign:right?"right":"left", whiteSpace:"normal", lineHeight:"1.2", background:"#F7F6F3", borderBottom:"2px solid #E7E5E4", width: width ? `${width}px` : undefined, position:"relative", userSelect:"none", verticalAlign:"bottom", fontFamily:"'Courier New',monospace" }}>
    {children}
    {onResizeStart && (
      <span
        onMouseDown={onResizeStart}
        style={{ position:"absolute", right:0, top:0, bottom:0, width:"6px", cursor:"col-resize", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10 }}
      >
        <span style={{ width:"2px", height:"60%", background:"#D6D3CD", borderRadius:"2px", display:"block" }}/>
      </span>
    )}
  </th>
);

const TD = ({ children, right=false, bold=false, muted=false, color=null, gray=false, nowrap=false }) => (
  <td style={{ padding:"6px 6px", fontSize:"12px", fontWeight:bold||right?700:600, color: color||(muted?"#555":gray?"#333":"#000"), textAlign:right?"right":"left", fontFamily:"'Courier New',monospace", borderBottom:"1px solid #F0EDEA", whiteSpace:nowrap?"nowrap":"normal" }}>
    {children}
  </td>
);

// Total row: Collection=empty, Size=empty, label in Product col, then data cols
const TotalRow = ({ label, ordered, inInv, toMake, dates, isGourmet }) => (
  <tr style={{ background:"#111" }}>
    <td style={{ padding:"6px 6px", borderBottom:"2px solid #333" }}/>
    <td style={{ padding:"6px 6px", borderBottom:"2px solid #333" }}/>
    <td style={{ padding:"6px 6px", fontSize:"11px", fontWeight:700, color:"#fff", borderBottom:"2px solid #333", fontFamily:"'Courier New',monospace" }}>{label}</td>
    <td style={{ padding:"6px 6px", fontSize:"11px", fontWeight:700, color:"#fff", textAlign:"right", fontFamily:"'Courier New',monospace", borderBottom:"2px solid #333" }}>{ordered||"—"}</td>
    <td style={{ padding:"6px 6px", fontSize:"11px", fontWeight:700, color:inInv>0?"#ccc":"#fff", textAlign:"right", fontFamily:"'Courier New',monospace", borderBottom:"2px solid #333" }}>{inInv>0?inInv:"—"}</td>
    <td style={{ padding:"6px 6px", fontSize:"11px", fontWeight:700, color:"#fff", textAlign:"right", fontFamily:"'Courier New',monospace", borderBottom:"2px solid #333" }}>{toMake>0?toMake:0}</td>
    <td style={{ padding:"6px 6px", fontSize:"11px", fontWeight:700, color:dates&&dates>0?"#ccc":"#888", textAlign:"right", fontFamily:"'Courier New',monospace", borderBottom:"2px solid #333" }}>
      {isGourmet?(dates>0?dates:"—"):"—"}
    </td>
  </tr>
);

// Print sections definition — one entry per printable block
// key matches section.label or "gourmet-grand" / "gourmet-reg" for sub-groups
const PRINT_SECTIONS = [
  { key:"Gourmet",       label:"All Gourmet" },
  { key:"gourmet-grand", label:"Gourmet Grand only" },
  { key:"gourmet-reg",   label:"Gourmet Regular only" },
  { key:"Caravan",       label:"Caravan" },
  { key:"Velour",        label:"Velour" },
  { key:"Harvest",       label:"Harvest" },
  { key:"flavor",        label:"Flavor Summary" },
];

function PrepPlanTab({ orders, inventory, csvLoaded, csvFilename, datesReg, setDatesReg, datesGrand, setDatesGrand }) {
  // Print selector: set of section keys to include
  const [printSections, setPrintSections] = useState(new Set(PRINT_SECTIONS.map(p=>p.key)));
  const [showPrintPanel, setShowPrintPanel] = useState(false);

  const togglePrintSection = (key) => {
    setPrintSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const plan = useMemo(() => {
    const skuTotals = {};
    for (const order of orders) {
      for (const item of order.items) {
        skuTotals[item.sku] = (skuTotals[item.sku] || 0) + item.qty;
      }
    }

    const sections = COLLECTION_GROUPS.map(group => {
      const isGourmet = group.prefix === "G-";
      const col = COLLECTION_COLORS[group.prefix];
      const hasSizes = group.pairs.some(([,r,g]) => g !== null);

      if (!hasSizes) {
        const rows = group.pairs.map(([name, regSku]) => {
          const ordered=skuTotals[regSku]||0, inInv=inventory[regSku]||0, toMake=Math.max(0,ordered-inInv);
          return { name, sku:regSku, ordered, inInv, toMake, datesNeeded:null };
        }).filter(r => r.ordered>0||r.inInv>0);
        return { label:group.label, prefix:group.prefix, col, hasSizes:false, isGourmet:false, rows,
          totalOrdered:rows.reduce((s,r)=>s+r.ordered,0), totalInInv:rows.reduce((s,r)=>s+r.inInv,0),
          totalToMake:rows.reduce((s,r)=>s+r.toMake,0), totalDates:null };
      }

      const regRows=[], grandRows=[];
      for (const [name, regSku, grandSku] of group.pairs) {
        if (regSku) {
          const ordered=skuTotals[regSku]||0, inInv=inventory[regSku]||0, toMake=Math.max(0,ordered-inInv);
          const datesNeeded=isGourmet&&toMake>0?toMake*datesReg:null;
          if(ordered>0||inInv>0) regRows.push({name,sku:regSku,ordered,inInv,toMake,datesNeeded});
        }
        if (grandSku) {
          const ordered=skuTotals[grandSku]||0, inInv=inventory[grandSku]||0, toMake=Math.max(0,ordered-inInv);
          const datesNeeded=isGourmet&&toMake>0?toMake*datesGrand:null;
          if(ordered>0||inInv>0) grandRows.push({name,sku:grandSku,ordered,inInv,toMake,datesNeeded});
        }
      }

      const regTotal={ordered:regRows.reduce((s,r)=>s+r.ordered,0),inInv:regRows.reduce((s,r)=>s+r.inInv,0),toMake:regRows.reduce((s,r)=>s+r.toMake,0),dates:isGourmet?regRows.reduce((s,r)=>s+(r.datesNeeded||0),0):null};
      const grandTotal={ordered:grandRows.reduce((s,r)=>s+r.ordered,0),inInv:grandRows.reduce((s,r)=>s+r.inInv,0),toMake:grandRows.reduce((s,r)=>s+r.toMake,0),dates:isGourmet?grandRows.reduce((s,r)=>s+(r.datesNeeded||0),0):null};

      return { label:group.label, prefix:group.prefix, col, hasSizes:true, isGourmet, regRows, grandRows, regTotal, grandTotal,
        totalOrdered:regTotal.ordered+grandTotal.ordered, totalInInv:regTotal.inInv+grandTotal.inInv,
        totalToMake:regTotal.toMake+grandTotal.toMake, totalDates:isGourmet?(regTotal.dates||0)+(grandTotal.dates||0):null };
    });

    const gSec = sections.find(s=>s.prefix==="G-");
    const flavorMap = {};
    if (gSec) {
      for (const row of (gSec.regRows||[])) {
        if (!flavorMap[row.name]) flavorMap[row.name]={name:row.name,regToMake:0,grandToMake:0,datesNeeded:0};
        flavorMap[row.name].regToMake   += row.toMake;
        flavorMap[row.name].datesNeeded += row.datesNeeded||0;
      }
      for (const row of (gSec.grandRows||[])) {
        if (!flavorMap[row.name]) flavorMap[row.name]={name:row.name,regToMake:0,grandToMake:0,datesNeeded:0};
        flavorMap[row.name].grandToMake += row.toMake;
        flavorMap[row.name].datesNeeded += row.datesNeeded||0;
      }
    }
    const flavorSummary = Object.values(flavorMap).filter(f=>f.regToMake>0||f.grandToMake>0||f.datesNeeded>0);

    const grandTotal={
      ordered:sections.reduce((s,sec)=>s+sec.totalOrdered,0),
      inInv:sections.reduce((s,sec)=>s+sec.totalInInv,0),
      toMake:sections.reduce((s,sec)=>s+sec.totalToMake,0),
      dates:sections.filter(s=>s.isGourmet).reduce((s,sec)=>s+(sec.totalDates||0),0),
    };

    return { sections, flavorSummary, grandTotal };
  }, [orders, inventory, datesReg, datesGrand]);

  const [colWidths, setColWidths] = useState(DEFAULT_COL_WIDTHS);
  const [tableWidth, setTableWidth] = useState(60); // percent width of prep plan container

  // collapsed: Set of keys that are collapsed. Keys: "Gourmet", "Caravan", etc. (whole section)
  // or "Gourmet-grand", "Gourmet-reg", "Caravan-grand", etc. (size group)
  const [collapsed, setCollapsed] = useState(new Set());
  const toggleCollapse = (key) => setCollapsed(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const isCollapsed = (key) => collapsed.has(key);

  const startResize = (colIdx, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[colIdx];
    const onMove = (me) => {
      const delta = me.clientX - startX;
      setColWidths(prev => {
        const next = [...prev];
        next[colIdx] = Math.max(50, startW + delta);
        return next;
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Determine which sections to render on screen
  const shouldShow = (key) => printSections.has(key);

  if (!csvLoaded) {
    return (
      <div style={{textAlign:"center",color:"#A8A29E",padding:"60px 24px"}}>
        <div style={{fontSize:"32px",marginBottom:"10px"}}>📋</div>
        Upload a CSV in the Orders tab first.
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"});

  // Build plain HTML for printing — no React, no styling conflicts
  const doPrint = () => {
    const today = new Date().toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"numeric"});

    const th = (txt, right=false) => `<th class="${right?'right':''}">${txt}</th>`;
    const td = (txt, cls="") => `<td class="${cls}">${txt??""}</td>`;
    const dash = "—";

    let rows = "";

    for (const section of plan.sections) {
      const showWholeSection = shouldShow(section.label);
      const showGrand = section.hasSizes && (shouldShow(section.label) || (shouldShow("gourmet-grand") && section.isGourmet));
      const showReg   = section.hasSizes && (shouldShow(section.label) || (shouldShow("gourmet-reg")   && section.isGourmet));

      if (!section.hasSizes) {
        if (!showWholeSection || section.rows.length === 0) continue;
        section.rows.forEach((row, ri) => {
          rows += `<tr>
            ${td(ri===0?`<b>${section.label}</b>`:"")}
            ${td(dash,"muted")}
            ${td(row.name)}
            ${td(row.ordered||dash,"right")}
            ${td(row.inInv>0?row.inInv:dash,"right")}
            ${td(row.toMake>0?`<b>${row.toMake}</b>`:0,"right tomake")}
            ${td(dash,"right muted")}
          </tr>`;
        });
        rows += `<tr class="total-row">
          <td></td><td></td>
          <td><b>${section.label} Total</b></td>
          ${td(section.totalOrdered||dash,"right")}
          ${td(section.totalInInv>0?section.totalInInv:dash,"right")}
          ${td(section.totalToMake,"right tomake")}
          ${td(dash,"right dates")}
        </tr>`;
        continue;
      }

      let collLabelDone = false;
      const collTd = () => { const v = collLabelDone?"":section.label; collLabelDone=true; return td(v?`<b>${v}</b>`:""); };

      if (showGrand && section.grandRows.length > 0) {
        section.grandRows.forEach((row,ri) => {
          rows += `<tr>
            ${ri===0?collTd():td("")}
            ${td("Grand","muted")}
            ${td(row.name)}
            ${td(row.ordered||dash,"right")}
            ${td(row.inInv>0?row.inInv:dash,"right")}
            ${td(row.toMake>0?`<b>${row.toMake}</b>`:0,"right tomake")}
            ${td(section.isGourmet&&row.datesNeeded>0?row.datesNeeded:dash,"right dates")}
          </tr>`;
        });
        rows += `<tr class="total-row">
          <td></td><td></td>
          <td><b>Grand Total</b></td>
          ${td(section.grandTotal.ordered||dash,"right")}
          ${td(section.grandTotal.inInv>0?section.grandTotal.inInv:dash,"right")}
          ${td(section.grandTotal.toMake,"right tomake")}
          ${td(section.isGourmet&&section.grandTotal.dates>0?section.grandTotal.dates:dash,"right dates")}
        </tr>`;
      }

      if (showReg && section.regRows.length > 0) {
        section.regRows.forEach((row,ri) => {
          rows += `<tr>
            ${ri===0&&!showGrand?collTd():td("")}
            ${td("Regular","muted")}
            ${td(row.name)}
            ${td(row.ordered||dash,"right")}
            ${td(row.inInv>0?row.inInv:dash,"right")}
            ${td(row.toMake>0?`<b>${row.toMake}</b>`:0,"right tomake")}
            ${td(section.isGourmet&&row.datesNeeded>0?row.datesNeeded:dash,"right dates")}
          </tr>`;
        });
        rows += `<tr class="total-row">
          <td></td><td></td>
          <td><b>Regular Total</b></td>
          ${td(section.regTotal.ordered||dash,"right")}
          ${td(section.regTotal.inInv>0?section.regTotal.inInv:dash,"right")}
          ${td(section.regTotal.toMake,"right tomake")}
          ${td(section.isGourmet&&section.regTotal.dates>0?section.regTotal.dates:dash,"right dates")}
        </tr>`;
      }
    }

    // Full total row
    rows += `<tr class="grand-total-row">
      <td><b>FULL TOTAL</b></td><td></td><td></td>
      ${td(plan.grandTotal.ordered,"right")}
      ${td(plan.grandTotal.inInv||0,"right")}
      ${td(plan.grandTotal.toMake,"right tomake")}
      ${td(plan.grandTotal.dates>0?plan.grandTotal.dates:0,"right dates")}
    </tr>`;

    // Flavor summary
    let flavorRows = "";
    if (shouldShow("flavor") && plan.flavorSummary.length > 0) {
      plan.flavorSummary.forEach(f => {
        flavorRows += `<tr>
          <td><b>${f.name}</b></td>
          <td class="right tomake">${f.regToMake||"—"}</td>
          <td class="right tomake">${f.grandToMake||"—"}</td>
          <td class="right tomake"><b>${f.regToMake+f.grandToMake}</b></td>
          <td class="right dates"><b>${f.datesNeeded}</b></td>
        </tr>`;
      });
      const totReg   = plan.flavorSummary.reduce((s,f)=>s+f.regToMake,0);
      const totGrand = plan.flavorSummary.reduce((s,f)=>s+f.grandToMake,0);
      const totDates = plan.flavorSummary.reduce((s,f)=>s+f.datesNeeded,0);
      flavorRows += `<tr class="grand-total-row"><td><b>Total</b></td><td class="right">${totReg}</td><td class="right">${totGrand}</td><td class="right">${totReg+totGrand}</td><td class="right dates">${totDates}</td></tr>`;
    }

    const html = `
      <div style="font-family:'Courier New',monospace;">
        <div style="font-size:13pt;font-weight:bold;text-decoration:underline;text-align:center;margin-bottom:8pt;letter-spacing:0.03em;">${today}</div>
        <table>
          <thead><tr>
            ${th("Collection")}${th("Size")}${th("Product")}
            ${th("Items Across Orders",true)}${th("Box in Inv",true)}${th("Boxes To Make",true)}${th("Dates/Flav (Gourmet)",true)}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${flavorRows ? `
          <div style="margin-top:8pt;font-size:9pt;font-weight:bold;border-bottom:1pt solid #ccc;padding-bottom:2pt;margin-bottom:3pt;">Gourmet — Boxes by Flavor</div>
          <table>
            <thead><tr>${th("Flavor")}${th("Reg Boxes",true)}${th("Grand Boxes",true)}${th("Total Boxes",true)}${th("Dates Needed",true)}</tr></thead>
            <tbody>${flavorRows}</tbody>
          </table>` : ""}
      </div>`;

    // Inject into a portal div outside the React root
    let portal = document.getElementById("prep-print-portal");
    if (!portal) {
      portal = document.createElement("div");
      portal.id = "prep-print-portal";
      document.body.appendChild(portal);
    }
    portal.innerHTML = html;

    window.print();

    // Clean up after print dialog closes
    setTimeout(() => { portal.innerHTML = ""; }, 1000);
  };

  // The printable table — shared between screen and print
  const renderTable = (forPrint=false) => {
    const baseStyle = forPrint ? {fontSize:"11px"} : {};
    const cw = colWidths;
    return (
      <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",...baseStyle}}>
        {!forPrint && (
          <colgroup>
            {cw.map((w,i) => <col key={i} style={{width: i===2 ? "min-content" : `${w}px`}}/>)}
          </colgroup>
        )}
        <thead>
          <tr>
            <TH width={cw[0]} onResizeStart={forPrint?null:(e)=>startResize(0,e)}>Collection</TH>
            <TH width={cw[1]} onResizeStart={forPrint?null:(e)=>startResize(1,e)}>Size</TH>
            <TH width={cw[2]} onResizeStart={forPrint?null:(e)=>startResize(2,e)}>Product</TH>
            <TH right width={cw[3]} onResizeStart={forPrint?null:(e)=>startResize(3,e)}>Items Ordered</TH>
            <TH right width={cw[4]} onResizeStart={forPrint?null:(e)=>startResize(4,e)}>Inv Boxes</TH>
            <TH right width={cw[5]} onResizeStart={forPrint?null:(e)=>startResize(5,e)}>Make Boxes</TH>
            <TH right width={cw[6]} onResizeStart={forPrint?null:(e)=>startResize(6,e)}>Dates Needed</TH>
          </tr>
        </thead>
        <tbody>
          {plan.sections.map(section => {
            const showWholeSection = shouldShow(section.label);
            const showGrand = section.hasSizes && (shouldShow(section.label) || shouldShow("gourmet-grand") && section.isGourmet);
            const showReg   = section.hasSizes && (shouldShow(section.label) || shouldShow("gourmet-reg")   && section.isGourmet);

            const sectionCollapsed = isCollapsed(section.label);
            const grandCollapsed   = isCollapsed(`${section.label}-grand`);
            const regCollapsed     = isCollapsed(`${section.label}-reg`);

            const col = section.col;
            // Collapse toggle button style
            const chevron = (collapsed) => (
              <span style={{
                display:"inline-flex", alignItems:"center", justifyContent:"center",
                width:"16px", height:"16px", borderRadius:"3px",
                background:"rgba(0,0,0,0.08)", fontSize:"9px", marginRight:"6px",
                transition:"transform 0.15s", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                flexShrink:0, cursor:"pointer",
              }}>▾</span>
            );

            // ── Flat (no sizes) ──────────────────────────────────────────
            if (!section.hasSizes) {
              if (!showWholeSection || section.rows.length===0) return null;
              return (
                <React.Fragment key={section.label}>
                  {/* Section header row — clickable to collapse */}
                  <tr onClick={()=>toggleCollapse(section.label)} style={{
                    background:col.light, cursor:"pointer",
                    borderTop:`2px solid ${col.border}`, borderBottom:`1px solid ${col.border}`,
                  }}>
                    <td colSpan={7} style={{padding:"6px 10px", fontSize:"12px", fontWeight:700, color:col.text, userSelect:"none", fontFamily:"'Courier New',monospace"}}>
                      {chevron(sectionCollapsed)}
                      {section.label}
                      <span style={{fontSize:"10px", fontWeight:500, color:col.accent, marginLeft:"8px"}}>
                        {section.rows.length} product{section.rows.length!==1?"s":""}
                        {" · "}{section.totalToMake} to make
                      </span>
                    </td>
                  </tr>
                  {!sectionCollapsed && <>
                    {section.rows.map((row,ri) => (
                      <tr key={row.sku} style={{background:ri%2===0?"#fff":"#F5F5F5"}}>
                        <TD bold={ri===0}>{ri===0?section.label:""}</TD>
                        <TD gray>—</TD>
                        <TD nowrap>{row.name}</TD>
                        <TD right>{row.ordered||"—"}</TD>
                        <TD right>{row.inInv>0?row.inInv:"—"}</TD>
                        <TD right bold>{row.toMake>0?row.toMake:0}</TD>
                        <TD right muted>—</TD>
                      </tr>
                    ))}
                    <TotalRow label={`${section.label} Total`} ordered={section.totalOrdered} inInv={section.totalInInv} toMake={section.totalToMake} dates={null} isGourmet={false}/>
                  </>}
                </React.Fragment>
              );
            }

            if (!showGrand && !showReg) return null;
            const bothEmpty = section.regRows.length===0 && section.grandRows.length===0;
            if (bothEmpty) return null;

            return (
              <React.Fragment key={section.label}>
                {/* Collection header row */}
                <tr onClick={()=>toggleCollapse(section.label)} style={{
                  background:col.light, cursor:"pointer",
                  borderTop:`2px solid ${col.border}`, borderBottom:`1px solid ${col.border}`,
                }}>
                  <td colSpan={7} style={{padding:"6px 10px", fontSize:"12px", fontWeight:700, color:col.text, userSelect:"none", fontFamily:"'Courier New',monospace"}}>
                    {chevron(sectionCollapsed)}
                    {section.label}
                    <span style={{fontSize:"10px", fontWeight:500, color:col.accent, marginLeft:"8px"}}>
                      {section.totalToMake} to make
                      {section.isGourmet && section.totalDates > 0 ? ` · ${section.totalDates} dates` : ""}
                    </span>
                  </td>
                </tr>

                {!sectionCollapsed && <>
                  {/* Grand size group */}
                  {showGrand && section.grandRows.length > 0 && <>
                    {/* Size subheader */}
                    <tr onClick={(e)=>{e.stopPropagation();toggleCollapse(`${section.label}-grand`);}} style={{
                      background:"#F3F4F6", cursor:"pointer", borderBottom:"1px solid #E7E5E4",
                    }}>
                      <td style={{padding:"4px 10px 4px 26px", fontSize:"11px", fontWeight:700, color:"#57534E", userSelect:"none", fontFamily:"'Courier New',monospace"}} colSpan={7}>
                        {chevron(grandCollapsed)}
                        Grand
                        <span style={{fontSize:"10px", fontWeight:500, color:"#78716C", marginLeft:"6px"}}>
                          {section.grandTotal.toMake} to make
                          {section.isGourmet && section.grandTotal.dates > 0 ? ` · ${section.grandTotal.dates} dates` : ""}
                        </span>
                      </td>
                    </tr>
                    {!grandCollapsed && <>
                      {section.grandRows.map((row,ri) => (
                        <tr key={row.sku} style={{background:ri%2===0?"#fff":"#FAFAF8"}}>
                          <TD bold={ri===0}>{ri===0?section.label:""}</TD>
                          <TD gray>Grand</TD>
                          <TD nowrap>{row.name}</TD>
                          <TD right>{row.ordered||"—"}</TD>
                          <TD right>{row.inInv>0?row.inInv:"—"}</TD>
                          <TD right bold>{row.toMake>0?row.toMake:0}</TD>
                          <TD right bold={row.datesNeeded>0}>{section.isGourmet?(row.datesNeeded>0?row.datesNeeded:"—"):"—"}</TD>
                        </tr>
                      ))}
                      <TotalRow label="Grand Total" ordered={section.grandTotal.ordered} inInv={section.grandTotal.inInv} toMake={section.grandTotal.toMake} dates={section.grandTotal.dates} isGourmet={section.isGourmet}/>
                    </>}
                  </>}

                  {/* Regular size group */}
                  {showReg && section.regRows.length > 0 && <>
                    <tr onClick={(e)=>{e.stopPropagation();toggleCollapse(`${section.label}-reg`);}} style={{
                      background:"#F3F4F6", cursor:"pointer", borderBottom:"1px solid #E7E5E4",
                    }}>
                      <td style={{padding:"4px 10px 4px 26px", fontSize:"11px", fontWeight:700, color:"#57534E", userSelect:"none", fontFamily:"'Courier New',monospace"}} colSpan={7}>
                        {chevron(regCollapsed)}
                        Regular
                        <span style={{fontSize:"10px", fontWeight:500, color:"#78716C", marginLeft:"6px"}}>
                          {section.regTotal.toMake} to make
                          {section.isGourmet && section.regTotal.dates > 0 ? ` · ${section.regTotal.dates} dates` : ""}
                        </span>
                      </td>
                    </tr>
                    {!regCollapsed && <>
                      {section.regRows.map((row,ri) => (
                        <tr key={row.sku} style={{background:ri%2===0?"#fff":"#FAFAF8"}}>
                          <TD bold={ri===0&&!showGrand}>{ri===0&&!showGrand?section.label:""}</TD>
                          <TD gray>Regular</TD>
                          <TD nowrap>{row.name}</TD>
                          <TD right>{row.ordered||"—"}</TD>
                          <TD right>{row.inInv>0?row.inInv:"—"}</TD>
                          <TD right bold>{row.toMake>0?row.toMake:0}</TD>
                          <TD right bold={row.datesNeeded>0}>{section.isGourmet?(row.datesNeeded>0?row.datesNeeded:"—"):"—"}</TD>
                        </tr>
                      ))}
                      <TotalRow label="Regular Total" ordered={section.regTotal.ordered} inInv={section.regTotal.inInv} toMake={section.regTotal.toMake} dates={section.regTotal.dates} isGourmet={section.isGourmet}/>
                    </>}
                  </>}
                </>}
              </React.Fragment>
            );
          })}

          {/* Full total — always shown, label stays in Collection col */}
          <tr style={{background:"#111"}}>
            <td style={{padding:"7px 6px",fontSize:"12px",fontWeight:700,color:"#fff",borderTop:"2px solid #000",fontFamily:"'Courier New',monospace"}}>FULL TOTAL</td>
            <td style={{padding:"7px 6px",borderTop:"2px solid #000"}}/>
            <td style={{padding:"7px 6px",borderTop:"2px solid #000"}}/>
            <td style={{padding:"7px 6px",fontSize:"12px",fontWeight:700,color:"#fff",textAlign:"right",fontFamily:"'Courier New',monospace",borderTop:"2px solid #000"}}>{plan.grandTotal.ordered}</td>
            <td style={{padding:"7px 6px",fontSize:"12px",fontWeight:700,color:"#ccc",textAlign:"right",fontFamily:"'Courier New',monospace",borderTop:"2px solid #000"}}>{plan.grandTotal.inInv>0?plan.grandTotal.inInv:0}</td>
            <td style={{padding:"7px 6px",fontSize:"12px",fontWeight:700,color:"#fff",textAlign:"right",fontFamily:"'Courier New',monospace",borderTop:"2px solid #000"}}>{plan.grandTotal.toMake}</td>
            <td style={{padding:"7px 6px",fontSize:"12px",fontWeight:700,color:"#ccc",textAlign:"right",fontFamily:"'Courier New',monospace",borderTop:"2px solid #000"}}>{plan.grandTotal.dates>0?plan.grandTotal.dates:0}</td>
          </tr>
        </tbody>
      </table>
    );
  };

  return (
    <div>
      {/* Print styles */}
      <style>{`
        @media print {
          @page { size: 6in 4in landscape; margin: 5mm; }
          body { margin: 0 !important; }
          /* Hide everything except the print container */
          body > * { display: none !important; }
          #prep-print-portal { display: block !important; }
          #prep-print-portal * { display: revert; }
          /* Table styling for print */
          #prep-print-portal table { width: 100%; border-collapse: collapse; font-size: 9pt; font-family: 'Courier New', monospace; }
          #prep-print-portal th { background: #f2f2f2 !important; color: #333 !important; font-size: 7.5pt; padding: 3pt 5pt; text-align: left; border: 1px solid #ccc; font-weight: bold; }
          #prep-print-portal th.right { text-align: right; }
          #prep-print-portal td { padding: 2.5pt 5pt; border-bottom: 1px solid #e0e0e0; font-size: 9pt; }
          #prep-print-portal td.right { text-align: right; font-family: 'Courier New', monospace; }
          #prep-print-portal tr.total-row td { background: #111 !important; color: #fff !important; font-weight: bold; border-bottom: 2px solid #333; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #prep-print-portal tr.grand-total-row td { background: #000 !important; color: #C9A84C !important; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #prep-print-portal tr.total-row td.dates { color: #ffaaaa !important; }
          #prep-print-portal tr.total-row td.tomake { color: #ffdd88 !important; }
          #prep-print-portal tr { page-break-inside: avoid; break-inside: avoid; }
          #prep-print-portal thead { display: table-header-group; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
        /* Hide print portal on screen */
        #prep-print-portal { display: none; }
      `}</style>

      {/* Screen-only header — hidden in print */}
      <div className="no-print" style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px",flexWrap:"wrap",gap:"10px"}}>
        <div>
          <h2 style={{margin:"0 0 2px",fontSize:"18px",fontWeight:700,color:"#292524",fontFamily:"'DM Mono',monospace"}}>{today}</h2>
          <div style={{fontSize:"11px",color:"#78716C"}}>{csvFilename} · {orders.length} unfulfilled orders</div>
        </div>

        <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
          {/* Dates config */}
          <div style={{display:"flex",alignItems:"center",gap:"10px",background:"#fff",border:"1.5px solid #FDE68A",borderRadius:"10px",padding:"7px 12px",flexWrap:"wrap"}}>
            <span style={{fontSize:"10px",fontWeight:700,color:"#78350F",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>🟡 Dates/box</span>
            {[["Reg",datesReg,setDatesReg],["Grand",datesGrand,setDatesGrand]].map(([lbl,val,setter])=>(
              <div key={lbl} style={{display:"flex",alignItems:"center",gap:"4px"}}>
                <span style={{fontSize:"11px",color:"#78716C",fontWeight:600}}>{lbl}:</span>
                <button onClick={()=>setter(v=>Math.max(1,v-1))} style={{background:"#F59E0B",color:"#fff",border:"none",borderRadius:"3px",width:"17px",height:"17px",cursor:"pointer",fontSize:"12px",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                <span style={{fontFamily:"'DM Mono',monospace",fontWeight:700,fontSize:"13px",color:"#78350F",minWidth:"16px",textAlign:"center"}}>{val}</span>
                <button onClick={()=>setter(v=>v+1)} style={{background:"#F59E0B",color:"#fff",border:"none",borderRadius:"3px",width:"17px",height:"17px",cursor:"pointer",fontSize:"12px",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
              </div>
            ))}
          </div>

          <button onClick={()=>setColWidths(DEFAULT_COL_WIDTHS)} style={{background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:"8px",padding:"7px 13px",fontSize:"12px",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
            ↔ Reset Cols
          </button>

          {/* Table width slider */}
          <div style={{display:"flex",alignItems:"center",gap:"7px",background:"#fff",border:"1.5px solid #E7E5E4",borderRadius:"10px",padding:"6px 12px"}}>
            <span style={{fontSize:"10px",fontWeight:700,color:"#78716C",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>↔ Width</span>
            <input type="range" min="40" max="100" value={tableWidth} onChange={e=>setTableWidth(Number(e.target.value))}
              style={{width:"90px",accentColor:"#C9A84C",cursor:"pointer"}}/>
            <span style={{fontSize:"11px",fontWeight:700,color:"#44403C",fontFamily:"'DM Mono',monospace",minWidth:"30px"}}>{tableWidth}%</span>
            {tableWidth !== 100 && (
              <button onClick={()=>setTableWidth(100)} style={{background:"none",border:"none",color:"#A8A29E",cursor:"pointer",fontSize:"11px",padding:"0",fontWeight:600}}>↺</button>
            )}
          </div>
          {/* Print controls */}
          <button onClick={()=>setShowPrintPanel(s=>!s)} style={{background:showPrintPanel?"#1C1917":"#F3F4F6",color:showPrintPanel?"#F5EFE3":"#374151",border:"1px solid #E5E7EB",borderRadius:"8px",padding:"7px 13px",fontSize:"12px",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
            🖨 Print Setup
          </button>
          <button onClick={doPrint} style={{background:"#1C1917",color:"#C9A84C",border:"1px solid #C9A84C",borderRadius:"8px",padding:"7px 13px",fontSize:"12px",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
            Print
          </button>
        </div>
      </div>

      {/* Print section selector */}
      {showPrintPanel && (
        <div className="no-print" style={{background:"#fff",border:"1.5px solid #E7E5E4",borderRadius:"12px",padding:"14px 16px",marginBottom:"14px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
            <span style={{fontSize:"12px",fontWeight:700,color:"#44403C"}}>Select sections to print</span>
            <div style={{display:"flex",gap:"6px"}}>
              <button onClick={()=>setPrintSections(new Set(PRINT_SECTIONS.map(p=>p.key)))} style={{background:"#F3F4F6",color:"#374151",border:"1px solid #E5E7EB",borderRadius:"5px",padding:"3px 9px",fontSize:"11px",cursor:"pointer",fontWeight:600}}>All</button>
              <button onClick={()=>setPrintSections(new Set())} style={{background:"#FEF2F2",color:"#DC2626",border:"1px solid #FECACA",borderRadius:"5px",padding:"3px 9px",fontSize:"11px",cursor:"pointer",fontWeight:600}}>None</button>
            </div>
          </div>
          <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
            {PRINT_SECTIONS.map(({key,label}) => {
              const on = printSections.has(key);
              // Color cue by collection
              const bg = key.startsWith("gourmet")||key==="Gourmet" ? "#FEF3C7" : key==="Caravan"?"#EDE9FE":key==="Velour"?"#FCE7F3":key==="Harvest"?"#F7FEE7":key==="flavor"?"#FEF3C7":"#F3F4F6";
              const activeBg = key.startsWith("gourmet")||key==="Gourmet"?"#F59E0B":key==="Caravan"?"#8B5CF6":key==="Velour"?"#EC4899":key==="Harvest"?"#84CC16":key==="flavor"?"#D97706":"#374151";
              return (
                <button key={key} onClick={()=>togglePrintSection(key)} style={{
                  padding:"6px 13px",borderRadius:"8px",cursor:"pointer",fontSize:"12px",fontWeight:700,border:"2px solid",transition:"all 0.12s",
                  background: on ? activeBg : bg,
                  color: on ? "#fff" : "#44403C",
                  borderColor: on ? activeBg : "#E5E7EB",
                }}>{on?"✓ ":""}{label}</button>
              );
            })}
          </div>
          <div style={{marginTop:"8px",fontSize:"10px",color:"#A8A29E"}}>4 × 6 in landscape · prints only selected sections</div>
        </div>
      )}

      {/* Printable area */}
      <div id="prep-printable" style={{width:`${tableWidth}%`,transition:"width 0.15s",margin:"0 auto"}}>
        {/* Print-only header */}
        <div style={{display:"none"}} className="print-header">
          <div style={{fontSize:"11px",fontWeight:700,marginBottom:"4px",fontFamily:"monospace"}}>Sahara Delights — Prep Plan · {today}</div>
        </div>
        <style>{`@media print { .print-header { display: block !important; margin-bottom: 4px; } }`}</style>

        {/* Main table */}
        <div style={{background:"#fff",border:"1.5px solid #ccc",borderRadius:"6px",overflow:"hidden",marginBottom:"12px"}}>
          {renderTable()}
        </div>

        {/* Gourmet flavor summary */}
        {shouldShow("flavor") && plan.flavorSummary.length > 0 && (
          <div style={{display:"flex",justifyContent:"center",marginBottom:"12px"}}>
            <div style={{display:"inline-block", background:"#fff",border:"1.5px solid #ccc",borderRadius:"6px",overflow:"hidden"}}>
              <div style={{background:"#F0F0F0",borderBottom:"1px solid #ccc",padding:"7px 12px",display:"flex",alignItems:"center",gap:"8px"}}> 
                <div style={{width:"7px",height:"7px",borderRadius:"50%",background:"#333",flexShrink:0}}/>
                <span style={{fontSize:"11px",fontWeight:700,color:"#111",letterSpacing:"0.07em",textTransform:"uppercase"}}>Gourmet — Boxes by Flavor</span>
                <span style={{fontSize:"10px",color:"#888"}}>Reg and Grand split</span>
              </div>
            <table style={{width:"auto",borderCollapse:"collapse",tableLayout:"auto"}}>
              <colgroup>
                <col/>
                <col style={{width:"54px"}}/>
                <col style={{width:"54px"}}/>
                <col style={{width:"54px"}}/>
                <col style={{width:"60px"}}/>
              </colgroup>
              <thead>
                <tr>
                  <TH>Flavor</TH>
                  <TH right>Reg<span style={{display:"block"}}>Boxes</span></TH>
                  <TH right>Grand<span style={{display:"block"}}>Boxes</span></TH>
                  <TH right>Total<span style={{display:"block"}}>Boxes</span></TH>
                  <TH right>Dates<span style={{display:"block"}}>Needed</span></TH>
                </tr>
              </thead>
              <tbody>
                {plan.flavorSummary.map((f,i) => (
                  <tr key={f.name} style={{background:i%2===0?"#fff":"#F5F5F5"}}>
                    <td style={{padding:"6px 12px 6px 6px", fontSize:"12px", fontWeight:600, color:"#000", fontFamily:"'Courier New',monospace", borderBottom:"1px solid #F0EDEA", whiteSpace:"nowrap"}}>{f.name}</td>
                    <TD right muted={!f.regToMake}>{f.regToMake||"—"}</TD>
                    <TD right muted={!f.grandToMake}>{f.grandToMake||"—"}</TD>
                    <TD right bold>{f.regToMake+f.grandToMake}</TD>
                    <TD right bold>{f.datesNeeded}</TD>
                  </tr>
                ))}
                <tr style={{background:"#111"}}>
                  <td style={{padding:"6px 12px 6px 6px",fontSize:"11px",fontWeight:700,color:"#fff",borderTop:"2px solid #000",fontFamily:"'Courier New',monospace",whiteSpace:"nowrap"}}>Total</td>
                  <td style={{padding:"6px 6px",fontSize:"11px",fontWeight:700,color:"#fff",textAlign:"right",fontFamily:"'Courier New',monospace",borderTop:"2px solid #000"}}>{plan.flavorSummary.reduce((s,f)=>s+f.regToMake,0)}</td>
                  <td style={{padding:"6px 6px",fontSize:"11px",fontWeight:700,color:"#fff",textAlign:"right",fontFamily:"'Courier New',monospace",borderTop:"2px solid #000"}}>{plan.flavorSummary.reduce((s,f)=>s+f.grandToMake,0)}</td>
                  <td style={{padding:"6px 6px",fontSize:"11px",fontWeight:700,color:"#fff",textAlign:"right",fontFamily:"'Courier New',monospace",borderTop:"2px solid #000"}}>{plan.flavorSummary.reduce((s,f)=>s+f.regToMake+f.grandToMake,0)}</td>
                  <td style={{padding:"6px 6px",fontSize:"11px",fontWeight:700,color:"#ccc",textAlign:"right",fontFamily:"'Courier New',monospace",borderTop:"2px solid #000"}}>{plan.flavorSummary.reduce((s,f)=>s+f.datesNeeded,0)}</td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
        )}
        </div>
      </div>
    );
  }

// ─── Batch Filter Panel ───────────────────────────────────────────────────────
// Filter shape:
// {
//   status: "all"|"fulfill"|"partial"|"skip"
//   sku: { sku, mode: "contains"|"only"|"excludes" } | null
//   itemCount: { op: "exactly"|"at-least"|"at-most", n: number } | null
//   dateRange: { from: string, to: string } | null   (YYYY-MM-DD strings)
//   hasNotes: boolean | null
// ─── Multi-Filter System ─────────────────────────────────────────────────────
// A filter is an array of "clauses". Each clause has a type and params.
// All clauses are AND-ed together.
//
// Clause types:
//   { type:"status",    status:"all"|"fulfill"|"partial"|"skip" }
//   { type:"product",   target: sku-string|collection-prefix, targetLabel, mode:"contains"|"only"|"excludes", isCollection }
//   { type:"itemCount", op:"exactly"|"at-least"|"at-most", n:number }
//   { type:"dateRange", from:string, to:string }
//   { type:"hasNotes",  value:boolean }

function clauseMatchesOrder(clause, order) {
  switch (clause.type) {
    case "status":
      if (clause.status === "all") return true;
      return order.status === clause.status;

    case "product": {
      const { target, mode, isCollection } = clause;
      const match = isCollection
        ? (it) => it.sku.startsWith(target)
        : (it) => it.sku === target;
      const has = order.items.some(match);
      const all = order.items.every(match);
      if (mode === "contains") return has;
      if (mode === "only")     return all;
      if (mode === "excludes") return !has;
      return true;
    }

    case "itemCount": {
      // count total quantity across all line items
      const n = order.items.reduce((s, it) => s + it.qty, 0);
      if (clause.op === "exactly")  return n === clause.n;
      if (clause.op === "at-least") return n >= clause.n;
      if (clause.op === "at-most")  return n <= clause.n;
      return true;
    }

    case "dateRange": {
      const d = order.date;
      if (clause.from && d < clause.from) return false;
      if (clause.to   && d > clause.to)   return false;
      return true;
    }

    case "size": {
      // "reg" = has -R- in sku, "grand" = has -L- in sku, "none" = neither (Harvest/Velour)
      const sizeMatch = (it) => {
        if (clause.size === "reg")   return it.sku.includes("-R-");
        if (clause.size === "grand") return it.sku.includes("-L-");
        if (clause.size === "none")  return !it.sku.includes("-R-") && !it.sku.includes("-L-");
        return true;
      };
      const has = order.items.some(sizeMatch);
      const all = order.items.every(sizeMatch);
      if (clause.mode === "contains") return has;
      if (clause.mode === "only")     return all;
      if (clause.mode === "excludes") return !has;
      return true;
    }

    case "hasNotes":
      return !!(order.notes && order.notes.trim()) === clause.value;

    default:
      return true;
  }
}

function orderMatchesClauses(order, clauses) {
  return clauses.every(c => clauseMatchesOrder(c, order));
}

function clauseLabel(c) {
  switch (c.type) {
    case "status":    return { all:"All", fulfill:"Ready to Ship", partial:"Partial", skip:"On Hold" }[c.status];
    case "product":   return `${c.mode} "${c.targetLabel}"`;
    case "itemCount": return `${c.op} ${c.n} total box${c.n!==1?"es":""}`;
    case "dateRange": return `${c.from||"…"} → ${c.to||"…"}`;
    case "size":    return `${c.mode} ${({reg:"Regular",grand:"Grand",none:"No size"})[c.size]} size`;
    case "hasNotes":  return c.value ? "Has notes" : "No notes";
    default:          return "?";
  }
}

const CLAUSE_MODES = [
  { mode:"contains", label:"Contains",  bg:"#DBEAFE", text:"#1D4ED8", border:"#93C5FD" },
  { mode:"only",     label:"Only",      bg:"#D1FAE5", text:"#065F46", border:"#6EE7B7" },
  { mode:"excludes", label:"Excludes",  bg:"#FEE2E2", text:"#991B1B", border:"#FCA5A5" },
];
const COUNT_OPS = [
  { op:"exactly",  label:"Exactly" },
  { op:"at-least", label:"≥ At least" },
  { op:"at-most",  label:"≤ At most" },
];

// Build searchable option list: collections first, then individual SKUs grouped by collection
function buildSearchOptions(orders) {
  const activePrefixes = new Set();
  const activeSkus = new Set();
  for (const o of orders) for (const it of o.items) {
    activeSkus.add(it.sku);
    activePrefixes.add(it.sku.slice(0,2));
  }

  const opts = [];
  for (const group of COLLECTION_GROUPS) {
    if (!activePrefixes.has(group.prefix.slice(0,2))) continue;
    const col = COLLECTION_COLORS[group.prefix];
    // Collection-level option
    opts.push({
      id: `coll:${group.prefix}`,
      label: group.label + " (whole collection)",
      searchLabel: group.label,
      target: group.prefix,
      isCollection: true,
      col,
      group: group.label,
    });
    // Individual SKUs in this collection
    for (const [name, regSku, grandSku] of group.pairs) {
      if (regSku && activeSkus.has(regSku)) {
        const size = grandSku ? " — Regular" : "";
        opts.push({
          id: `sku:${regSku}`,
          label: name + size,
          searchLabel: name + size,
          target: regSku,
          isCollection: false,
          col,
          group: group.label,
        });
      }
      if (grandSku && activeSkus.has(grandSku)) {
        opts.push({
          id: `sku:${grandSku}`,
          label: name + " — Grand",
          searchLabel: name + " — Grand",
          target: grandSku,
          isCollection: false,
          col,
          group: group.label,
        });
      }
    }
  }
  return opts;
}

// ── Searchable product/collection picker ──────────────────────────────────────
function ProductPicker({ value, onChange, orders }) {
  const [query, setQuery]     = useState("");
  const [open, setOpen]       = useState(false);
  const [hiIdx, setHiIdx]     = useState(0);
  const inputRef = useRef();
  const opts = useMemo(() => buildSearchOptions(orders), [orders]);

  const filtered = useMemo(() => {
    if (!query.trim()) return opts;
    const q = query.toLowerCase();
    return opts.filter(o =>
      o.searchLabel.toLowerCase().includes(q) ||
      o.group.toLowerCase().includes(q) ||
      o.target.toLowerCase().includes(q)
    );
  }, [query, opts]);

  // Sync display text when value changes externally
  const displayText = value
    ? (opts.find(o => o.id === `${value.isCollection?"coll":"sku"}:${value.target}`)?.label || value.targetLabel)
    : query;

  const select = (opt) => {
    onChange({ target: opt.target, targetLabel: opt.label, isCollection: opt.isCollection });
    setQuery(opt.label);
    setOpen(false);
    setHiIdx(0);
  };

  const clear = () => { onChange(null); setQuery(""); inputRef.current?.focus(); };

  return (
    <div style={{ position:"relative", flex:1, minWidth:"200px" }}>
      <div style={{ display:"flex", alignItems:"center", position:"relative" }}>
        <input
          ref={inputRef}
          value={value ? displayText : query}
          onChange={e => { setQuery(e.target.value); onChange(null); setOpen(true); setHiIdx(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(()=>setOpen(false), 150)}
          onKeyDown={e => {
            if (!open) return;
            if (e.key==="ArrowDown") { e.preventDefault(); setHiIdx(i=>Math.min(i+1,filtered.length-1)); }
            if (e.key==="ArrowUp")   { e.preventDefault(); setHiIdx(i=>Math.max(i-1,0)); }
            if (e.key==="Enter" && filtered[hiIdx]) { e.preventDefault(); select(filtered[hiIdx]); }
            if (e.key==="Escape") setOpen(false);
          }}
          placeholder="Type to search product or collection…"
          style={{
            width:"100%", padding:"7px 30px 7px 10px",
            border:`1.5px solid ${value?"#C9A84C":"#E7E5E4"}`,
            borderRadius:"8px", fontSize:"13px", outline:"none",
            background: value ? "#FFFBEB" : "#fff",
          }}
        />
        {value && (
          <button onMouseDown={clear} style={{ position:"absolute", right:"6px", background:"none", border:"none", cursor:"pointer", color:"#DC2626", fontSize:"16px", fontWeight:700, lineHeight:1 }}>×</button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position:"absolute", top:"calc(100% + 3px)", left:0, right:0, zIndex:100,
          background:"#fff", border:"1.5px solid #C9A84C", borderRadius:"10px",
          boxShadow:"0 6px 20px rgba(0,0,0,0.12)", maxHeight:"260px", overflowY:"auto",
        }}>
          {/* Group by collection */}
          {(() => {
            const groups = [];
            let lastGroup = null;
            filtered.forEach((opt, i) => {
              if (opt.group !== lastGroup) {
                groups.push({ type:"header", label: opt.group, col: opt.col });
                lastGroup = opt.group;
              }
              groups.push({ type:"opt", opt, idx: i });
            });
            return groups.map((item, gi) => {
              if (item.type === "header") return (
                <div key={`h-${gi}`} style={{
                  padding:"5px 10px 3px", fontSize:"9px", fontWeight:700, letterSpacing:"0.08em",
                  textTransform:"uppercase", color: item.col.text,
                  background: item.col.light, borderTop: gi>0?"1px solid #F0EDEA":"none",
                }}>
                  {item.label}
                </div>
              );
              const { opt, idx } = item;
              const isHi = idx === hiIdx;
              return (
                <div key={opt.id} onMouseDown={()=>select(opt)}
                  onMouseEnter={()=>setHiIdx(idx)}
                  style={{
                    display:"flex", alignItems:"center", gap:"8px",
                    padding:"7px 12px", cursor:"pointer",
                    background: isHi ? opt.col.light : "transparent",
                    borderLeft: isHi ? `3px solid ${opt.col.accent}` : "3px solid transparent",
                  }}
                >
                  {opt.isCollection
                    ? <span style={{ fontSize:"10px", fontWeight:700, background:opt.col.accent, color:"#fff", borderRadius:"4px", padding:"1px 6px", whiteSpace:"nowrap" }}>ALL</span>
                    : <span style={{ width:"8px", height:"8px", borderRadius:"50%", background:opt.col.accent, flexShrink:0, display:"inline-block" }}/>
                  }
                  <span style={{ fontSize:"13px", color:"#292524" }}>{opt.label}</span>
                  {opt.isCollection && <span style={{ fontSize:"10px", color:"#A8A29E", marginLeft:"auto" }}>entire collection</span>}
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}

// ── Clause builder rows ───────────────────────────────────────────────────────
function ClauseBuilder({ clause, onChange, orders }) {
  const update = (patch) => onChange({ ...clause, ...patch });

  if (clause.type === "product") {
    return (
      <div style={{ display:"flex", gap:"6px", alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:"3px" }}>
          {CLAUSE_MODES.map(m => (
            <button key={m.mode} onClick={()=>update({mode:m.mode})} style={{
              padding:"4px 9px", borderRadius:"5px", fontSize:"11px", fontWeight:700, cursor:"pointer",
              border:`1.5px solid ${clause.mode===m.mode ? m.border : "#E7E5E4"}`,
              background: clause.mode===m.mode ? m.bg : "#fff",
              color: clause.mode===m.mode ? m.text : "#78716C",
            }}>{m.label}</button>
          ))}
        </div>
        <ProductPicker
          value={clause.target ? { target:clause.target, targetLabel:clause.targetLabel, isCollection:clause.isCollection } : null}
          onChange={v => v ? update({ target:v.target, targetLabel:v.targetLabel, isCollection:v.isCollection }) : update({ target:null, targetLabel:"", isCollection:false })}
          orders={orders}
        />
      </div>
    );
  }

  if (clause.type === "size") {
    return (
      <div style={{ display:"flex", gap:"6px", alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:"3px" }}>
          {CLAUSE_MODES.map(m => (
            <button key={m.mode} onClick={()=>onChange({...clause,mode:m.mode})} style={{
              padding:"4px 9px", borderRadius:"5px", fontSize:"11px", fontWeight:700, cursor:"pointer",
              border:`1.5px solid ${clause.mode===m.mode ? m.border : "#E7E5E4"}`,
              background: clause.mode===m.mode ? m.bg : "#fff",
              color: clause.mode===m.mode ? m.text : "#78716C",
            }}>{m.label}</button>
          ))}
        </div>
        <div style={{ display:"flex", gap:"4px" }}>
          {[["reg","Regular 📦"],["grand","Grand 🎁"],["none","No size"]].map(([v,lbl]) => (
            <button key={v} onClick={()=>onChange({...clause,size:v})} style={{
              padding:"4px 11px", borderRadius:"6px", fontSize:"12px", fontWeight:700, cursor:"pointer",
              border:`1.5px solid ${clause.size===v?"#F59E0B":"#E7E5E4"}`,
              background: clause.size===v ? "#FEF3C7" : "#fff",
              color: clause.size===v ? "#78350F" : "#78716C",
            }}>{lbl}</button>
          ))}
        </div>
      </div>
    );
  }

  if (clause.type === "itemCount") {
    return (
      <div style={{ display:"flex", gap:"6px", alignItems:"center", flexWrap:"wrap" }}>
        {COUNT_OPS.map(({op,label}) => (
          <button key={op} onClick={()=>update({op})} style={{
            padding:"4px 9px", borderRadius:"5px", fontSize:"11px", fontWeight:700, cursor:"pointer",
            border:`1.5px solid ${clause.op===op?"#6366F1":"#E7E5E4"}`,
            background: clause.op===op ? "#EEF2FF" : "#fff",
            color: clause.op===op ? "#4338CA" : "#78716C",
          }}>{label}</button>
        ))}
        <input type="number" min="1" max="20" value={clause.n}
          onChange={e=>update({n:Math.max(1,parseInt(e.target.value)||1)})}
          style={{ width:"52px", padding:"4px 7px", border:"1.5px solid #E7E5E4", borderRadius:"6px", fontSize:"14px", fontFamily:"'DM Mono',monospace", textAlign:"center", outline:"none" }}
        />
        <span style={{ fontSize:"11px", color:"#A8A29E" }}>total box{clause.n!==1?"es":""}</span>
      </div>
    );
  }

  if (clause.type === "dateRange") {
    return (
      <div style={{ display:"flex", gap:"10px", alignItems:"center", flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
          <span style={{ fontSize:"11px", color:"#78716C", fontWeight:600 }}>From</span>
          <input type="date" value={clause.from||""}
            onChange={e=>update({from:e.target.value})}
            style={{ padding:"4px 7px", border:"1.5px solid #E7E5E4", borderRadius:"6px", fontSize:"12px", outline:"none" }}
          />
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
          <span style={{ fontSize:"11px", color:"#78716C", fontWeight:600 }}>To</span>
          <input type="date" value={clause.to||""}
            onChange={e=>update({to:e.target.value})}
            style={{ padding:"4px 7px", border:"1.5px solid #E7E5E4", borderRadius:"6px", fontSize:"12px", outline:"none" }}
          />
        </div>
      </div>
    );
  }

  if (clause.type === "hasNotes") {
    return (
      <div style={{ display:"flex", gap:"6px" }}>
        {[[true,"Has notes 📝"],[false,"No notes"]].map(([v,lbl]) => (
          <button key={String(v)} onClick={()=>update({value:v})} style={{
            padding:"4px 12px", borderRadius:"20px", cursor:"pointer", fontSize:"12px", fontWeight:700,
            border:`2px solid ${clause.value===v ? (v?"#8B5CF6":"#64748B") : "#E7E5E4"}`,
            background: clause.value===v ? (v?"#EDE9FE":"#F1F5F9") : "#fff",
            color: clause.value===v ? (v?"#4C1D95":"#334155") : "#78716C",
          }}>{lbl}</button>
        ))}
      </div>
    );
  }

  if (clause.type === "status") {
    return (
      <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
        {[["all","All","#374151","#F3F4F6"],["fulfill","Ready","#065F46","#D1FAE5"],["partial","Partial","#92400E","#FEF3C7"],["skip","On Hold","#991B1B","#FEE2E2"]].map(([s,lbl,tc,bg])=>(
          <button key={s} onClick={()=>update({status:s})} style={{
            padding:"4px 12px", borderRadius:"20px", cursor:"pointer", fontSize:"12px", fontWeight:700,
            border:`2px solid ${clause.status===s?tc:"#E7E5E4"}`,
            background: clause.status===s ? bg : "#fff",
            color: clause.status===s ? tc : "#78716C",
          }}>{lbl}</button>
        ))}
      </div>
    );
  }

  return null;
}

// ── Filter type config ────────────────────────────────────────────────────────
const CLAUSE_TYPES = [
  { type:"product",   label:"Product / Collection", icon:"🏷", defaultClause:{ type:"product", mode:"contains", target:null, targetLabel:"", isCollection:false } },
  { type:"size",      label:"Size",                 icon:"📐", defaultClause:{ type:"size", mode:"contains", size:"reg" } },
  { type:"itemCount", label:"# Total Boxes",           icon:"🔢", defaultClause:{ type:"itemCount", op:"exactly", n:1 } },
  { type:"dateRange", label:"Date Range",            icon:"📅", defaultClause:{ type:"dateRange", from:"", to:"" } },
  { type:"hasNotes",  label:"Has Notes",             icon:"📝", defaultClause:{ type:"hasNotes", value:true } },
  { type:"status",    label:"Fulfill Status",        icon:"✅", defaultClause:{ type:"status", status:"fulfill" } },
];

// ── Main BatchFilter component ────────────────────────────────────────────────
function BatchFilter({ clauses, onChange, orders }) {
  const [open, setOpen] = useState(false);
  const active = clauses.length > 0;

  const addClause = (ct) => {
    onChange([...clauses, { ...ct.defaultClause, id: Date.now() }]);
    setOpen(true);
  };

  const removeClause = (id) => onChange(clauses.filter(c=>c.id!==id));

  const updateClause = (id, patch) => onChange(clauses.map(c=>c.id===id ? {...c,...patch} : c));

  const clearAll = () => onChange([]);

  return (
    <div style={{ marginBottom:"12px" }}>
      {/* Header bar */}
      <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap" }}>
        <button onClick={()=>setOpen(o=>!o)} style={{
          display:"flex", alignItems:"center", gap:"6px",
          padding:"7px 13px", borderRadius:"8px", cursor:"pointer", fontSize:"12px", fontWeight:700,
          border:`1.5px solid ${active?"#C9A84C":"#E7E5E4"}`,
          background: active ? "#FFFBEB" : "#fff",
          color: active ? "#78350F" : "#374151",
        }}>
          <span>⚡ Batch Filter</span>
          {active && <span style={{ background:"#C9A84C", color:"#fff", borderRadius:"10px", padding:"1px 7px", fontSize:"10px", fontWeight:700 }}>{clauses.length}</span>}
          <span style={{ fontSize:"9px", color:"#A8A29E" }}>{open?"▲":"▼"}</span>
        </button>

        {/* Active clause pills */}
        {clauses.map(c => (
          <span key={c.id} style={{
            display:"inline-flex", alignItems:"center", gap:"5px",
            background:"#FEF3C7", color:"#78350F", border:"1px solid #FDE68A",
            borderRadius:"20px", padding:"3px 8px 3px 10px", fontSize:"11px", fontWeight:600,
          }}>
            {clauseLabel(c)}
            <button onClick={()=>removeClause(c.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#B45309", fontSize:"13px", fontWeight:700, lineHeight:1, padding:0 }}>×</button>
          </span>
        ))}
        {active && (
          <button onClick={clearAll} style={{ background:"#FEF2F2", color:"#DC2626", border:"1px solid #FECACA", borderRadius:"5px", padding:"3px 9px", fontSize:"11px", fontWeight:700, cursor:"pointer" }}>✕ Clear all</button>
        )}
      </div>

      {/* Panel */}
      {open && (
        <div style={{ background:"#fff", border:"1.5px solid #E7E5E4", borderRadius:"12px", padding:"14px", marginTop:"8px" }}>

          {/* Existing clauses */}
          {clauses.length > 0 && (
            <div style={{ display:"grid", gap:"8px", marginBottom:"12px" }}>
              {clauses.map((clause, ci) => {
                const ct = CLAUSE_TYPES.find(t=>t.type===clause.type);
                return (
                  <div key={clause.id} style={{
                    display:"flex", gap:"8px", alignItems:"flex-start",
                    background:"#F7F6F3", borderRadius:"8px", padding:"10px 12px",
                    border:"1px solid #E7E5E4",
                  }}>
                    {/* Connector label */}
                    <div style={{ width:"28px", flexShrink:0, paddingTop:"6px" }}>
                      {ci === 0
                        ? <span style={{ fontSize:"9px", fontWeight:700, color:"#A8A29E", textTransform:"uppercase" }}>Where</span>
                        : <span style={{ fontSize:"9px", fontWeight:700, color:"#6366F1", background:"#EEF2FF", borderRadius:"4px", padding:"2px 5px" }}>AND</span>
                      }
                    </div>
                    {/* Type badge */}
                    <div style={{ flexShrink:0, paddingTop:"3px" }}>
                      <span style={{ fontSize:"10px", fontWeight:700, color:"#57534E", background:"#E7E5E4", borderRadius:"4px", padding:"2px 7px" }}>{ct?.icon} {ct?.label}</span>
                    </div>
                    {/* Builder */}
                    <div style={{ flex:1 }}>
                      <ClauseBuilder clause={clause} onChange={patch=>updateClause(clause.id,patch)} orders={orders}/>
                    </div>
                    {/* Remove */}
                    <button onClick={()=>removeClause(clause.id)} style={{
                      background:"none", border:"1px solid #FECACA", borderRadius:"5px",
                      color:"#DC2626", cursor:"pointer", fontSize:"13px", fontWeight:700,
                      padding:"2px 7px", flexShrink:0,
                    }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add new clause buttons */}
          <div style={{ display:"flex", gap:"6px", flexWrap:"wrap", alignItems:"center" }}>
            <span style={{ fontSize:"10px", fontWeight:700, color:"#A8A29E", textTransform:"uppercase", letterSpacing:"0.06em", marginRight:"2px" }}>
              {clauses.length ? "+ Add another" : "+ Add filter"}
            </span>
            {CLAUSE_TYPES.map(ct => (
              <button key={ct.type} onClick={()=>addClause(ct)} style={{
                display:"flex", alignItems:"center", gap:"4px",
                padding:"4px 10px", borderRadius:"6px", cursor:"pointer",
                fontSize:"11px", fontWeight:600,
                border:"1.5px solid #E7E5E4", background:"#F7F6F3", color:"#374151",
              }}>
                <span>{ct.icon}</span>{ct.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
const ALL_SKUS = Object.keys(SKU_MAP);
const ZERO_INVENTORY = Object.fromEntries(ALL_SKUS.map(s=>[s,0]));

// ─── Weights Tab ──────────────────────────────────────────────────────────────
function WeightsTab({ weights, setWeights }) {

  const setCell = (col, idx, val) => {
    setWeights(prev => ({...prev, [col]: prev[col].map((v,i)=>i===idx?val:v)}));
  };

  const colStyle = (col) => ({
    reg:   { accent:"#92400E", light:"#FFFBEB", border:"#FDE68A" },
    grand: { accent:"#78350F", light:"#FEF3C7", border:"#FCD34D" },
  }[col]);

  return (
    <div style={{maxWidth:"480px", margin:"0 auto", padding:"32px 24px"}}>
      <h2 style={{fontSize:"18px", fontWeight:700, color:"#1C1917", marginBottom:"4px"}}>Shipping Weights</h2>
      <p style={{fontSize:"12px", color:"#A8A29E", marginBottom:"28px", lineHeight:"1.5"}}>
        Click any weight to edit. Values in lbs — used for label printing.
      </p>

      <div style={{background:"#fff", border:"1.5px solid #E7E5E4", borderRadius:"14px", overflow:"hidden"}}>
        <table style={{width:"100%", borderCollapse:"collapse"}}>
          <thead>
            <tr style={{background:"#F7F6F3"}}>
              <th style={{padding:"10px 20px", width:"60px", fontSize:"11px", fontWeight:700, color:"#A8A29E", textTransform:"uppercase", letterSpacing:"0.06em", textAlign:"center", borderBottom:"2px solid #E7E5E4"}}>#</th>
              {["reg","grand"].map(col => {
                const s = colStyle(col);
                return (
                  <th key={col} style={{padding:"10px 20px", fontSize:"12px", fontWeight:700, color:s.accent, textAlign:"center", borderBottom:"2px solid #E7E5E4", letterSpacing:"0.02em"}}>
                    Gourmet {col==="reg"?"Regular":"Grand"}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {[0,1,2].map(i => (
              <tr key={i} style={{borderBottom: i<2?"1px solid #F0EDEA":"none"}}>
                <td style={{textAlign:"center", padding:"14px 20px", fontSize:"22px", fontWeight:700, color:"#D6D3CD", fontFamily:"'DM Mono',monospace"}}>{i+1}</td>
                {["reg","grand"].map(col => {
                  const s = colStyle(col);
                  const val = weights[col][i];
                  return (
                    <td key={col} style={{textAlign:"center", padding:"10px 16px"}}>
                      <div style={{display:"inline-flex", alignItems:"center", gap:"4px", background:val?s.light:"#F9FAFB", border:`1.5px solid ${val?s.border:"#E7E5E4"}`, borderRadius:"10px", padding:"8px 14px"}}>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={val}
                          placeholder="—"
                          onChange={e => setCell(col, i, e.target.value)}
                          style={{
                            width:"52px", border:"none", background:"transparent",
                            fontSize:"22px", fontWeight:700, textAlign:"center",
                            fontFamily:"'DM Mono',monospace", color: val?s.accent:"#C4B5A5",
                            outline:"none",
                          }}
                        />
                        <span style={{fontSize:"12px", color:"#A8A29E", fontWeight:500}}>lbs</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{fontSize:"11px", color:"#C4B5A5", marginTop:"16px", textAlign:"center"}}>
        These are your real measured weights — edit directly to match your scale.
      </p>
    </div>
  );
}

// ─── Shopify Order Fetcher ────────────────────────────────────────────────────
// Calls the Vercel serverless proxy at /api/shopify-orders
// (which securely forwards to Shopify with your token server-side)
async function fetchShopifyOrders() {
  const res = await fetch("/api/shopify-orders");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${res.status}`);
  }
  const data = await res.json();
  return data.orders || [];
}

function mapShopifyOrders(rawOrders) {
  // Reuse same shape as parseShopifyCSV output
  const mapped = rawOrders.map(o => {
    const name = [o.shipping_address?.first_name, o.shipping_address?.last_name].filter(Boolean).join(" ")
      || o.billing_address?.name || o.email || "Unknown";
    const city  = o.shipping_address?.city  || "";
    const prov  = o.shipping_address?.province_code || o.shipping_address?.province || "";
    const items = (o.line_items || [])
      .filter(li => li.fulfillment_status !== "fulfilled")
      .map(li => ({ sku: li.sku || li.name, qty: li.quantity, name: li.name }))
      .filter(li => li.sku);
    return {
      id:     String(o.order_number || o.id),
      date:   (o.created_at || "").slice(0, 10),
      name:   name.trim(),
      city, province: prov,
      items,
      notes:  o.note || "",
      status: "skip",
    };
  }).filter(o => o.items.length > 0);

  // Sort ascending by order number (oldest first) — same as CSV
  return mapped.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export default function App() {
  const [inventory, setInventory]   = useState(ZERO_INVENTORY);
  const [orders, setOrders]         = useState([]);
  const [csvLoaded, setCsvLoaded]   = useState(false);
  const [shopifyLoading, setShopifyLoading] = useState(false);
  const [shopifyError,   setShopifyError]   = useState("");
  const [dataSource, setDataSource]         = useState(""); // "shopify" | "csv"
  const [fetchedAt, setFetchedAt]           = useState(null); // Date object
  const [csvError, setCsvError]     = useState("");
  const [csvFilename, setCsvFilename] = useState("");
  const [tab, setTab]               = useState("orders");
  const [dragOver, setDragOver]     = useState(false);
  const [datesReg, setDatesReg]     = useState(DATES_PER_BOX.reg);
  const [weights, setWeights]       = useState({ reg:["2.6","3.6",""], grand:["3.6","5.6",""] });
  const [datesGrand, setDatesGrand] = useState(DATES_PER_BOX.grand);
  const [boxRules, setBoxRules]     = useState(DEFAULT_BOX_RULES);
  const fileRef = useRef();

  const setQty = useCallback((sku,v)=>setInventory(p=>({...p,[sku]:Math.max(0,v)})),[]);
  const applyQuick = useCallback((updates)=>setInventory(p=>({...p,...Object.fromEntries(Object.entries(updates).map(([k,v])=>[k,Math.max(0,v)]))})),[]);

  const [clauses, setClauses] = useState([]);
  const [doneIds, setDoneIds] = useState(new Set()); // manually marked as fulfilled

  const handleFile = useCallback((file)=>{
    if(!file) return;
    setCsvError("");
    const reader = new FileReader();
    reader.onload = (e)=>{
      try {
        const parsed = parseShopifyCSV(e.target.result);
        if(!parsed.length){setCsvError("No unfulfilled paid orders found.");return;}
        setOrders(parsed);setCsvLoaded(true);setCsvFilename(file.name);setTab("orders");setClauses([]);setDoneIds(new Set());setDataSource("csv");setFetchedAt(new Date());
      } catch { setCsvError("Could not parse CSV — use a Shopify orders export."); }
    };
    reader.readAsText(file);
  },[]);

  const loadFromShopify = useCallback(async ()=>{
    setShopifyLoading(true);
    setShopifyError("");
    try {
      const raw = await fetchShopifyOrders();
      const mapped = mapShopifyOrders(raw);
      if (!mapped.length) { setShopifyError("No open paid orders found in your store."); setShopifyLoading(false); return; }
      setOrders(mapped);
      setCsvLoaded(true);
      setCsvFilename(`Shopify Live`);
      setFetchedAt(new Date());
      setTab("orders");
      setClauses([]);
      setDoneIds(new Set());
      setDataSource("shopify");
    } catch(err) {
      setShopifyError(err.message.includes("Failed to fetch")
        ? "CORS error — Shopify blocks direct browser requests. You need to deploy this to Vercel with a proxy. See instructions below."
        : err.message);
    }
    setShopifyLoading(false);
  },[]);

  const onDrop = useCallback((e)=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);},[handleFile]);

  // Deduct done orders from inventory before running fulfillment engine
  const inventoryAfterDone = useMemo(() => {
    const stock = {...inventory};
    for (const order of orders) {
      if (doneIds.has(order.id)) {
        for (const item of order.items) {
          stock[item.sku] = Math.max(0, (stock[item.sku]||0) - item.qty);
        }
      }
    }
    return stock;
  }, [inventory, orders, doneIds]);

  const pendingOrders = useMemo(() => 
    orders
      .filter(o => !doneIds.has(o.id))
      .sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric:true})),
    [orders, doneIds]);
  const doneOrders    = useMemo(() => orders.filter(o =>  doneIds.has(o.id)), [orders, doneIds]);

  const {fulfilled,partial,unfulfillable,remainingStock} = useMemo(
    ()=>pendingOrders.length?runFulfillment(pendingOrders,inventoryAfterDone):{fulfilled:[],partial:[],unfulfillable:[],remainingStock:{}},
    [pendingOrders,inventoryAfterDone]
  );

  const toggleDone = useCallback((id) => {
    setDoneIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const allOrders = useMemo(()=>[...fulfilled,...partial,...unfulfillable].sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})),[fulfilled,partial,unfulfillable]);
  const activeSKUs = useMemo(()=>{const s=new Set();orders.forEach(o=>o.items.forEach(i=>s.add(i.sku)));return s;},[orders]);
  const skuOrdered = useMemo(()=>{const m={};orders.forEach(o=>o.items.forEach(i=>m[i.sku]=(m[i.sku]||0)+i.qty));return m;},[orders]);
  const skuInfo = useMemo(()=>{
    const m={};
    [...Object.keys(skuOrdered), ...Object.keys(inventory)].forEach(sku=>{
      const ord = skuOrdered[sku]||0;
      const inv = inventory[sku]||0;
      const toMake = Math.max(0, ord-inv);
      const isGourmet = sku.startsWith("G-");
      const isGrand = sku.includes("-L-");
      const datesPerBox = isGrand ? datesGrand : datesReg;
      const dates = isGourmet && toMake>0 ? toMake*datesPerBox : null;
      m[sku]={ord,inv,toMake,dates,isGourmet};
    });
    return m;
  },[skuOrdered,inventory,datesReg,datesGrand]);

  const visible = useMemo(() =>
    allOrders.filter(o => orderMatchesClauses(o, clauses)),
    [allOrders, clauses]
  );

  const TABS = [["orders","📦 Orders"],["inventory","📋 Inventory"],["boxes","📫 Boxes"],["prep","📋 Prep Plan"],["weights","⚖️ Weights"]];

  return (
    <TooltipLayer>
    <div id="sahara-root" style={{minHeight:"100vh",background:"#F7F6F3",fontFamily:"'DM Sans',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500;600&display=swap');
        @keyframes fadeSlide{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
        input[type=number]{-moz-appearance:textfield;}
        .fc:hover{transform:translateY(-1px);transition:transform 0.12s;}
        #sahara-root, #sahara-root * { text-align: left; font-family: 'DM Sans', sans-serif; line-height: normal; }
        #sahara-root button { font-family: inherit; }
        #sahara-root input { font-family: inherit; text-align: inherit; }
      `}</style>
      {/* Header */}
      <div style={{background:"#1C1917",borderBottom:"3px solid #C9A84C",padding:"18px 28px"}}>
        <div style={{maxWidth:"980px",margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:"9px",marginBottom:"3px"}}>
              <span style={{fontSize:"18px"}}>🌴</span>
              <h1 style={{color:"#F5EFE3",margin:0,fontSize:"17px",fontWeight:700,letterSpacing:"-0.02em"}}>Sahara Delights — Fulfillment</h1>
              <span style={{fontSize:"10px",fontWeight:600,color:"#78716C",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"5px",padding:"2px 7px",letterSpacing:"0.04em"}}>v8</span>
            </div>
            <p style={{color:"#78716C",margin:0,fontSize:"11px"}}>
              {csvLoaded ? (
                <>
                  <span>{dataSource==="shopify" ? "🟢 Shopify Live" : `📄 ${csvFilename}`}</span>
                  {fetchedAt && <span> · {fetchedAt.toLocaleDateString()} {fetchedAt.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span>}
                  <span> · {orders.length} unfulfilled orders</span>
                </>
              ) : "Load orders from Shopify or upload a CSV"}
            </p>
          </div>
          <div style={{display:"flex",gap:"6px"}}>
            {TABS.map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} style={{
                background:tab===k?"#C9A84C":"rgba(255,255,255,0.08)",
                color:tab===k?"#1C1917":"#A8A29E",
                border:"none",borderRadius:"8px",padding:"7px 15px",
                fontSize:"13px",fontWeight:tab===k?700:500,cursor:"pointer",transition:"all 0.15s",
              }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:"980px",margin:"0 auto",padding:"20px 20px 60px"}}>

        {/* ── ORDERS TAB ── */}
        {tab==="orders"&&(
          <>
            {!csvLoaded?(
              <div style={{marginBottom:"20px"}}>
                {/* ── Shopify Live Load ── */}
                <div style={{background:"#fff", border:"1.5px solid #E7E5E4", borderRadius:"14px", padding:"28px 28px", marginBottom:"12px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"20px", flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontSize:"15px", fontWeight:700, color:"#1C1917", marginBottom:"3px"}}>🟢 Load from Shopify</div>
                    <div style={{fontSize:"12px", color:"#78716C"}}>Fetch your live open orders directly — no export needed</div>
                    {shopifyError && <div style={{fontSize:"11px", color:"#DC2626", marginTop:"6px", maxWidth:"480px", lineHeight:"1.5"}}>{shopifyError}</div>}
                  </div>
                  <button onClick={loadFromShopify} disabled={shopifyLoading} style={{
                    background: shopifyLoading ? "#E7E5E4" : "#1C1917",
                    color: shopifyLoading ? "#78716C" : "#C9A84C",
                    border:"2px solid #C9A84C", borderRadius:"10px",
                    padding:"10px 24px", fontSize:"13px", fontWeight:700,
                    cursor: shopifyLoading ? "not-allowed" : "pointer",
                    whiteSpace:"nowrap", minWidth:"160px",
                    transition:"all 0.15s",
                  }}>
                    {shopifyLoading ? "⏳ Loading..." : "↓ Fetch Orders"}
                  </button>
                </div>

                {/* ── CSV Upload ── */}
                <div style={{position:"relative"}}>
                  <div style={{display:"flex", alignItems:"center", gap:"10px", marginBottom:"10px"}}>
                    <div style={{flex:1, height:"1px", background:"#E7E5E4"}}/>
                    <span style={{fontSize:"11px", color:"#A8A29E", fontWeight:600}}>OR</span>
                    <div style={{flex:1, height:"1px", background:"#E7E5E4"}}/>
                  </div>
                  <div onDrop={onDrop} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onClick={()=>fileRef.current.click()}
                    style={{border:`2px dashed ${dragOver?"#C9A84C":"#D6D3CD"}`,borderRadius:"14px",padding:"36px 24px",textAlign:"center",background:dragOver?"#FFFBEB":"#fff",cursor:"pointer",transition:"all 0.2s"}}>
                    <div style={{fontSize:"28px",marginBottom:"8px"}}>📂</div>
                    <div style={{fontSize:"14px",fontWeight:600,color:"#292524",marginBottom:"4px"}}>Drop a Shopify orders CSV here</div>
                    <div style={{fontSize:"11px",color:"#78716C",marginBottom:"14px"}}>or click to browse · from Orders → Export in Shopify admin</div>
                    <span style={{background:"#F5F4F1",color:"#57534E",padding:"7px 18px",borderRadius:"8px",fontSize:"12px",fontWeight:600,border:"1px solid #E7E5E4"}}>Choose File</span>
                    {csvError&&<div style={{color:"#DC2626",fontSize:"12px",marginTop:"14px"}}>{csvError}</div>}
                    <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
                  </div>
                </div>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",border:"1.5px solid #E7E5E4",borderRadius:"10px",padding:"11px 15px",marginBottom:"14px",gap:"10px",flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:"9px"}}>
                  <span style={{fontSize:"18px"}}>{dataSource==="shopify"?"🟢":"✅"}</span>
                  <div>
                    <div style={{fontSize:"13px",fontWeight:600,color:"#292524"}}>{csvFilename}</div>
                    <div style={{fontSize:"11px",color:"#78716C"}}>{orders.length} orders · sorted oldest first</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                  {dataSource==="shopify" && (
                    <button onClick={loadFromShopify} disabled={shopifyLoading} style={{background:"#F0FDF4",color:"#166534",border:"1px solid #BBF7D0",borderRadius:"6px",padding:"5px 12px",fontSize:"12px",cursor:"pointer",fontWeight:600}}>
                      {shopifyLoading?"⏳ Refreshing...":"↻ Refresh"}
                    </button>
                  )}
                  <button onClick={()=>{setCsvLoaded(false);setOrders([]);setCsvFilename("");setCsvError("");setDataSource("");if(fileRef.current)fileRef.current.value="";}}
                    style={{background:"#FEF2F2",color:"#DC2626",border:"1px solid #FECACA",borderRadius:"6px",padding:"5px 12px",fontSize:"12px",cursor:"pointer",fontWeight:600}}>
                    {dataSource==="shopify"?"✕ Disconnect":"Replace CSV"}
                  </button>
                </div>
                <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
              </div>
            )}
            {csvLoaded&&(
              <>
                {/* ── Status summary cards ── */}
                <div style={{display:"flex",gap:"8px",marginBottom:"14px",flexWrap:"wrap"}}>
                  {[
                    {label:"Can Fulfill",count:fulfilled.length,    status:"fulfill",bg:"#ECFDF5",border:"#6EE7B7",text:"#065F46",active:"#D1FAE5"},
                    {label:"Partial",    count:partial.length,      status:"partial",bg:"#FFFBEB",border:"#FCD34D",text:"#92400E",active:"#FEF3C7"},
                    {label:"On Hold",   count:unfulfillable.length, status:"skip",   bg:"#FFF1F2",border:"#FCA5A5",text:"#991B1B",active:"#FEE2E2"},
                    {label:"✓ Done",    count:doneOrders.length,    status:"done",   bg:"#F0FDF4",border:"#86EFAC",text:"#166534",active:"#DCFCE7"},
                    {label:"Total",     count:orders.length,        status:"all",    bg:"#F8FAFC",border:"#CBD5E1",text:"#334155",active:"#E2E8F0"},
                  ].map(s=>(
                    <button key={s.status} className="fc"
                      onClick={()=>{
                        const existing = clauses.find(c=>c.type==="status");
                        if (s.status==="all") { setClauses(clauses.filter(c=>c.type!=="status")); return; }
                        if (existing) setClauses(clauses.map(c=>c.type==="status"?{...c,status:s.status}:c));
                        else setClauses([...clauses,{type:"status",status:s.status,id:Date.now()}]);
                      }}
                      style={{flex:"1",minWidth:"90px",
                        background:(s.status==="all"?clauses.every(c=>c.type!=="status"):clauses.some(c=>c.type==="status"&&c.status===s.status))?s.active:s.bg,
                        border:`2px solid ${(s.status==="all"?clauses.every(c=>c.type!=="status"):clauses.some(c=>c.type==="status"&&c.status===s.status))?s.border:"#E7E5E4"}`,
                        borderRadius:"10px",padding:"11px 13px",cursor:"pointer",textAlign:"left"}}>
                      <div style={{fontSize:"22px",fontWeight:700,color:s.text,fontFamily:"'DM Mono',monospace"}}>{s.count}</div>
                      <div style={{fontSize:"11px",color:"#78716C",marginTop:"2px"}}>{s.label}</div>
                    </button>
                  ))}
                </div>

                {/* ── Quick Views ── */}
                {csvLoaded && (() => {
                  const QUICK_VIEWS = [
                    {
                      label: "Solo Reg", sublabel: "1 Gourmet Regular",
                      clauses: [
                        { id:1, type:"product", target:"G-", targetLabel:"Gourmet (whole collection)", mode:"only", isCollection:true },
                        { id:2, type:"itemCount", op:"exactly", n:1 },
                        { id:3, type:"size", size:"reg", mode:"only" },
                      ],
                    },
                    {
                      label: "Duo Reg", sublabel: "2 Gourmet Regulars",
                      clauses: [
                        { id:1, type:"product", target:"G-", targetLabel:"Gourmet (whole collection)", mode:"only", isCollection:true },
                        { id:2, type:"itemCount", op:"exactly", n:2 },
                        { id:3, type:"size", size:"reg", mode:"only" },
                      ],
                    },
                    {
                      label: "Solo Grand", sublabel: "1 Gourmet Grand",
                      clauses: [
                        { id:1, type:"product", target:"G-", targetLabel:"Gourmet (whole collection)", mode:"only", isCollection:true },
                        { id:2, type:"itemCount", op:"exactly", n:1 },
                        { id:3, type:"size", size:"grand", mode:"only" },
                      ],
                    },
                    {
                      label: "Duo Grand", sublabel: "2 Gourmet Grands",
                      clauses: [
                        { id:1, type:"product", target:"G-", targetLabel:"Gourmet (whole collection)", mode:"only", isCollection:true },
                        { id:2, type:"itemCount", op:"exactly", n:2 },
                        { id:3, type:"size", size:"grand", mode:"only" },
                      ],
                    },
                  ];
                  const stripId = c => { const {id, ...rest} = c; return rest; };
                  const activeKey = JSON.stringify(clauses.map(stripId));
                  const viewKey = (v) => JSON.stringify(v.clauses.map(stripId));
                  return (
                    <div style={{display:"flex", gap:"8px", marginBottom:"10px", flexWrap:"wrap"}}>
                      {QUICK_VIEWS.map(v => {
                        const isActive = activeKey === viewKey(v);
                    const weightMap = { "Solo Reg": weights.reg[0], "Duo Reg": weights.reg[1], "Solo Grand": weights.grand[0], "Duo Grand": weights.grand[1] };
                      return (
                          <button key={v.label} onClick={() => setClauses(isActive ? [] : v.clauses.map((c,i)=>({...c, id:Date.now()+i})))} style={{
                            padding:"7px 14px", borderRadius:"10px", cursor:"pointer",
                            fontSize:"12px", fontWeight:700,
                            border: isActive ? "2px solid #D97706" : "2px solid #FDE68A",
                            background: isActive ? "#FEF3C7" : "#fff",
                            color: "#78350F",
                            display:"flex", flexDirection:"column", alignItems:"flex-start", gap:"1px",
                            transition:"all 0.15s",
                            boxShadow: isActive ? "inset 0 0 0 1px #FCD34D, 0 1px 4px rgba(217,119,6,0.15)" : "none",
                          }}>
                            <span style={{color: isActive ? "#92400E" : "#78350F"}}>{v.label}</span>
                            <span style={{fontSize:"9px", fontWeight:500, color:"#B45309", opacity:0.7}}>{v.sublabel}</span>
                            {weightMap[v.label] && <span style={{fontSize:"10px", fontWeight:700, color: isActive ? "#D97706" : "#92400E", marginTop:"1px"}}>{weightMap[v.label]} lbs</span>}
                          </button>
                        );
                      })}
                      {clauses.length > 0 && !QUICK_VIEWS.some(v => activeKey === viewKey(v)) && (
                        <button onClick={() => setClauses([])} style={{
                          padding:"5px 10px", borderRadius:"8px", cursor:"pointer",
                          fontSize:"11px", fontWeight:600, border:"2px solid #E5E7EB",
                          background:"#F9FAFB", color:"#6B7280",
                        }}>✕ Clear</button>
                      )}
                    </div>
                  );
                })()}

                {/* ── Batch Filter ── */}
                <BatchFilter clauses={clauses} onChange={setClauses} orders={allOrders} />

                {/* Order list header */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"9px"}}>
                  <div style={{fontSize:"13px",fontWeight:700,color:"#44403C"}}>
                    {visible.length} of {allOrders.length} order{allOrders.length!==1?"s":""}
                    {clauses.length>0 ? " — filtered" : ""}
                  </div>
                </div>
                {visible.length===0
                  ?<div style={{textAlign:"center",color:"#A8A29E",padding:"44px",fontSize:"13px"}}>No orders match this filter.</div>
                  :visible.map((order,i)=><OrderCard key={order.id} order={order} index={i} onMarkDone={toggleDone} skuInfo={skuInfo}/>)
                }

                {/* ── Done / Fulfilled bucket ── */}
                {doneOrders.length > 0 && (
                  <div style={{marginTop:"24px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px",paddingBottom:"8px",borderBottom:"2px solid #D1FAE5"}}>
                      <span style={{fontSize:"13px",fontWeight:700,color:"#166534"}}>✓ Fulfilled ({doneOrders.length})</span>
                      <span style={{fontSize:"11px",color:"#6EE7B7"}}>inventory deducted · click ↩ Undo to move back</span>
                      <button onClick={()=>setDoneIds(new Set())} style={{marginLeft:"auto",background:"none",border:"1px solid #D6D3CD",borderRadius:"5px",padding:"2px 8px",fontSize:"11px",cursor:"pointer",color:"#78716C"}}>Clear all</button>
                    </div>
                    {doneOrders.map((order,i)=><OrderCard key={order.id} order={order} index={i} onMarkDone={toggleDone} isDone skuInfo={skuInfo}/>)}
                  </div>
                )}
              </>
            )}
            {!csvLoaded&&<div style={{textAlign:"center",color:"#A8A29E",padding:"20px",fontSize:"13px"}}>Upload a CSV above, then set inventory in the Inventory tab.</div>}
          </>
        )}

        {/* ── INVENTORY TAB ── */}
        {tab==="inventory"&&(
          <>
            <QuickInput onApply={applyQuick}/>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px"}}>
              <div style={{fontSize:"13px",fontWeight:600,color:"#57534E"}}>All Products</div>
              <button onClick={()=>setInventory(ZERO_INVENTORY)} style={{background:"#FEF2F2",color:"#DC2626",border:"1px solid #FECACA",borderRadius:"6px",padding:"5px 12px",fontSize:"11px",cursor:"pointer",fontWeight:600}}>Reset All to 0</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 180px 180px",gap:"0 12px",padding:"5px 16px",marginBottom:"4px"}}>
              <div style={{fontSize:"10px",color:"#A8A29E",fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>Product</div>
              <div style={{fontSize:"10px",color:"#A8A29E",fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",textAlign:"center"}}>Regular</div>
              <div style={{fontSize:"10px",color:"#A8A29E",fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",textAlign:"center"}}>Grand</div>
            </div>
            {COLLECTION_GROUPS.map(group=>{
              const col=COLLECTION_COLORS[group.prefix];
              return (
                <div key={group.label} style={{background:"#fff",border:`1.5px solid ${col.border}`,borderRadius:"12px",marginBottom:"12px",overflow:"hidden"}}>
                  <div style={{background:col.light,borderBottom:`1px solid ${col.border}`,padding:"8px 16px",display:"flex",alignItems:"center",gap:"8px"}}>
                    <div style={{width:"7px",height:"7px",borderRadius:"50%",background:col.accent,flexShrink:0}}/>
                    <span style={{fontSize:"11px",fontWeight:700,color:col.text,letterSpacing:"0.07em",textTransform:"uppercase"}}>{group.label} Collection</span>
                    {csvLoaded&&group.pairs.some(([,r,g])=>activeSKUs.has(r)||activeSKUs.has(g))&&(
                      <span style={{fontSize:"9px",background:col.accent,color:"#fff",borderRadius:"10px",padding:"1px 7px",fontWeight:700}}>In Orders</span>
                    )}
                  </div>
                  {group.pairs.map(([name,regSku,grandSku],pi)=>{
                    const regInOrders=csvLoaded&&activeSKUs.has(regSku);
                    const grandInOrders=csvLoaded&&grandSku&&activeSKUs.has(grandSku);
                    const rowActive=regInOrders||grandInOrders;
                    const regDeficit = csvLoaded ? (inventory[regSku]||0) - (skuOrdered[regSku]||0) : null;
                    const grandDeficit = csvLoaded && grandSku ? (inventory[grandSku]||0) - (skuOrdered[grandSku]||0) : null;
                    return (
                      <div key={name} style={{display:"grid",gridTemplateColumns:"1fr 180px 180px",gap:"0 12px",padding:"10px 16px",alignItems:"center",background:rowActive?col.light:"transparent",borderBottom:pi<group.pairs.length-1?`1px solid ${col.muted||"#F5F5F4"}`:"none"}}>
                        <div>
                          <div style={{fontSize:"13px",fontWeight:rowActive?700:500,color:rowActive?col.text:"#57534E"}}>{name}</div>
                          {csvLoaded&&rowActive&&<div style={{fontSize:"9px",color:col.accent,fontWeight:600,marginTop:"1px"}}>in orders</div>}
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"3px"}}>
                          <InlineStepper value={inventory[regSku]||0} onChange={v=>setQty(regSku,v)} col={col}/>
                          {csvLoaded&&regInOrders&&regDeficit!==null&&(
                            <div style={{fontSize:"10px",color:regDeficit<0?"#DC2626":regDeficit===0?"#F59E0B":"#059669",fontFamily:"'DM Mono',monospace",fontWeight:600}}>{regDeficit>0?`+${regDeficit}`:regDeficit}</div>
                          )}
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"3px"}}>
                          {grandSku?(
                            <>
                              <InlineStepper value={inventory[grandSku]||0} onChange={v=>setQty(grandSku,v)} col={col}/>
                              {csvLoaded&&grandInOrders&&grandDeficit!==null&&(
                                <div style={{fontSize:"10px",color:grandDeficit<0?"#DC2626":grandDeficit===0?"#F59E0B":"#059669",fontFamily:"'DM Mono',monospace",fontWeight:600}}>{grandDeficit>0?`+${grandDeficit}`:grandDeficit}</div>
                              )}
                            </>
                          ):<span style={{fontSize:"11px",color:"#D6D3CD"}}>—</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}

        {/* ── BOXES TAB ── */}
        {tab==="boxes"&&(
          <BoxesTab orders={orders} rules={boxRules} onRulesChange={setBoxRules}/>
        )}

        {/* ── PREP PLAN TAB ── */}
        {tab==="prep"&&(
          <PrepPlanTab orders={orders} inventory={inventory} csvLoaded={csvLoaded} csvFilename={csvFilename} datesReg={datesReg} setDatesReg={setDatesReg} datesGrand={datesGrand} setDatesGrand={setDatesGrand}/>
        )}
        {tab==="weights"&&<WeightsTab weights={weights} setWeights={setWeights}/>}
      </div>
    </div>
    </TooltipLayer>
  );
}
