import { useState, useEffect } from "react";
import smartCVLogo from "./assets/SmartCV.svg";
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";

const OPENAI_MODEL = "gpt-4o";

// profile.local.js is gitignored — put your real data there.
// Falls back to profile.default.js (dummy data) when the local file doesn't exist.
const _profileModules = import.meta.glob(["./profile.local.js", "./profile.default.js"], { eager: true });
const YOUR_PROFILE = (_profileModules["./profile.local.js"] || _profileModules["./profile.default.js"]).default;
// ── COLOURS ──────────────────────────────────────────────────────────────────
const C = {
  bg:           "#F8FAFC",
  surface:      "#F1F5F9",
  card:         "#FFFFFF",
  border:       "#E2E8F0",
  // Single blue accent family — all decorative colour comes from here
  blue:         "#3b82f6",
  blueDark:     "#1d4ed8",
  blueMid:      "#60a5fa",   // blue-400 — score bar variant
  blueFaded:    "#EFF6FF",   // blue-50 — surface tint
  blueBorder:   "#BFDBFE",   // blue-200
  blueText:     "#1d4ed8",   // dark blue text on blueFaded
  purple:       "#8b5cf6",   // kept only for GRAD
  // Semantic only — success / error
  green:        "#166534",
  greenBg:      "#DCFCE7",
  greenBorder:  "#86efac",
  red:          "#991B1B",
  redBg:        "#FEE2E2",
  // Text
  textPrimary:  "#1E293B",
  textSecondary:"#64748B",
  textMuted:    "#94A3B8",
};

const GRAD = `linear-gradient(135deg, ${C.blue}, ${C.purple})`;
// Score bar colours — three shades of blue so the bars feel unified
const BAR_COLORS = { keyword: C.blue, structure: C.blueDark, quant: C.blueMid };

// ── ATS SCORING ──────────────────────────────────────────────────────────────
function profileToText(profile, useTailored, tailored) {
  const summary   = (useTailored && tailored?.tailoredSummary)          || profile.summary || "";
  const skillCats = (useTailored && tailored?.reorderedSkillCategories) || profile.skillCategories || [];
  const projects  = (useTailored && tailored?.reorderedProjects)        || profile.projects || [];
  const exp       = (useTailored && tailored?.reorderedExperience)      || profile.experience || [];
  return [
    summary,
    ...skillCats.flatMap(c => [c.category, ...(c.skills || [])]),
    ...projects.flatMap(p => [p.role, p.name, ...((useTailored && p.tailoredBullets) || p.bullets || [])]),
    ...exp.flatMap(e => [e.role, e.company, ...((useTailored && e.tailoredBullets) || e.bullets || [])]),
    ...(profile.education || []).flatMap(e => [e.degree, e.institution, e.extra, e.notes])
  ].filter(Boolean).join(" ");
}

function extractJDKeywords(jdText) {
  const softWords = new Set(["the","and","or","for","with","to","a","an","of","in","on","at","is","are","will","be","as","by","that","this","we","you","our","your","their","have","has","from","which","who","can","not","all","more","also","its","it","into","about","such","these","those","other","each","been","than","then","when","while","if","but","out","up","do","so","may","over","per","any","some","they","them","was","were","had","would","could","should","both","well","use","using","used","make","made","work","working","based","need","needs","required","including","experience","ability","strong","excellent","role","team","join","looking","seeking","ideal","candidate","plus","bonus","desired","preferred","responsible","responsibilities","duties","environment","opportunity","company","business","position","knowledge","understanding","familiarity","proficiency","skills","skill","ability","abilities","ensure","support","provide","deliver","drive","manage","build","develop","design","implement","maintain","create","enable","improve","collaborate","communicate","cross","functional"]);
  const jdLower = jdText.toLowerCase();
  // Count word frequency to identify important terms
  const wordFreq = {};
  (jdLower.match(/\b[a-z][a-z0-9+#.\-]{1,30}\b/g) || []).forEach(w => { wordFreq[w] = (wordFreq[w] || 0) + 1; });
  // Extract capitalized/acronym terms from original JD (these are almost always tech/domain keywords)
  const capitalTerms = new Set((jdText.match(/\b[A-Z][A-Za-z0-9+#.\-]{1,30}\b/g) || []).map(w => w.toLowerCase()));
  const allWords = Object.keys(wordFreq);
  const keywords = [...new Set(allWords.filter(w =>
    !softWords.has(w) &&
    w.length > 2 &&
    // Keep if: appears 2+ times, OR is capitalised in original JD, OR looks like a tech term (contains digit, +, #, .)
    (wordFreq[w] >= 2 || capitalTerms.has(w) || /[0-9+#.]/.test(w))
  ))];
  return keywords;
}

function computeATSScore(profile, jdText, useTailored, tailored) {
  // When scoring a tailored CV, match against the union of original + tailored text so that
  // rephrasing a bullet never loses a keyword that's still genuinely on the CV.
  const cvText = useTailored
    ? profileToText(profile, true, tailored) + " " + profileToText(profile, false, {})
    : profileToText(profile, false, {});
  const cvLower = cvText.toLowerCase();
  const jdKeywords = extractJDKeywords(jdText);
  // Stem-aware matching: also match plural/verb forms
  const matched = jdKeywords.filter(kw => {
    if (cvLower.includes(kw)) return true;
    // Check common stem variants
    if (kw.endsWith("ing") && cvLower.includes(kw.slice(0, -3))) return true;
    if (kw.endsWith("ed") && cvLower.includes(kw.slice(0, -2))) return true;
    if (kw.endsWith("s") && kw.length > 4 && cvLower.includes(kw.slice(0, -1))) return true;
    return false;
  });
  const keywordScore = jdKeywords.length > 0 ? Math.round((matched.length / jdKeywords.length) * 100) : 0;
  const missing = jdKeywords.filter(kw => !matched.includes(kw)).slice(0, 15);

  const skillCats = (useTailored && tailored?.reorderedSkillCategories) || profile.skillCategories || [];
  const projects  = (useTailored && tailored?.reorderedProjects)        || profile.projects || [];
  const exp       = (useTailored && tailored?.reorderedExperience)      || profile.experience || [];
  const hasSummary = !!((useTailored && tailored?.tailoredSummary) || profile.summary || "").trim();
  const structScore = Math.round(([skillCats.length>0, projects.length>0, exp.length>0, (profile.education||[]).length>0, hasSummary].filter(Boolean).length / 5) * 100);

  const bullets = [...projects.flatMap(p => (useTailored && p.tailoredBullets) || p.bullets || []), ...exp.flatMap(e => (useTailored && e.tailoredBullets) || e.bullets || [])];
  const quantScore = bullets.length > 0 ? Math.round(Math.min(100, (bullets.filter(b => /\d/.test(b)).length / bullets.length) * 120)) : 0;

  return {
    finalScore: Math.round(keywordScore * 0.55 + structScore * 0.25 + quantScore * 0.20),
    keywordScore, structScore, quantScore,
    matchedCount: matched.length, totalKeywords: jdKeywords.length, missingKeywords: missing
  };
}

// ── ANIMATED SCORE RING ───────────────────────────────────────────────────────
function AnimatedScore({ target, size = 128 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let cur = 0, raf;
    const step = () => {
      cur += (target - cur) * 0.07;
      if (Math.abs(target - cur) < 0.5) cur = target;
      setVal(Math.round(cur));
      if (cur < target) raf = requestAnimationFrame(step);
    };
    const t = setTimeout(() => { raf = requestAnimationFrame(step); }, 300);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [target]);
  const r = size * 0.42, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  const color = val >= 75 ? C.blue : val >= 50 ? C.blueMid : C.red;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth={size * 0.078} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.078}
        strokeDasharray={`${(val / 100) * circ} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "stroke-dasharray 0.04s linear" }} />
      <text x={cx} y={cy - size * 0.06} textAnchor="middle" fill={C.textPrimary}
        style={{ fontSize: size * 0.22, fontWeight: 700, fontFamily: "system-ui" }}>{val}</text>
      <text x={cx} y={cy + size * 0.14} textAnchor="middle" fill={C.textSecondary}
        style={{ fontSize: size * 0.10, fontFamily: "system-ui" }}>/ 100</text>
    </svg>
  );
}

// ── SCORE BAR ─────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, color }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let s = 0; const step = () => { s = Math.min(s + 3, value); setV(s); if (s < value) requestAnimationFrame(step); };
    const t = setTimeout(() => requestAnimationFrame(step), 600); return () => clearTimeout(t);
  }, [value]);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: C.textSecondary }}>
        <span>{label}</span><span style={{ color: C.textPrimary, fontWeight: 600 }}>{v}%</span>
      </div>
      <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${v}%`, background: color, borderRadius: 3, transition: "width 0.03s linear" }} />
      </div>
    </div>
  );
}

// ── DIFF LINE ─────────────────────────────────────────────────────────────────
function DiffLine({ original, tailored, onEdit }) {
  if (original === tailored && !onEdit) return null;
  return (
    <div style={{ marginBottom: 14, animation: "fadeUp 0.4s ease both" }}>
      {original && original !== tailored && (
        <div style={{ fontSize: 12.5, color: C.red, background: C.redBg, border: `1px solid ${C.red}33`, borderRadius: 6, padding: "6px 10px", marginBottom: 6, lineHeight: 1.6, textDecoration: "line-through", opacity: 0.85 }} aria-label="removed">{original}</div>
      )}
      {onEdit ? (
        <textarea
          value={tailored}
          onChange={e => onEdit(e.target.value)}
          rows={Math.max(2, Math.ceil(tailored.length / 90))}
          style={{ width: "100%", fontSize: 12.5, color: C.green, background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 6, padding: "6px 10px", lineHeight: 1.6, resize: "vertical", fontFamily: "inherit", fontWeight: 600, boxSizing: "border-box" }}
          aria-label="edit tailored bullet"
        />
      ) : (
        <div style={{ fontSize: 12.5, color: C.green, background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 6, padding: "6px 10px", lineHeight: 1.6, fontWeight: 600 }} aria-label="added">{tailored}</div>
      )}
    </div>
  );
}

// ── CV PREVIEW ────────────────────────────────────────────────────────────────
function CVPreview({ profile, tailored }) {
  const innerRef = { current: null };
  const [overflow, setOverflow] = useState(false);

  const measureRef = (el) => {
    innerRef.current = el;
    if (!el) return;
    // Use ResizeObserver so measurement fires after layout settles
    const ro = new ResizeObserver(() => {
      setOverflow(el.scrollHeight > el.clientHeight + 2);
    });
    ro.observe(el);
    // Store cleanup on the element itself to disconnect on unmount
    el._ro = ro;
  };

  useEffect(() => {
    return () => { if (innerRef.current?._ro) innerRef.current._ro.disconnect(); };
  }, []);

  const summary    = tailored?.tailoredSummary || profile.summary;
  const skillCats  = tailored?.reorderedSkillCategories || profile.skillCategories || [];
  const projects   = tailored?.reorderedProjects  || profile.projects  || [];
  const experience = tailored?.reorderedExperience || profile.experience || [];
  const education  = profile.education || [];

  // Mirror DOCX margins: 900 twips ≈ 15.9mm → ~6% of A4 width
  const PAD = "5% 6.3%";
  const SH = ({ t }) => (
    <div style={{ marginTop: 7, marginBottom: 3 }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: "#2563eb", letterSpacing: "0.1em", textTransform: "uppercase" }}>{t}</div>
      <div style={{ height: 1, background: "#2563eb", marginTop: 2, opacity: 0.5 }} />
    </div>
  );
  const EntryHeader = ({ left, date }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 1 }}>
      <span style={{ fontWeight: 700, fontSize: 8.5, color: "#1e3a5f" }}>{left}</span>
      {date && <span style={{ fontSize: 7.5, color: "#555", flexShrink: 0, marginLeft: 6 }}>{date}</span>}
    </div>
  );
  const Bullet = ({ text }) => (
    <div style={{ fontSize: 8, color: "#222", lineHeight: 1.45, paddingLeft: 10, marginTop: 1 }}>• {text}</div>
  );

  return (
    <div>
      {/* Outer wrapper: padding-bottom trick locks the height to A4 ratio (297/210 = 141.43%) */}
      <div style={{ position: "relative", width: "100%", paddingBottom: "141.43%", borderRadius: 8, boxShadow: "0 4px 24px #00000040", overflow: "hidden" }}>
        {/* Inner absolutely-positioned page — overflow:hidden clips to exactly 1 page */}
        <div ref={measureRef} style={{
          position: "absolute", inset: 0,
          background: "white", color: "#111",
          fontFamily: "Calibri, Arial, sans-serif",
          padding: PAD, boxSizing: "border-box",
          overflow: "hidden",
        }}>
          {/* Name + contact — centred, matches DOCX */}
          <div style={{ textAlign: "center", marginBottom: 5 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e3a5f", letterSpacing: "0.02em" }}>{profile.name}</div>
            <div style={{ fontSize: 7.5, color: "#444", marginTop: 2 }}>{[profile.location, profile.email, profile.phone, profile.linkedin, profile.portfolio].filter(Boolean).join("  |  ")}</div>
          </div>

          {summary && <><SH t="PROFILE" /><p style={{ margin: "2px 0 4px", fontSize: 8, lineHeight: 1.5, color: "#222" }}>{summary}</p></>}

          {skillCats.length > 0 && <><SH t="TECHNICAL SKILLS" />
            <div style={{ marginBottom: 3 }}>
              {skillCats.map((c, i) => (
                <div key={i} style={{ fontSize: 8, marginBottom: 2, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700 }}>{c.category}: </span>
                  <span style={{ color: "#333" }}>{(c.skills || []).join(", ")}</span>
                </div>
              ))}
            </div>
          </>}

          {projects.length > 0 && <><SH t="KEY PROJECTS" />
            {projects.map((p, i) => (
              <div key={i} style={{ marginBottom: 5 }}>
                <EntryHeader left={[p.role, p.name].filter(Boolean).join(" | ")} date={[p.startDate, p.endDate].filter(Boolean).join(" – ")} />
                {(p.tailoredBullets || p.bullets || []).map((b, j) => <Bullet key={j} text={b} />)}
              </div>
            ))}
          </>}

          {experience.length > 0 && <><SH t="PROFESSIONAL EXPERIENCE" />
            {experience.map((e, i) => (
              <div key={i} style={{ marginBottom: 5 }}>
                <EntryHeader left={`${e.role} | ${e.company}`} date={`${e.startDate} – ${e.endDate}`} />
                {(e.tailoredBullets || e.bullets || []).map((b, j) => <Bullet key={j} text={b} />)}
              </div>
            ))}
          </>}

          {education.length > 0 && <><SH t="EDUCATION" />
            {education.map((ed, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <EntryHeader left={`${ed.degree} | ${ed.institution}`} date={`${ed.startDate} – ${ed.endDate}`} />
                {ed.extra && <div style={{ fontSize: 7.5, color: "#333", marginTop: 1 }}>{ed.extra}</div>}
                {ed.notes && <div style={{ fontSize: 7.5, color: "#555", lineHeight: 1.4, marginTop: 1 }}>{ed.notes}</div>}
              </div>
            ))}
          </>}
        </div>
      </div>
      {overflow && (
        <div style={{ marginTop: 10, padding: "10px 14px", background: "#1c1000", border: "1px solid #f59e0b55", borderRadius: 8, fontSize: 12, color: "#f59e0b" }}>
          Content overflows 1 page — trim some bullets in Edit Profile, or reduce to 3 bullets per project.
        </div>
      )}
    </div>
  );
}

// ── PROFILE FORM ──────────────────────────────────────────────────────────────
function ProfileForm({ profile, setProfile }) {
  const up = (k, v) => setProfile(p => ({ ...p, [k]: v }));
  const upCat = (i, f, v) => { const a = [...(profile.skillCategories||[])]; a[i]={...a[i],[f]:v}; setProfile(p=>({...p,skillCategories:a})); };
  const upProj = (i, f, v) => { const a=[...(profile.projects||[])]; a[i]={...a[i],[f]:v}; setProfile(p=>({...p,projects:a})); };
  const upProjB = (i, t) => { const a=[...(profile.projects||[])]; a[i]={...a[i],bullets:t.split("\n").filter(b=>b.trim())}; setProfile(p=>({...p,projects:a})); };
  const upExp = (i, f, v) => { const a=[...(profile.experience||[])]; a[i]={...a[i],[f]:v}; setProfile(p=>({...p,experience:a})); };
  const upExpB = (i, t) => { const a=[...(profile.experience||[])]; a[i]={...a[i],bullets:t.split("\n").filter(b=>b.trim())}; setProfile(p=>({...p,experience:a})); };
  const upEdu = (i, f, v) => { const a=[...(profile.education||[])]; a[i]={...a[i],[f]:v}; setProfile(p=>({...p,education:a})); };

  const inp = (extra={}) => ({ style:{ width:"100%", boxSizing:"border-box", background:C.surface, border:`1px solid ${C.border}`, color:C.textPrimary, borderRadius:7, padding:"9px 12px", fontSize:13, ...extra.style } });
  const lbl = { style:{ fontSize:11, color:C.textSecondary, display:"block", marginBottom:4, marginTop:10 } };
  const SH = ({ t }) => <div style={{ fontSize:11, fontWeight:700, color:C.blue, textTransform:"uppercase", letterSpacing:"0.1em", marginTop:28, marginBottom:12, borderBottom:`1px solid ${C.border}`, paddingBottom:7 }}>{t}</div>;
  const Card = ({ children, onRemove, label }) => (
    <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 16px", marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <span style={{ fontSize:13, fontWeight:600, color:C.textPrimary }}>{label}</span>
        <button onClick={onRemove} style={{ fontSize:12, color:C.red, background:"transparent", border:"none", cursor:"pointer" }}>Remove</button>
      </div>
      {children}
    </div>
  );
  const addBtn = (label, onClick) => <button onClick={onClick} style={{ fontSize:13, color:C.blue, background:"transparent", border:`1px dashed ${C.border}`, borderRadius:7, padding:"8px 14px", cursor:"pointer", width:"100%", marginBottom:8 }}>{label}</button>;

  return (
    <div>
      <SH t="Contact" />
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {[["Full name","name"],["Email","email"],["Phone","phone"],["Location","location"]].map(([l,k])=>(
          <div key={k}><label {...lbl}>{l}</label><input {...inp()} value={profile[k]||""} onChange={e=>up(k,e.target.value)} /></div>
        ))}
      </div>
      <label {...lbl}>LinkedIn</label><input {...inp()} value={profile.linkedin||""} onChange={e=>up("linkedin",e.target.value)} />
      <label {...lbl}>Portfolio URL</label><input {...inp()} value={profile.portfolio||""} onChange={e=>up("portfolio",e.target.value)} placeholder="yoursite.com" />

      <SH t="Profile summary" />
      <textarea {...inp()} style={{ width:"100%", boxSizing:"border-box", background:C.surface, border:`1px solid ${C.border}`, color:C.textPrimary, borderRadius:7, padding:"9px 12px", fontSize:13, minHeight:90, resize:"vertical" }} value={profile.summary||""} onChange={e=>up("summary",e.target.value)} />

      <SH t="Technical skills" />
      {(profile.skillCategories||[]).map((cat,i)=>(
        <Card key={i} label={`Category ${i+1}`} onRemove={()=>setProfile(p=>({...p,skillCategories:p.skillCategories.filter((_,x)=>x!==i)}))}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:10 }}>
            <div><label {...lbl}>Category</label><input {...inp()} value={cat.category||""} onChange={e=>upCat(i,"category",e.target.value)} /></div>
            <div><label {...lbl}>Skills (comma-separated)</label><input {...inp()} value={(cat.skills||[]).join(", ")} onChange={e=>upCat(i,"skills",e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} /></div>
          </div>
        </Card>
      ))}
      {addBtn("+ Add skill category", ()=>setProfile(p=>({...p,skillCategories:[...(p.skillCategories||[]),{category:"",skills:[]}]})))}

      <SH t="Key projects" />
      {(profile.projects||[]).map((proj,i)=>(
        <Card key={i} label={`Project ${i+1}`} onRemove={()=>setProfile(p=>({...p,projects:p.projects.filter((_,x)=>x!==i)}))}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:8 }}>
            <div><label {...lbl}>Role (optional)</label><input {...inp()} value={proj.role||""} onChange={e=>upProj(i,"role",e.target.value)} /></div>
            <div><label {...lbl}>Project name</label><input {...inp()} value={proj.name||""} onChange={e=>upProj(i,"name",e.target.value)} /></div>
            <div><label {...lbl}>Start</label><input {...inp()} value={proj.startDate||""} onChange={e=>upProj(i,"startDate",e.target.value)} /></div>
            <div><label {...lbl}>End</label><input {...inp()} value={proj.endDate||""} onChange={e=>upProj(i,"endDate",e.target.value)} /></div>
          </div>
          <label {...lbl}>Bullets (one per line)</label>
          <textarea {...inp()} style={{ width:"100%", boxSizing:"border-box", background:C.surface, border:`1px solid ${C.border}`, color:C.textPrimary, borderRadius:7, padding:"9px 12px", fontSize:13, minHeight:90, resize:"vertical" }} value={(proj.bullets||[]).join("\n")} onChange={e=>upProjB(i,e.target.value)} />
        </Card>
      ))}
      {addBtn("+ Add project", ()=>setProfile(p=>({...p,projects:[...(p.projects||[]),{role:"",name:"",startDate:"",endDate:"",bullets:[]}]})))}

      <SH t="Professional experience" />
      {(profile.experience||[]).map((exp,i)=>(
        <Card key={i} label={`Experience ${i+1}`} onRemove={()=>setProfile(p=>({...p,experience:p.experience.filter((_,x)=>x!==i)}))}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:8 }}>
            <div><label {...lbl}>Role</label><input {...inp()} value={exp.role||""} onChange={e=>upExp(i,"role",e.target.value)} /></div>
            <div><label {...lbl}>Company</label><input {...inp()} value={exp.company||""} onChange={e=>upExp(i,"company",e.target.value)} /></div>
            <div><label {...lbl}>Start</label><input {...inp()} value={exp.startDate||""} onChange={e=>upExp(i,"startDate",e.target.value)} /></div>
            <div><label {...lbl}>End</label><input {...inp()} value={exp.endDate||""} onChange={e=>upExp(i,"endDate",e.target.value)} /></div>
          </div>
          <label {...lbl}>Bullets (one per line)</label>
          <textarea {...inp()} style={{ width:"100%", boxSizing:"border-box", background:C.surface, border:`1px solid ${C.border}`, color:C.textPrimary, borderRadius:7, padding:"9px 12px", fontSize:13, minHeight:90, resize:"vertical" }} value={(exp.bullets||[]).join("\n")} onChange={e=>upExpB(i,e.target.value)} />
        </Card>
      ))}
      {addBtn("+ Add experience", ()=>setProfile(p=>({...p,experience:[...(p.experience||[]),{role:"",company:"",startDate:"",endDate:"",bullets:[]}]})))}

      <SH t="Education" />
      {(profile.education||[]).map((ed,i)=>(
        <Card key={i} label={`Education ${i+1}`} onRemove={()=>setProfile(p=>({...p,education:p.education.filter((_,x)=>x!==i)}))}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:8 }}>
            <div><label {...lbl}>Degree</label><input {...inp()} value={ed.degree||""} onChange={e=>upEdu(i,"degree",e.target.value)} /></div>
            <div><label {...lbl}>Institution</label><input {...inp()} value={ed.institution||""} onChange={e=>upEdu(i,"institution",e.target.value)} /></div>
            <div><label {...lbl}>Start</label><input {...inp()} value={ed.startDate||""} onChange={e=>upEdu(i,"startDate",e.target.value)} /></div>
            <div><label {...lbl}>End</label><input {...inp()} value={ed.endDate||""} onChange={e=>upEdu(i,"endDate",e.target.value)} /></div>
          </div>
          <label {...lbl}>WAM / GPA / Honours</label>
          <input {...inp()} style={{ width:"100%", boxSizing:"border-box", background:C.surface, border:`1px solid ${C.border}`, color:C.textPrimary, borderRadius:7, padding:"9px 12px", fontSize:13, marginBottom:8 }} value={ed.extra||""} onChange={e=>upEdu(i,"extra",e.target.value)} />
          <label {...lbl}>Notes</label>
          <input {...inp()} style={{ width:"100%", boxSizing:"border-box", background:C.surface, border:`1px solid ${C.border}`, color:C.textPrimary, borderRadius:7, padding:"9px 12px", fontSize:13 }} value={ed.notes||""} onChange={e=>upEdu(i,"notes",e.target.value)} />
        </Card>
      ))}
      {addBtn("+ Add education", ()=>setProfile(p=>({...p,education:[...(p.education||[]),{degree:"",institution:"",startDate:"",endDate:"",extra:"",notes:""}]})))}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
const LOADING_MSGS = [
  "Reading job description...",
  "Extracting keywords...",
  "Tailoring CV — attempt 1 of 3...",
  "Scoring attempt 1...",
  "Score improved — done!",
  "Retrying — attempt 2 of 3...",
  "Scoring attempt 2...",
  "Score improved — done!",
  "Retrying — attempt 3 of 3...",
  "Finalising best version..."
];

export default function SmartCV() {
  // ── Multi-profile state — loaded from localStorage ──────────────────────
  const [profiles, setProfiles] = useState(() => {
    try {
      const saved = localStorage.getItem("smartcv_profiles");
      if (!saved) return [{ id: "default", label: "Surya – Data Science", data: YOUR_PROFILE }];
      const parsed = JSON.parse(saved);
      // Migrate: fill in any missing top-level fields from YOUR_PROFILE for the default profile
      return parsed.map(p => p.id === "default" ? { ...p, data: { ...YOUR_PROFILE, ...p.data } } : p);
    } catch { return [{ id: "default", label: "Surya – Data Science", data: YOUR_PROFILE }]; }
  });

  const [activeProfileId, setActiveProfileId] = useState(() => {
    return localStorage.getItem("smartcv_active_profile") || "default";
  });

  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];
  const profile = activeProfile.data;

  const setProfile = (updater) => {
    setProfiles(prev => {
      const next = prev.map(p => p.id === activeProfileId
        ? { ...p, data: typeof updater === "function" ? updater(p.data) : updater }
        : p
      );
      localStorage.setItem("smartcv_profiles", JSON.stringify(next));
      return next;
    });
  };

  const switchProfile = (id) => {
    setActiveProfileId(id);
    localStorage.setItem("smartcv_active_profile", id);
  };

  // True if this profile is still the untouched dummy default
  const isPlaceholder = (p) => p.id === "default" && p.data.name === YOUR_PROFILE.name;

  const addProfile = () => {
    const id = `profile_${Date.now()}`;
    const label = `New Profile ${profiles.length + 1}`;
    const newProfile = { id, label, data: { name: "", email: "", phone: "", location: "", linkedin: "", portfolio: "", summary: "", skillCategories: [], projects: [], experience: [], education: [] } };
    // If the only profile is the untouched dummy, replace it instead of adding alongside
    const next = profiles.length === 1 && isPlaceholder(profiles[0])
      ? [newProfile]
      : [...profiles, newProfile];
    setProfiles(next);
    localStorage.setItem("smartcv_profiles", JSON.stringify(next));
    setActiveProfileId(id);
    localStorage.setItem("smartcv_active_profile", id);
    setScreen("profile");
  };

  const deleteProfile = (id) => {
    if (profiles.length === 1) return;
    const next = profiles.filter(p => p.id !== id);
    setProfiles(next);
    localStorage.setItem("smartcv_profiles", JSON.stringify(next));
    if (activeProfileId === id) {
      setActiveProfileId(next[0].id);
      localStorage.setItem("smartcv_active_profile", next[0].id);
    }
  };

  const updateProfileLabel = (id, label) => {
    const next = profiles.map(p => p.id === id ? { ...p, label } : p);
    setProfiles(next);
    localStorage.setItem("smartcv_profiles", JSON.stringify(next));
  };

  const [screen, setScreen]             = useState("home");
  const [jd, setJd]                     = useState("");
  const [iterationMsg, setIterationMsg] = useState("");
  const [result, setResult]             = useState(null);
  const [editedTailored, setEditedTailored] = useState(null);
  const [error, setError]               = useState(null);
  const [resultTab, setResultTab]       = useState("scores");
  const [showPreview, setShowPreview]   = useState(false);
  const [downloading, setDownloading]   = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [editingLabel, setEditingLabel] = useState(null);
  const [addedKws, setAddedKws]         = useState(new Set());
  const [importingCV, setImportingCV]   = useState(false);
  const [importError, setImportError]   = useState(null);
  const apiKey = import.meta.env.VITE_OPENAI_KEY;

  useEffect(() => {
    if (result) { setEditedTailored(JSON.parse(JSON.stringify(result.tailored))); setAddedKws(new Set()); }
  }, [result]);

  const liveScore = editedTailored && jd ? computeATSScore(profile, jd, true, editedTailored) : result?.postScore;

  const [placingKw, setPlacingKw] = useState(null);
  const [kwToast, setKwToast] = useState(null);

  const placeKeywordWithAI = async (kw) => {
    if (addedKws.has(kw) || placingKw) return;
    setPlacingKw(kw);
    try {
      const t = editedTailored || result.tailored;
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          max_completion_tokens: 400,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `You are a CV editor. Given a CV and a missing keyword from a job description, determine where this keyword genuinely fits in the CV. Return ONLY valid JSON with exactly one of these shapes:
{"placement":"skills","skillCategory":"exact existing category name or new one","skillToAdd":"keyword as it should appear in a skills list"}
{"placement":"bullet","section":"projects","entryName":"exact project name","bulletIndex":0,"rewrittenBullet":"rewritten bullet naturally including the keyword, max 120 chars"}
{"placement":"bullet","section":"experience","entryName":"exact company name","bulletIndex":0,"rewrittenBullet":"rewritten bullet naturally including the keyword, max 120 chars"}
{"placement":"summary","newSummary":"rewritten 2-sentence profile summary naturally including the keyword"}
{"placement":"none","reason":"why this keyword doesn't fit anywhere in this CV"}

RULES: Location names (cities, countries) and soft/generic phrases MUST go into summary or bullets, NEVER skills. Only add to skills if the keyword is a genuine technical tool, language, framework, or methodology.` },
            { role: "user", content: `KEYWORD: "${kw}"\n\nCV:\n${JSON.stringify(t, null, 2)}\n\nJD EXCERPT:\n${jd.slice(0, 600)}` }
          ]
        })
      });
      const data = await res.json();
      const suggestion = JSON.parse(data.choices?.[0]?.message?.content || "{}");

      if (suggestion.placement === "none") {
        setKwToast({ msg: `"${kw}" doesn't fit this CV — ${suggestion.reason}`, ok: false });
      } else {
        setEditedTailored(prev => {
          const next = JSON.parse(JSON.stringify(prev));
          if (suggestion.placement === "skills") {
            const cats = next.reorderedSkillCategories || [];
            const cat = cats.find(c => c.category === suggestion.skillCategory);
            if (cat) { if (!cat.skills.includes(suggestion.skillToAdd)) cat.skills.push(suggestion.skillToAdd); }
            else cats.push({ category: suggestion.skillCategory || "Additional", skills: [suggestion.skillToAdd] });
            next.reorderedSkillCategories = cats;
          } else if (suggestion.placement === "bullet") {
            const entries = suggestion.section === "projects" ? next.reorderedProjects : next.reorderedExperience;
            const entry = entries?.find(e => (e.name || e.company) === suggestion.entryName);
            if (entry) {
              if (!entry.tailoredBullets) entry.tailoredBullets = [...(entry.bullets || [])];
              if (suggestion.bulletIndex < entry.tailoredBullets.length) entry.tailoredBullets[suggestion.bulletIndex] = suggestion.rewrittenBullet;
            }
          } else if (suggestion.placement === "summary") {
            next.tailoredSummary = suggestion.newSummary;
          }
          return next;
        });
        const placeLabel = suggestion.placement === "skills" ? `Skills › ${suggestion.skillCategory}` : suggestion.placement === "bullet" ? `${suggestion.section} › ${suggestion.entryName}` : "Profile summary";
        setKwToast({ msg: `"${kw}" added to ${placeLabel}`, ok: true });
        setAddedKws(prev => new Set([...prev, kw]));
      }
    } catch(e) {
      setKwToast({ msg: "Placement failed — try again", ok: false });
    } finally {
      setPlacingKw(null);
      setTimeout(() => setKwToast(null), 3500);
    }
  };

  const extractTextFromPDF = async (file) => {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)));
    const texts = await Promise.all(pages.map(async p => {
      const content = await p.getTextContent();
      return content.items.map(item => item.str).join(" ");
    }));
    return texts.join("\n");
  };

  const parseCVWithAI = async (text) => {
    if (!apiKey) { setImportError("VITE_OPENAI_KEY not set in .env file."); return; }
    setImportingCV(true); setImportError(null);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          max_completion_tokens: 2000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `Extract structured CV data from the text and return ONLY valid JSON matching this exact shape:
{
  "name": "full name",
  "email": "email address",
  "phone": "phone number",
  "location": "city, state/country",
  "linkedin": "linkedin url or handle",
  "portfolio": "portfolio website url or empty string",
  "summary": "professional summary paragraph",
  "skillCategories": [{ "category": "category name", "skills": ["skill1", "skill2"] }],
  "projects": [{ "name": "project name", "role": "role/title", "startDate": "Mon YYYY", "endDate": "Mon YYYY or Present", "bullets": ["bullet 1", "bullet 2"] }],
  "experience": [{ "company": "company name", "role": "job title", "startDate": "Mon YYYY", "endDate": "Mon YYYY or Present", "bullets": ["bullet 1", "bullet 2"] }],
  "education": [{ "degree": "degree name", "institution": "university name", "startDate": "Mon YYYY", "endDate": "Mon YYYY or Present", "extra": "GPA/WAM/honours info", "notes": "relevant coursework or notes" }]
}
Use empty arrays [] for any section not found. Never invent data not present in the CV.` },
            { role: "user", content: text.slice(0, 8000) }
          ]
        })
      });
      const data = await res.json();
      const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
      if (!parsed.name) { setImportError("Couldn't extract profile data — try uploading a clearer PDF."); return; }
      setProfile(parsed);
      // Rename the profile label to the person's name and drop the dummy if still present
      setProfiles(prev => {
        const updated = prev.map(p => p.id === activeProfileId ? { ...p, label: parsed.name } : p);
        const withoutDummy = updated.filter(p => !(p.id === "default" && p.data.name === YOUR_PROFILE.name && p.id !== activeProfileId));
        const next = withoutDummy.length ? withoutDummy : updated;
        localStorage.setItem("smartcv_profiles", JSON.stringify(next));
        return next;
      });
    } catch(e) {
      setImportError("Parse failed — " + e.message);
    } finally {
      setImportingCV(false);
    }
  };

  const handleCVFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      let text = "";
      if (file.type === "application/pdf") {
        text = await extractTextFromPDF(file);
      } else {
        text = await file.text();
      }
      await parseCVWithAI(text);
    } catch(e) {
      setImportError("Could not read file — " + e.message);
    }
    e.target.value = "";
  };

  const tailorCV = async () => {
    if (!jd.trim()) { setError("Please paste a job description."); return; }
    if (!apiKey)    { setError("VITE_OPENAI_KEY not set in .env file."); return; }
    setError(null); setResult(null); setScreen("loading");
    setIterationMsg("Reading job description...");

    const preScore = computeATSScore(profile, jd, false, {});

    const buildPrompt = (attempt, previousScore, feedback, missingKeywords) => `You are a professional CV tailoring assistant. Your job is to rewrite CV bullet points to match the job description, WITHOUT inventing facts.

RULES:
- NEVER invent roles, companies, dates, or qualifications
- Facts must stay true — but WORDING must change to match the JD
- You MUST rewrite bullet text. Do NOT copy bullets verbatim from the input — every project and experience entry must have genuinely rewritten tailoredBullets
- Expand implied technologies into their real names: if the profile says "frontend framework" and they used Vue.js, write "Vue.js". If they used FastAPI, write "FastAPI". If they used PostgreSQL, write "PostgreSQL". Be specific
- If a technology abbreviation can expand safely (e.g. "JavaScript" can replace "JS", "Python" is implied by scikit-learn usage), expand it
- Preserve ALL numbers and metrics — never remove them
- Reorder projects and experience most relevant first
- tailoredSummary: 2 sentences, factual, dense with JD keywords
- Each bullet MUST be under 120 characters. Max 4 bullets per project or experience entry
- reorderedSkillCategories: only genuine technical tools, languages, frameworks, and methodologies — NEVER add location names, city names, soft skills, generic phrases, or job-role terms to skill lists
- CRITICAL: Never drop keywords that are already in the original CV and match the JD — every rewritten bullet must preserve all existing matched terms, only adding new ones on top
- Return ONLY valid JSON
${attempt > 1 ? `\nAttempt ${attempt}/3. Previous ATS score: ${previousScore}/100. ${feedback}` : ""}
${missingKeywords.length > 0 ? `\nMISSING JD KEYWORDS — not yet in CV. Work as many as genuinely applicable into the bullet rewrites:\n${missingKeywords.slice(0, 25).join(", ")}` : ""}

Return exactly this JSON (bullets first so nothing important gets cut off):
{
  "tailoredSummary": "2 sentence max, factual, dense with JD keywords",
  "reorderedSkillCategories": [...same categories reordered by JD relevance, skills reordered within],
  "reorderedProjects": [...reordered most-relevant first, each with tailoredBullets array — REWRITE every bullet, max 4 per project, max 120 chars each],
  "reorderedExperience": [...reordered most-relevant first, each with tailoredBullets array — REWRITE every bullet, max 4 per entry, max 120 chars each],
  "jobSummary": "3-4 sentence plain-English summary of what this role needs",
  "visaRequirement": "exact visa/work rights text from JD, or null",
  "gapAnalysis": {
    "technologies": ["tool in JD candidate doesn't have"],
    "experience": ["experience type in JD candidate lacks"],
    "overallFit": "1 sentence honest fit assessment"
  },
  "tailoringSummary": "1-2 sentences on what was changed and why"
}`;

    const callAI = async (prompt, currentProfile) => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: OPENAI_MODEL, max_completion_tokens: 4096,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: `PROFILE:\n${JSON.stringify(currentProfile, null, 2)}\n\nJOB DESCRIPTION:\n${jd}` }
          ]
        })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `HTTP ${res.status}`); }
      const data = await res.json();
      return JSON.parse(data.choices?.[0]?.message?.content || "{}");
    };

    try {
      const MAX_ATTEMPTS = 3;
      let bestTailored = null;
      let bestScore = preScore;
      let lastScore = preScore;
      let attempts = 0;
      // Build a profile-like object from tailored output so retry 2+ refine the previous version
      const tailoredToProfile = (t) => ({
        ...profile,
        summary: t.tailoredSummary || profile.summary,
        skillCategories: t.reorderedSkillCategories || profile.skillCategories,
        projects: (t.reorderedProjects || profile.projects).map(p => ({ ...p, bullets: p.tailoredBullets || p.bullets })),
        experience: (t.reorderedExperience || profile.experience).map(e => ({ ...e, bullets: e.tailoredBullets || e.bullets })),
      });

      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        const passLabel = ["Keyword injection", "Quantifying achievements", "Structural polish"][attempts - 1];
        setIterationMsg(`Pass ${attempts} of ${MAX_ATTEMPTS}: ${passLabel}...`);

        // For retries, compute which keywords are still missing from the previous best
        const currentBase = bestTailored ? tailoredToProfile(bestTailored) : profile;
        const currentMissing = extractJDKeywords(jd).filter(kw =>
          !profileToText(currentBase, false, {}).toLowerCase().includes(kw)
        );

        const feedback = attempts > 1
          ? `Still missing ${currentMissing.length} JD keywords. Be more aggressive — rewrite bullets to explicitly name technologies and include the missing keywords listed below.`
          : "";

        const tailored = await callAI(buildPrompt(attempts, lastScore.finalScore, feedback, currentMissing), currentBase);
        const scored = computeATSScore(profile, jd, true, tailored);

        setIterationMsg(`Attempt ${attempts}: scored ${scored.finalScore}/100 (was ${preScore.finalScore})...`);
        await new Promise(r => setTimeout(r, 600));

        if (scored.finalScore > bestScore.finalScore) {
          bestTailored = tailored;
          bestScore = scored;
          setIterationMsg(`Score improved to ${scored.finalScore} — keeping this version...`);
          await new Promise(r => setTimeout(r, 500));
          if (scored.finalScore >= preScore.finalScore + 15) break;
        } else if (bestTailored === null) {
          bestTailored = tailored;
        }

        lastScore = scored;
      }

      setIterationMsg("Finalising best version...");
      await new Promise(r => setTimeout(r, 400));

      // Final post score — never show lower than pre
      const finalPostScore = bestScore.finalScore >= preScore.finalScore
        ? bestScore
        : { ...bestScore, finalScore: preScore.finalScore };

      setResult({ tailored: bestTailored, preScore, postScore: finalPostScore, attempts });
      setScreen("results");
      setResultTab("scores");
    } catch (e) {
      setError("Failed: " + e.message);
      setScreen("home");
    }
  };

  const downloadDocx = async () => {
    setDownloading(true);
    try {
      const t = editedTailored || result.tailored;
      const summary    = t.tailoredSummary    || profile.summary || "";
      const skillCats  = t.reorderedSkillCategories || profile.skillCategories || [];
      const projects   = t.reorderedProjects   || profile.projects   || [];
      const experience = t.reorderedExperience || profile.experience || [];
      const education  = profile.education || [];

      // docx sizes are in half-points: 22 = 11pt (standard CV body), 20 = 10pt, 24 = 12pt
      const SZ = { name: 36, contact: 20, heading: 20, body: 22, small: 20 };
      const rule = () => new Paragraph({ border: { bottom: { style: "single", size: 6, color: "2563EB" } }, spacing: { after: 100 } });
      const sh = (text) => [
        new Paragraph({ children: [new TextRun({ text, bold: true, size: SZ.heading, color: "2563EB", allCaps: true })], spacing: { before: 220, after: 0 } }),
        rule(),
      ];
      const bul = (text) => new Paragraph({ children: [new TextRun({ text, size: SZ.body })], bullet: { level: 0 }, spacing: { after: 60 } });

      const children = [
        new Paragraph({ children: [new TextRun({ text: profile.name, bold: true, size: SZ.name, color: "1e3a5f" })], alignment: AlignmentType.CENTER, spacing: { after: 80 } }),
        new Paragraph({ children: [new TextRun({ text: [profile.location, profile.email, profile.phone, profile.linkedin, profile.portfolio].filter(Boolean).join("  |  "), size: SZ.contact, color: "444444" })], alignment: AlignmentType.CENTER, spacing: { after: 160 } }),
      ];

      if (summary) {
        children.push(...sh("PROFILE"));
        children.push(new Paragraph({ children: [new TextRun({ text: summary, size: SZ.body })], spacing: { after: 100 } }));
      }
      if (skillCats.length) {
        children.push(...sh("TECHNICAL SKILLS"));
        skillCats.forEach(c => children.push(new Paragraph({
          children: [new TextRun({ text: c.category + ": ", bold: true, size: SZ.body }), new TextRun({ text: (c.skills||[]).join(", "), size: SZ.body })],
          spacing: { after: 70 }
        })));
      }
      if (projects.length) {
        children.push(...sh("KEY PROJECTS"));
        projects.forEach(p => {
          const dates = [p.startDate, p.endDate].filter(Boolean).join(" – ");
          children.push(new Paragraph({
            children: [new TextRun({ text: [p.role, p.name].filter(Boolean).join(" | "), bold: true, size: SZ.body }), ...(dates ? [new TextRun({ text: "   " + dates, size: SZ.small, color: "555555" })] : [])],
            spacing: { before: 100, after: 60 }
          }));
          (p.tailoredBullets || p.bullets || []).forEach(b => children.push(bul(b)));
        });
      }
      if (experience.length) {
        children.push(...sh("PROFESSIONAL EXPERIENCE"));
        experience.forEach(e => {
          children.push(new Paragraph({
            children: [new TextRun({ text: `${e.role} | ${e.company}`, bold: true, size: SZ.body }), new TextRun({ text: `   ${e.startDate} – ${e.endDate}`, size: SZ.small, color: "555555" })],
            spacing: { before: 100, after: 60 }
          }));
          (e.tailoredBullets || e.bullets || []).forEach(b => children.push(bul(b)));
        });
      }
      if (education.length) {
        children.push(...sh("EDUCATION"));
        education.forEach(ed => {
          children.push(new Paragraph({
            children: [new TextRun({ text: `${ed.degree} | ${ed.institution}`, bold: true, size: SZ.body }), new TextRun({ text: `   ${ed.startDate} – ${ed.endDate}`, size: SZ.small, color: "555555" })],
            spacing: { before: 100, after: 60 }
          }));
          if (ed.extra) children.push(new Paragraph({ children: [new TextRun({ text: ed.extra, size: SZ.small, color: "333333" })], spacing: { after: 40 } }));
          if (ed.notes) children.push(new Paragraph({ children: [new TextRun({ text: ed.notes, size: SZ.small, color: "555555" })], spacing: { after: 60 } }));
        });
      }

      const doc = new Document({ sections: [{ properties: { page: { margin: { top: 860, right: 900, bottom: 860, left: 900 } } }, children }] });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "SmartCV_Tailored.docx"; a.click();
      URL.revokeObjectURL(url);
    } catch(e) { alert("DOCX error: " + e.message); }
    finally { setDownloading(false); }
  };

  // ── SHARED STYLES ────────────────────────────────────────────────────────
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 22px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.04)" };
  const primaryBtn = { padding: "13px 24px", fontWeight: 700, fontSize: 14, background: GRAD, border: "none", borderRadius: 10, color: "white", cursor: "pointer" };
  const ghostBtn   = { padding: "13px 20px", fontWeight: 600, fontSize: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.textSecondary, cursor: "pointer", transition: "all 0.15s" };

  const liveImprovement = result ? ((liveScore?.finalScore ?? result.postScore.finalScore) - result.preScore.finalScore) : 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.textPrimary, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes scan    { 0%{top:0%} 50%{top:calc(100% - 3px)} 100%{top:0%} }
        @keyframes pulse   { 0%,100%{box-shadow:0 0 0 3px ${C.blueBorder}} 50%{box-shadow:0 0 0 5px ${C.blueFaded}} }
        * { box-sizing:border-box; margin:0; padding:0; }
        textarea, input { outline:none; font-family:inherit; }
        textarea:focus, input:focus { border-color:${C.blue} !important; box-shadow:0 0 0 3px ${C.blue}22; }
        button { font-family:inherit; }
        ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:${C.surface}} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
        .kw-pill { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .kw-pill:hover { transform: scale(1.05); box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
        .ghost-btn:hover { background: ${C.surface} !important; border-color: ${C.textMuted} !important; }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{ borderBottom:`1px solid ${C.border}`, padding:"0 28px", display:"flex", justifyContent:"space-between", alignItems:"center", height:58, position:"sticky", top:0, zIndex:100, background:`${C.bg}ee`, backdropFilter:"blur(12px)" }}>
        <img src={smartCVLogo} alt="SmartCV" style={{ height: 40, width: "auto" }} />
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {result && screen !== "results" && (
            <button onClick={()=>setScreen("results")} style={{ ...ghostBtn, padding:"9px 18px", fontSize:13 }}>Back to results</button>
          )}

          {/* Profile switcher pill */}
          <div style={{ position:"relative" }}>
            <button onClick={()=>setShowProfilePicker(o=>!o)}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", background:C.card, border:`1px solid ${C.border}`, borderRadius:10, color:C.textPrimary, cursor:"pointer", fontSize:13, fontWeight:500, maxWidth:200 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:GRAD, flexShrink:0 }} />
              <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{activeProfile.label}</span>
              <span style={{ color:C.textSecondary, fontSize:11, flexShrink:0 }}>▾</span>
            </button>

            {showProfilePicker && (
              <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:8, minWidth:240, zIndex:200, animation:"fadeUp 0.2s ease", boxShadow:"0 16px 40px #00000080" }}>
                {profiles.map(p => (
                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, background: p.id===activeProfileId ? C.blueFaded : "transparent", border: p.id===activeProfileId ? `1px solid ${C.blueBorder}` : "1px solid transparent", marginBottom:2 }}>
                    {editingLabel === p.id ? (
                      <input autoFocus value={p.label} onChange={e=>updateProfileLabel(p.id,e.target.value)}
                        onBlur={()=>setEditingLabel(null)} onKeyDown={e=>e.key==="Enter"&&setEditingLabel(null)}
                        style={{ flex:1, background:"transparent", border:"none", color:C.textPrimary, fontSize:13, outline:"none" }} />
                    ) : (
                      <span onClick={()=>{switchProfile(p.id);setShowProfilePicker(false);}} style={{ flex:1, fontSize:13, color: p.id===activeProfileId?C.blueText:C.textSecondary, fontWeight: p.id===activeProfileId?600:400, cursor:"pointer" }}>{p.label}</span>
                    )}
                    <button onClick={()=>setEditingLabel(p.id)} style={{ fontSize:11, color:C.textSecondary, background:"transparent", border:"none", cursor:"pointer", padding:"2px 4px" }}>rename</button>
                    {profiles.length > 1 && <button onClick={()=>deleteProfile(p.id)} style={{ fontSize:11, color:C.red, background:"transparent", border:"none", cursor:"pointer", padding:"2px 4px" }}>delete</button>}
                  </div>
                ))}
                <div style={{ borderTop:`1px solid ${C.border}`, marginTop:6, paddingTop:6 }}>
                  <button onClick={()=>{addProfile();setShowProfilePicker(false);}}
                    style={{ width:"100%", padding:"8px 10px", background:"transparent", border:`1px dashed ${C.border}`, borderRadius:8, color:C.blue, fontSize:13, cursor:"pointer", textAlign:"left" }}>
                    + New profile
                  </button>
                </div>
              </div>
            )}
          </div>

          <button onClick={()=>setScreen(screen==="profile"?"home":"profile")}
            style={{ padding:"9px 22px", fontSize:14, fontWeight:600, background: screen==="profile" ? GRAD : C.card, border:`1px solid ${screen==="profile" ? "transparent" : C.border}`, borderRadius:10, color: screen==="profile" ? "white" : C.textPrimary, cursor:"pointer", transition:"all 0.2s" }}>
            {screen === "profile" ? "Done" : "Edit profile"}
          </button>
        </div>
      </nav>

      {/* Click outside to close profile picker */}
      {showProfilePicker && <div onClick={()=>setShowProfilePicker(false)} style={{ position:"fixed", inset:0, zIndex:99 }} />}

      {/* ── HOME ── */}
      {screen === "home" && (
        <div style={{ maxWidth:780, margin:"0 auto", padding:"56px 32px 40px", animation:"fadeIn 0.4s ease" }}>
          <div style={{ textAlign:"center", marginBottom:44 }}>
            <h1 style={{ fontSize:48, fontWeight:800, lineHeight:1.15, marginBottom:16, background:GRAD, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", letterSpacing:"-0.02em" }}>
              Tailor your CV.<br />Beat the ATS.
            </h1>
            <p style={{ color:C.textSecondary, fontSize:16, lineHeight:1.6 }}>Paste a job description. Get a tailored, keyword-matched CV in seconds.</p>
          </div>

          <div style={{ ...card, marginBottom:16 }}>
            <label style={{ fontSize:12, fontWeight:700, color:C.textSecondary, letterSpacing:"0.1em", display:"block", marginBottom:12 }}>JOB DESCRIPTION</label>
            <textarea
              style={{ width:"100%", minHeight:230, background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, color:C.textPrimary, fontSize:14, lineHeight:1.7, padding:"14px 16px", resize:"vertical" }}
              placeholder="Paste the full job description here..."
              value={jd} onChange={e=>setJd(e.target.value)}
            />
            {jd.length > 0 && <div style={{ fontSize:12, color:C.textSecondary, marginTop:8 }}>{jd.split(/\s+/).filter(Boolean).length} words</div>}
          </div>

          {error && <div style={{ background:"#1c0a0a", border:`1px solid ${C.red}55`, borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:"#fca5a5", animation:"fadeUp 0.3s ease" }}>{error}</div>}

          <button onClick={tailorCV} disabled={!jd.trim()}
            style={{ width:"100%", padding:"16px", fontWeight:700, fontSize:16, background:jd.trim()?GRAD:C.card, border:"none", borderRadius:12, color:jd.trim()?"white":C.textSecondary, cursor:jd.trim()?"pointer":"not-allowed", letterSpacing:"0.02em", transition:"opacity 0.2s" }}>
            Tailor my CV
          </button>
        </div>
      )}

      {/* ── PROFILE ── */}
      {screen === "profile" && (
        <div style={{ maxWidth:780, margin:"0 auto", padding:"32px 32px 60px", animation:"fadeIn 0.3s ease" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:GRAD, boxShadow:`0 0 0 3px ${C.blueBorder}`, animation:"pulse 2s ease-in-out infinite" }} />
              <span style={{ fontSize:11, fontWeight:700, color:C.blue, textTransform:"uppercase", letterSpacing:"0.1em" }}>Editing</span>
            </div>
            <h2 style={{ fontSize:20, fontWeight:700, color:C.textPrimary, margin:0 }}>{activeProfile.label}</h2>
          </div>

          {/* Import from CV — only shown when profile is empty/unset */}
          {!profile.name && <div style={{ ...card, marginBottom:24, border:`1px dashed ${C.blueBorder}`, background:C.blueFaded }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.blueText, marginBottom:4 }}>Import your existing CV</div>
            <div style={{ fontSize:12, color:C.textSecondary, marginBottom:14 }}>We will autofill all fields below.</div>
            <label style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 16px", background: importingCV ? C.surface : C.card, border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, fontWeight:600, color: importingCV ? C.textMuted : C.textPrimary, cursor: importingCV ? "default" : "pointer" }}>
              {importingCV ? "⏳ Reading CV…" : "📄 Upload PDF"}
              <input type="file" accept=".pdf" style={{ display:"none" }} onChange={handleCVFileUpload} disabled={importingCV} />
            </label>
            {importError && <div style={{ marginTop:10, fontSize:12, color:C.red }}>{importError}</div>}
          </div>}

          <ProfileForm profile={profile} setProfile={setProfile} />
        </div>
      )}

      {/* ── LOADING ── */}
      {screen === "loading" && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"70vh", padding:"40px 32px", animation:"fadeIn 0.3s ease" }}>
          {/* A4 skeleton with scanning laser */}
          <div style={{ position:"relative", width:180, borderRadius:6, background:C.surface, border:`1px solid ${C.border}`, boxShadow:"0 8px 40px #00000070", overflow:"hidden", marginBottom:28 }}>
            <div style={{ paddingBottom:"141.43%", position:"relative" }}>
              <div style={{ position:"absolute", inset:0, padding:"12px 14px", display:"flex", flexDirection:"column", gap:0 }}>
                {/* name block */}
                <div style={{ height:8, width:"60%", background:C.blueBorder, borderRadius:3, margin:"0 auto 6px" }} />
                <div style={{ height:4, width:"80%", background:C.border, borderRadius:2, margin:"0 auto 10px" }} />
                {/* section blocks */}
                {[["40%",true],[100],[85],[70],[100,true],[95],[80],[60],[100,true],[90],[75],[65],[85],[100,true],[80],[70]].map(([w,isHead],i)=>(
                  <div key={i} style={{ height: isHead ? 5 : 3, width:w, background: isHead ? "#1e3a5f" : C.border, borderRadius:2, marginBottom: isHead ? 5 : 3 }} />
                ))}
              </div>
              {/* scanning gradient line */}
              <div style={{ position:"absolute", left:0, right:0, height:3, background:`linear-gradient(90deg, transparent 0%, ${C.blue} 30%, ${C.purple} 70%, transparent 100%)`, animation:"scan 1.6s ease-in-out infinite", opacity:0.85 }} />
            </div>
          </div>

          {/* Pass dots */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {[1,2,3].map(i => {
              const passNum = parseInt((iterationMsg.match(/Pass (\d)/) || [])[1] || "0");
              const active = passNum === i;
              const done   = passNum > i;
              return <div key={i} style={{ width:8, height:8, borderRadius:"50%", background: done ? C.green : active ? C.blue : C.border, transition:"background 0.4s", boxShadow: active ? `0 0 8px ${C.blue}88` : "none" }} />;
            })}
          </div>
          <div key={iterationMsg} style={{ fontSize:14, fontWeight:600, color:C.textPrimary, animation:"fadeIn 0.3s ease", textAlign:"center", maxWidth:300, lineHeight:1.5 }}>{iterationMsg}</div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {screen === "results" && result && (
        <div style={{ maxWidth:860, margin:"0 auto", padding:"28px 32px 60px", animation:"fadeIn 0.4s ease" }}>
          {kwToast && (
            <div style={{ position:"sticky", top:70, zIndex:300, marginBottom:16, padding:"10px 18px", borderRadius:10, fontSize:13, fontWeight:600, background: kwToast.ok ? C.greenBg : C.redBg, color: kwToast.ok ? C.green : C.red, border:`1px solid ${kwToast.ok ? C.greenBorder : "#fca5a5"}`, boxShadow:"0 4px 16px #0000001a", animation:"fadeUp 0.25s ease" }}>
              {kwToast.msg}
            </div>
          )}

          {/* Top row: reset + tabs */}
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
            <button onClick={() => { setScreen("home"); setResult(null); setJd(""); setEditedTailored(null); setAddedKws(new Set()); }}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", fontSize:13, fontWeight:600, background:C.card, border:`1px solid ${C.border}`, borderRadius:10, color:C.textSecondary, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0 }}>
              ↩ New application
            </button>
          </div>

          {/* Tab switcher */}
          <div style={{ display:"flex", gap:3, marginBottom:28, background:C.card, borderRadius:12, padding:4, border:`1px solid ${C.border}` }}>
            {[["scores","Scores"],["insights","Insights"],["changes","Changes"]].map(([t,l])=>(
              <button key={t} onClick={()=>setResultTab(t)}
                style={{
                  flex:1, padding:"10px 0", fontSize:13, fontWeight: resultTab===t ? 700 : 400,
                  background: resultTab===t ? `${C.blue}22` : "transparent",
                  border: resultTab===t ? `1px solid ${C.blue}55` : "1px solid transparent",
                  borderRadius:9, color: resultTab===t ? C.blue : C.textSecondary,
                  cursor:"pointer", transition:"all 0.2s",
                  boxShadow: resultTab===t ? `0 0 12px ${C.blue}22` : "none"
                }}>{l}</button>
            ))}
          </div>

          {/* SCORES */}
          {resultTab === "scores" && (
            <div style={{ animation:"fadeUp 0.35s ease" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:24 }}>
                {[
                  {label:"Before", score:result.preScore.finalScore,                        sub:"Original CV"},
                  {label:"After",  score:liveScore?.finalScore ?? result.postScore.finalScore, sub:"Tailored CV", live:true},
                ].map(({label,score,sub,live})=>(
                  <div key={label} style={{ ...card, display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 16px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
                      <span style={{ fontSize:11, color:C.textSecondary, textTransform:"uppercase", letterSpacing:"0.1em" }}>{label}</span>
                      {live && <span style={{ fontSize:9, color:C.blueDark, background:C.blueFaded, border:`1px solid ${C.blueBorder}`, borderRadius:10, padding:"1px 6px" }}>LIVE</span>}
                    </div>
                    <AnimatedScore target={score} key={score} />
                    <div style={{ fontSize:12, color:C.textSecondary, marginTop:10 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {liveImprovement > 0 && (
                <div style={{ background:C.greenBg, border:`1px solid ${C.greenBorder}`, borderRadius:12, padding:"14px 18px", marginBottom:20, animation:"fadeUp 0.4s ease 0.3s both" }}>
                  <div style={{ fontSize:15, fontWeight:700, color:C.green }}>+{liveImprovement} point improvement</div>
                  <div style={{ fontSize:13, color:C.green, marginTop:2, opacity:0.8 }}>Best version found after {result.attempts} attempt{result.attempts!==1?"s":""}.</div>
                </div>
              )}
              {liveImprovement === 0 && (
                <div style={{ background:C.blueFaded, border:`1px solid ${C.blueBorder}`, borderRadius:12, padding:"14px 18px", marginBottom:20, animation:"fadeUp 0.4s ease 0.3s both" }}>
                  <div style={{ fontSize:14, color:C.blueText }}>CV was already well-matched — best reordering applied after {result.attempts} attempt{result.attempts!==1?"s":""}.</div>
                </div>
              )}
              {liveImprovement < 0 && (
                <div style={{ background:C.redBg, border:`1px solid #fca5a5`, borderRadius:12, padding:"14px 18px", marginBottom:20, animation:"fadeUp 0.4s ease 0.3s both" }}>
                  <div style={{ fontSize:15, fontWeight:700, color:C.red }}>{liveImprovement} points — tailored CV lost some keyword coverage</div>
                  <div style={{ fontSize:13, color:C.red, marginTop:2, opacity:0.8 }}>Try clicking missing keyword pills below to recover the score.</div>
                </div>
              )}

              <div style={{ ...card, marginBottom:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.textSecondary, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>Score breakdown</div>
                <div style={{ display:"flex", justifyContent:"flex-end", gap:20, fontSize:11, color:C.textMuted, marginBottom:12 }}>
                  <span>Before</span><span style={{ color:C.blue }}>After</span>
                </div>
                {[
                  { label:"Keyword match (55%)", before: result.preScore.keywordScore,  after: liveScore?.keywordScore ?? result.postScore.keywordScore,  color:C.blue },
                  { label:"CV structure (25%)",  before: result.preScore.structScore,   after: liveScore?.structScore  ?? result.postScore.structScore,   color:BAR_COLORS.structure },
                  { label:"Quantified achievements (20%)", before: result.preScore.quantScore, after: liveScore?.quantScore ?? result.postScore.quantScore, color:BAR_COLORS.quant },
                ].map(({label, before, after, color}) => (
                  <div key={label} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                      <span style={{ fontSize:12, color:C.textSecondary }}>{label}</span>
                      <span style={{ fontSize:12, fontWeight:600, color: after >= before ? C.green : C.red }}>{before} → {after}</span>
                    </div>
                    <div style={{ height:7, borderRadius:4, background:C.surface, overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:4, width:`${after}%`, background:color, transition:"width 0.6s ease" }} />
                    </div>
                  </div>
                ))}
                <div style={{ fontSize:12, color:C.textSecondary, marginTop:4 }}>{liveScore?.matchedCount ?? result.postScore.matchedCount} of {liveScore?.totalKeywords ?? result.postScore.totalKeywords} keywords matched</div>
              </div>



              <div style={{ display:"flex", gap:12 }}>
                <button onClick={downloadDocx} disabled={downloading} style={{ ...primaryBtn, flex:1 }}>{downloading?"Generating...":"Download .docx"}</button>
                <button onClick={()=>setShowPreview(true)} style={ghostBtn}>Preview CV</button>
              </div>
            </div>
          )}

          {/* INSIGHTS */}
          {resultTab === "insights" && (
            <div style={{ animation:"fadeUp 0.35s ease" }}>

              {/* Job summary */}
              {result.tailored.jobSummary && (
                <div style={{ ...card, marginBottom:16 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.blue, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12 }}>Role summary</div>
                  <p style={{ fontSize:14, color:C.textPrimary, lineHeight:1.75 }}>{result.tailored.jobSummary}</p>
                  {result.tailored.visaRequirement && (
                    <div style={{ marginTop:14, padding:"10px 14px", background:C.redBg, border:`1px solid ${C.red}55`, borderRadius:8 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:C.red }}>VISA / WORK RIGHTS REQUIRED: </span>
                      <span style={{ fontSize:13, color:C.red }}>{result.tailored.visaRequirement}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Gap analysis */}
              {result.tailored.gapAnalysis && (
                <div style={{ ...card, marginBottom:16 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.blue, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:16 }}>Gap analysis</div>

                  {/* Overall fit */}
                  {result.tailored.gapAnalysis.overallFit && (
                    <div style={{ padding:"10px 14px", background:C.blueFaded, border:`1px solid ${C.blueBorder}`, borderRadius:8, marginBottom:16 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.blue, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.08em" }}>Overall fit</div>
                      <p style={{ fontSize:13, color:C.blueText, lineHeight:1.6, margin:0 }}>{result.tailored.gapAnalysis.overallFit}</p>
                    </div>
                  )}

                  {/* Technology gaps */}
                  {(result.tailored.gapAnalysis.technologies||[]).length > 0 && (
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:C.textSecondary, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.08em" }}>Technologies you don't have</div>
                      <div style={{ fontSize:12, color:C.textSecondary, marginBottom:10 }}>If you have adjacent experience or are learning it, click to let AI find the best place to mention it.</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                        {result.tailored.gapAnalysis.technologies.map((tech,i)=>{
                          const added = addedKws.has(tech);
                          const loading = placingKw === tech;
                          return (
                            <button key={i} className="kw-pill"
                              onClick={() => !added && !placingKw && placeKeywordWithAI(tech)}
                              disabled={loading || (!!placingKw && !loading)}
                              style={{ fontSize:12, padding:"5px 14px", background: added ? C.greenBg : loading ? C.surface : C.blueFaded, color: added ? C.green : loading ? C.textMuted : C.blueDark, border:`1px solid ${added ? C.greenBorder : loading ? C.border : C.blueBorder}`, borderRadius:20, cursor:(added || !!placingKw) ? "default" : "pointer", fontWeight:600, transition:"all 0.2s", opacity:(!!placingKw && !loading) ? 0.5 : 1 }}>
                              {added ? `✓ ${tech}` : loading ? `⏳ ${tech}` : `+ ${tech}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Experience gaps */}
                  {(result.tailored.gapAnalysis.experience||[]).length > 0 && (
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:C.textSecondary, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.08em" }}>Experience gaps</div>
                      {result.tailored.gapAnalysis.experience.map((e,i)=>(
                        <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8, animation:`fadeUp 0.3s ease ${i*0.07}s both` }}>
                          <span style={{ color:C.blue, flexShrink:0, fontWeight:700, marginTop:1 }}>—</span>
                          <span style={{ fontSize:13, color:C.textPrimary, lineHeight:1.6 }}>{e}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Missing keyword pills — AI-powered smart placement */}
              {liveScore?.missingKeywords?.length > 0 && (
                <div style={{ ...card, marginBottom:16 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.blue, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Missing keywords</div>
                  <div style={{ fontSize:12, color:C.textSecondary, marginBottom:12 }}>Click any keyword — AI will find the right place in your CV (summary, a bullet, or skills) and insert it there.</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {liveScore.missingKeywords.map((kw,i) => {
                      const added = addedKws.has(kw);
                      const loading = placingKw === kw;
                      return (
                        <button key={i} className="kw-pill"
                          onClick={() => !added && !placingKw && placeKeywordWithAI(kw)}
                          disabled={loading || (!!placingKw && !loading)}
                          style={{ fontSize:12, padding:"5px 14px", background: added ? C.greenBg : loading ? C.surface : C.blueFaded, color: added ? C.green : loading ? C.textMuted : C.blueDark, border:`1px solid ${added ? C.greenBorder : loading ? C.border : C.blueBorder}`, borderRadius:20, cursor: (added || !!placingKw) ? "default" : "pointer", fontWeight:600, transition:"all 0.2s", opacity: (!!placingKw && !loading) ? 0.5 : 1 }}>
                          {added ? `✓ ${kw}` : loading ? `⏳ ${kw}` : `+ ${kw}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* What AI changed */}
              {result.tailored.tailoringSummary && (
                <div style={{ ...card, background:C.blueFaded, borderColor:C.blueBorder }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.blue, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12 }}>What was tailored</div>
                  <p style={{ fontSize:14, color:C.blueText, lineHeight:1.75, margin:0 }}>{result.tailored.tailoringSummary}</p>
                </div>
              )}
            </div>
          )}

          {/* CHANGES */}
          {resultTab === "changes" && (() => {
            const t = editedTailored || result.tailored;
            const changes = [];

            const editProjBullet = (projName, bulletIdx, text) => {
              setEditedTailored(prev => {
                const next = JSON.parse(JSON.stringify(prev));
                const p = next.reorderedProjects?.find(p => p.name === projName);
                if (p) { p.tailoredBullets = p.tailoredBullets || [...(p.bullets||[])]; p.tailoredBullets[bulletIdx] = text; }
                return next;
              });
            };
            const editExpBullet = (role, bulletIdx, text) => {
              setEditedTailored(prev => {
                const next = JSON.parse(JSON.stringify(prev));
                const e = next.reorderedExperience?.find(e => e.role === role);
                if (e) { e.tailoredBullets = e.tailoredBullets || [...(e.bullets||[])]; e.tailoredBullets[bulletIdx] = text; }
                return next;
              });
            };

            // 1. Summary
            const origSummary = profile.summary || "";
            const newSummary  = t.tailoredSummary || "";
            if (origSummary.trim() !== newSummary.trim()) {
              changes.push({ section: "Profile summary", items: [{ original: origSummary, tailored: newSummary }] });
            }

            // 2. Skill categories — reorder + added/removed skills
            const origCats = profile.skillCategories || [];
            const newCats  = t.reorderedSkillCategories || [];
            const origCatOrder = origCats.map(c => c.category);
            const newCatOrder  = newCats.map(c => c.category);
            const catReordered = JSON.stringify(origCatOrder) !== JSON.stringify(newCatOrder);
            const skillItems = [];
            if (catReordered) {
              skillItems.push({ type: "reorder", label: "Skill categories reordered", original: origCatOrder.join(" → "), tailored: newCatOrder.join(" → ") });
            }
            newCats.forEach(newCat => {
              const origCat = origCats.find(c => c.category === newCat.category);
              if (!origCat) {
                skillItems.push({ type: "added", label: `New category: ${newCat.category}`, tailored: (newCat.skills||[]).join(", ") });
                return;
              }
              const added   = (newCat.skills||[]).filter(s => !(origCat.skills||[]).includes(s));
              const removed = (origCat.skills||[]).filter(s => !(newCat.skills||[]).includes(s));
              const skillReorder = JSON.stringify(newCat.skills) !== JSON.stringify(origCat.skills) && !added.length && !removed.length;
              added.forEach(s   => skillItems.push({ type: "added",   label: `${newCat.category}`, tailored: s }));
              removed.forEach(s => skillItems.push({ type: "removed", label: `${newCat.category}`, original: s }));
              if (skillReorder) skillItems.push({ type: "reorder", label: `${newCat.category} skills reordered`, original: origCat.skills.join(", "), tailored: newCat.skills.join(", ") });
            });
            if (skillItems.length) changes.push({ section: "Technical skills", items: skillItems });

            // 3. Project order
            const origProjOrder = (profile.projects||[]).map(p => p.name);
            const newProjOrder  = (t.reorderedProjects||[]).map(p => p.name);
            if (JSON.stringify(origProjOrder) !== JSON.stringify(newProjOrder)) {
              changes.push({ section: "Projects — reordered", items: [{ type: "reorder", original: origProjOrder.join(" → "), tailored: newProjOrder.join(" → ") }] });
            }

            // 4. Project bullets — all bullets shown, changed ones are editable
            (t.reorderedProjects||[]).forEach(newProj => {
              const origProj = (profile.projects||[]).find(p => p.name === newProj.name);
              if (!origProj) return;
              const bulletItems = [];
              const newBullets  = newProj.tailoredBullets || newProj.bullets || [];
              const origBullets = origProj.bullets || [];
              newBullets.forEach((nb, i) => {
                const ob = origBullets[i] || "";
                bulletItems.push({ original: ob, tailored: nb, onEdit: txt => editProjBullet(newProj.name, i, txt) });
              });
              if (bulletItems.some(b => b.original.trim() !== b.tailored.trim())) {
                changes.push({ section: `Projects · ${[newProj.role, newProj.name].filter(Boolean).join(" | ")}`, items: bulletItems });
              }
            });

            // 5. Experience order
            const origExpOrder = (profile.experience||[]).map(e => e.role + " @ " + e.company);
            const newExpOrder  = (t.reorderedExperience||[]).map(e => e.role + " @ " + e.company);
            if (JSON.stringify(origExpOrder) !== JSON.stringify(newExpOrder)) {
              changes.push({ section: "Experience — reordered", items: [{ type: "reorder", original: origExpOrder.join(" → "), tailored: newExpOrder.join(" → ") }] });
            }

            // 6. Experience bullets — all bullets shown, changed ones are editable
            (t.reorderedExperience||[]).forEach(newExp => {
              const origExp = (profile.experience||[]).find(e => e.role === newExp.role && e.company === newExp.company);
              if (!origExp) return;
              const bulletItems = [];
              const newBullets  = newExp.tailoredBullets || newExp.bullets || [];
              const origBullets = origExp.bullets || [];
              newBullets.forEach((nb, i) => {
                const ob = origBullets[i] || "";
                bulletItems.push({ original: ob, tailored: nb, onEdit: txt => editExpBullet(newExp.role, i, txt) });
              });
              if (bulletItems.some(b => b.original.trim() !== b.tailored.trim())) {
                changes.push({ section: `Experience · ${newExp.role} @ ${newExp.company}`, items: bulletItems });
              }
            });

            const totalChanges = changes.reduce((sum, c) => sum + c.items.length, 0);

            return (
              <div style={{ animation:"fadeUp 0.35s ease" }}>
                {changes.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"48px 0", color:C.textSecondary }}>No changes were made — CV was already well-matched.</div>
                ) : (
                  <>
                    <div style={{ fontSize:13, color:C.textSecondary, marginBottom:20 }}>
                      {totalChanges} change{totalChanges !== 1 ? "s" : ""} across {changes.length} section{changes.length !== 1 ? "s" : ""}
                    </div>
                    {changes.map((group, gi) => (
                      <div key={gi} style={{ marginBottom:20, animation:`fadeUp 0.35s ease ${gi*0.1}s both` }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.blue, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>{group.section}</div>
                        {group.items.map((item, ii) => (
                          <div key={ii} style={{ ...card, marginBottom:8 }}>
                            {item.type === "reorder" && (
                              <>
                                <div style={{ fontSize:11, color:C.textSecondary, marginBottom:6 }}>{item.label || "Order changed"}</div>
                                <div style={{ fontSize:12, color:C.red, background:C.redBg, borderRadius:5, padding:"4px 8px", marginBottom:4, lineHeight:1.6, textDecoration:"line-through", opacity:0.85 }}>{item.original}</div>
                                <div style={{ fontSize:12, color:C.green, background:C.greenBg, borderRadius:5, padding:"4px 8px", lineHeight:1.6, fontWeight:600 }}>{item.tailored}</div>
                              </>
                            )}
                            {item.type === "added" && (
                              <div style={{ fontSize:13, color:C.green, background:C.greenBg, borderRadius:5, padding:"6px 10px", fontWeight:600 }}>
                                <span style={{ fontSize:11, color:C.textSecondary, marginRight:8, textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:400 }}>{item.label}</span>
                                + {item.tailored}
                              </div>
                            )}
                            {item.type === "removed" && (
                              <div style={{ fontSize:13, color:C.red, background:C.redBg, borderRadius:5, padding:"6px 10px", textDecoration:"line-through", opacity:0.85 }}>
                                <span style={{ fontSize:11, color:C.textSecondary, marginRight:8, textTransform:"uppercase", letterSpacing:"0.06em", textDecoration:"none" }}>{item.label}</span>
                                — {item.original}
                              </div>
                            )}
                            {!item.type && <DiffLine original={item.original} tailored={item.tailored} onEdit={item.onEdit} />}
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                )}
                <div style={{ display:"flex", gap:12, marginTop:8 }}>
                  <button onClick={downloadDocx} disabled={downloading} style={{ ...primaryBtn, flex:1 }}>{downloading?"Generating...":"Download .docx"}</button>
                  <button onClick={()=>setShowPreview(true)} style={ghostBtn}>Preview CV</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── PREVIEW MODAL ── */}
      {showPreview && result && (
        <div onClick={e=>{if(e.target===e.currentTarget)setShowPreview(false)}}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:200, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"36px 16px", overflowY:"auto", animation:"fadeIn 0.2s ease" }}>
          <div style={{ width:"100%", maxWidth:660, animation:"fadeUp 0.3s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <span style={{ fontSize:16, fontWeight:700 }}>CV Preview</span>
              <button onClick={()=>setShowPreview(false)} style={{ fontSize:22, color:C.textSecondary, background:"transparent", border:"none", cursor:"pointer", lineHeight:1 }}>x</button>
            </div>
            <CVPreview profile={profile} tailored={editedTailored || result.tailored} />
            <div style={{ display:"flex", gap:12, marginTop:16 }}>
              <button onClick={downloadDocx} disabled={downloading} style={{ ...primaryBtn, flex:1 }}>{downloading?"Generating...":"Download .docx"}</button>
              <button onClick={()=>setShowPreview(false)} style={ghostBtn}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
