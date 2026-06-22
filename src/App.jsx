import { useState, useEffect } from "react";
import smartCVLogo from "./assets/SmartCV.svg";

const OPENAI_MODEL = "gpt-4o-mini";

// Default example profile — replace with your own via the Edit Profile UI
// Your real profile is saved in localStorage and never stored in code
const YOUR_PROFILE = {
  name: "Alex Johnson",
  email: "alex.johnson@email.com",
  phone: "+61 400 000 000",
  location: "Melbourne, VIC",
  linkedin: "linkedin.com/in/alexjohnson",
  summary: "Final-semester Master of Data Science candidate with hands-on experience in data engineering, full-stack development, and AI integration. Strong interest in applied machine learning and building production-ready data pipelines.",
  skillCategories: [
    { category: "Programming", skills: ["Python", "R", "Java", "JavaScript"] },
    { category: "Data & BI", skills: ["SQL", "Power BI"] },
    { category: "Cloud & DevOps", skills: ["AWS", "Git/GitHub"] }
  ],
  projects: [
    {
      role: "Data Engineer & Full-Stack Developer", name: "Example Project",
      startDate: "Jan 2024", endDate: "Jun 2025",
      bullets: [
        "Built a data pipeline processing 10 government datasets using Python, spatial joins, and KDTree nearest-city matching.",
        "Designed a PostgreSQL database schema on AWS RDS.",
        "Optimised API response time by building a precomputed lookup cache, reducing latency ~80x.",
        "Integrated OpenAI GPT-4o to generate AI-powered summaries."
      ]
    }
  ],
  experience: [
    {
      role: "Systems Engineer", company: "Example Company",
      startDate: "Aug 2022", endDate: "Jan 2024",
      bullets: [
        "Reviewed and validated technical documentation for engineering clients.",
        "Used Excel macros to process and analyse data and track project timelines.",
        "Awarded Certificate of Excellence for high-quality delivery."
      ]
    }
  ],
  education: [
    {
      degree: "Master of Data Science", institution: "Example University",
      startDate: "2023", endDate: "2025",
      extra: "GPA: 3.5 | Final semester candidate",
      notes: "Completed units in Machine Learning, NLP, Big Data, and Data Visualisation."
    }
  ]
};

// ── COLOURS ──────────────────────────────────────────────────────────────────
const C = {
  bg:       "#07090f",
  surface:  "#0d1117",
  card:     "#111827",
  border:   "#1f2937",
  blue:     "#3b82f6",
  blueDark: "#1d4ed8",
  purple:   "#8b5cf6",
  teal:     "#14b8a6",
  green:    "#10b981",
  amber:    "#f59e0b",
  red:      "#ef4444",
  textPrimary:   "#f1f5f9",
  textSecondary: "#64748b",
  textMuted:     "#374151",
};

const GRAD = `linear-gradient(135deg, ${C.blue}, ${C.purple})`;

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

function computeATSScore(profile, jdText, useTailored, tailored) {
  const cvText = profileToText(profile, useTailored, tailored);
  const jdLower = jdText.toLowerCase();
  const cvLower = cvText.toLowerCase();
  const stopwords = new Set(["the","and","or","for","with","to","a","an","of","in","on","at","is","are","will","be","as","by","that","this","we","you","our","your","their","have","has","from","which","who","can","not","all","more","also","its","it","into","about","such","these","those","other","each","been","than","then","when","while","if","but","out","up","do","so","may","over","per","any","some","they","them","was","were","had","would","could","should","both","well","use","using","used","make","made","work","working","based","need","needs","required","including","experience","ability","strong","excellent"]);
  const jdWords = [...new Set((jdLower.match(/\b[a-z][a-z0-9+#.\-]{1,30}\b/g) || []).filter(w => !stopwords.has(w) && w.length > 2))];
  const matched = jdWords.filter(kw => cvLower.includes(kw));
  const keywordScore = jdWords.length > 0 ? Math.round((matched.length / jdWords.length) * 100) : 0;
  const missing = jdWords.filter(kw => !cvLower.includes(kw)).slice(0, 15);

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
    matchedCount: matched.length, totalKeywords: jdWords.length, missingKeywords: missing
  };
}

// ── ANIMATED SCORE RING ───────────────────────────────────────────────────────
function AnimatedScore({ target, size = 128 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let cur = 0;
    const step = () => { cur = Math.min(cur + 2, target); setVal(cur); if (cur < target) requestAnimationFrame(step); };
    const t = setTimeout(() => requestAnimationFrame(step), 400);
    return () => clearTimeout(t);
  }, [target]);
  const r = size * 0.42, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  const color = val >= 75 ? C.green : val >= 50 ? C.amber : C.red;
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
function DiffLine({ original, tailored }) {
  if (original === tailored) return null;
  return (
    <div style={{ marginBottom: 14, animation: "fadeUp 0.4s ease both" }}>
      <div style={{ fontSize: 12.5, color: C.red, marginBottom: 5, opacity: 0.8, lineHeight: 1.6, textDecoration: "line-through" }}>{original}</div>
      <div style={{ fontSize: 12.5, color: C.green, lineHeight: 1.6 }}>{tailored}</div>
    </div>
  );
}

// ── CV PREVIEW ────────────────────────────────────────────────────────────────
function CVPreview({ profile, tailored }) {
  const summary     = tailored?.tailoredSummary || profile.summary;
  const skillCats   = tailored?.reorderedSkillCategories || profile.skillCategories || [];
  const projects    = tailored?.reorderedProjects  || profile.projects  || [];
  const experience  = tailored?.reorderedExperience || profile.experience || [];
  const education   = profile.education || [];
  const SH = ({ t }) => (
    <div style={{ marginTop: 14, marginBottom: 5 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#2563eb", letterSpacing: "0.05em" }}>{t}</div>
      <div style={{ height: 1.5, background: "#1e3a5f", marginTop: 2 }} />
    </div>
  );
  return (
    <div style={{ background: "white", borderRadius: 10, padding: "22px 26px", color: "#111", fontFamily: "Calibri, Georgia, serif", maxHeight: 580, overflowY: "auto" }}>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1e3a5f" }}>{profile.name}</div>
        <div style={{ fontSize: 9.5, color: "#444", marginTop: 3 }}>{[profile.location, profile.email, profile.phone, profile.linkedin].filter(Boolean).join(" | ")}</div>
      </div>
      {summary && <><SH t="PROFILE" /><p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.6 }}>{summary}</p></>}
      {skillCats.length > 0 && <><SH t="TECHNICAL SKILLS" />{skillCats.map((c, i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 3 }}><span style={{ fontWeight: 700, minWidth: 90, fontSize: 10.5 }}>{c.category}</span><span style={{ fontSize: 10.5 }}>{(c.skills || []).join(", ")}</span></div>)}</>}
      {projects.length > 0 && <><SH t="KEY PROJECTS" />{projects.map((p, i) => <div key={i} style={{ marginBottom: 8 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700, fontSize: 10.5 }}>{[p.role, p.name].filter(Boolean).join(" | ")}</span><span style={{ fontSize: 9.5, color: "#555" }}>{[p.startDate, p.endDate].filter(Boolean).join(" – ")}</span></div>{(p.tailoredBullets || p.bullets || []).map((b, j) => <div key={j} style={{ paddingLeft: 10, fontSize: 10, color: "#222", marginTop: 2, lineHeight: 1.5 }}>• {b}</div>)}</div>)}</>}
      {experience.length > 0 && <><SH t="PROFESSIONAL EXPERIENCE" />{experience.map((e, i) => <div key={i} style={{ marginBottom: 8 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700, fontSize: 10.5 }}>{e.role} | {e.company}</span><span style={{ fontSize: 9.5, color: "#555" }}>{e.startDate} – {e.endDate}</span></div>{(e.tailoredBullets || e.bullets || []).map((b, j) => <div key={j} style={{ paddingLeft: 10, fontSize: 10, color: "#222", marginTop: 2, lineHeight: 1.5 }}>• {b}</div>)}</div>)}</>}
      {education.length > 0 && <><SH t="EDUCATION" />{education.map((ed, i) => <div key={i} style={{ marginBottom: 6 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700, fontSize: 10.5 }}>{ed.degree} | {ed.institution}</span><span style={{ fontSize: 9.5, color: "#555" }}>{ed.startDate} – {ed.endDate}</span></div>{ed.extra && <div style={{ fontSize: 10, color: "#333" }}>{ed.extra}</div>}{ed.notes && <div style={{ fontSize: 9.5, color: "#555" }}>{ed.notes}</div>}</div>)}</>}
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
      return saved ? JSON.parse(saved) : [{ id: "default", label: "Surya – Data Science", data: YOUR_PROFILE }];
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

  const addProfile = () => {
    const id = `profile_${Date.now()}`;
    const label = `New Profile ${profiles.length + 1}`;
    const newProfile = { id, label, data: { name: "", email: "", phone: "", location: "", linkedin: "", summary: "", skillCategories: [], projects: [], experience: [], education: [] } };
    const next = [...profiles, newProfile];
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

  const [screen, setScreen]           = useState("home");
  const [jd, setJd]                   = useState("");
  const [loadingStep, setLoadingStep] = useState(0);
  const [iterationMsg, setIterationMsg] = useState("");
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState(null);
  const [resultTab, setResultTab]     = useState("scores");
  const [showPreview, setShowPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [editingLabel, setEditingLabel] = useState(null);
  const apiKey = import.meta.env.VITE_OPENAI_KEY;

  useEffect(() => {
    let iv;
    if (screen === "loading") { iv = setInterval(() => setLoadingStep(s => Math.min(s+1, LOADING_MSGS.length-1)), 1400); }
    else { setLoadingStep(0); }
    return () => clearInterval(iv);
  }, [screen]);

  const tailorCV = async () => {
    if (!jd.trim()) { setError("Please paste a job description."); return; }
    if (!apiKey)    { setError("VITE_OPENAI_KEY not set in .env file."); return; }
    setError(null); setResult(null); setScreen("loading");
    setIterationMsg("Reading job description...");

    const preScore = computeATSScore(profile, jd, false, {});

    const buildPrompt = (attempt, previousScore, feedback) => `You are a professional CV tailoring assistant.

STRICT RULES:
- NEVER invent experience, roles, companies, dates, or qualifications
- Rephrase bullets to naturally include JD keywords — keep all facts 100% identical
- Reorder projects and experience most relevant first  
- Keep writing SHORT, DIRECT, SPECIFIC — no buzzwords
- CRITICAL: preserve ALL numbers, metrics, and technical terms from original bullets — never remove them
- If a bullet already matches well, change it minimally or not at all
- Summary: max 2 sentences, factual, direct
- changedBullets: only include bullets where text actually changed
- Return ONLY valid JSON
${attempt > 1 ? `\nThis is attempt ${attempt}/3. Previous ATS score was ${previousScore}/100. ${feedback} Focus on adding more JD keywords naturally into the bullets without removing existing specific terms.` : ""}

Return exactly:
{
  "jobSummary": "3-4 sentence plain-English summary of what this role needs. Include location and salary if mentioned.",
  "visaRequirement": "exact visa/work rights text from JD, or null",
  "tailoredSummary": "2 sentence max, factual, direct, uses JD keywords",
  "reorderedSkillCategories": [...same categories reordered by JD relevance, skills reordered within],
  "reorderedProjects": [...reordered, each must have tailoredBullets preserving all numbers and technical terms],
  "reorderedExperience": [...reordered, each must have tailoredBullets preserving all numbers and technical terms],
  "changedBullets": [{"section":"Projects or Experience","role":"exact role or project name","original":"exact original bullet","tailored":"new bullet"}],
  "gapAnalysis": {
    "technologies": ["tool in JD candidate doesn't have"],
    "experience": ["experience type in JD candidate lacks"],
    "visaRequirement": "visa text or null",
    "overallFit": "1 sentence honest fit assessment"
  },
  "tailoringSummary": "1-2 sentences on what was changed and why"
}`;

    const callAI = async (prompt, currentProfile) => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: OPENAI_MODEL, max_completion_tokens: 2500,
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

      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        setIterationMsg(`Tailoring CV — attempt ${attempts} of ${MAX_ATTEMPTS}...`);

        const feedback = attempts > 1
          ? `Score was ${lastScore.keywordScore}% keyword match. Try incorporating more of these JD keywords into bullets naturally.`
          : "";

        const tailored = await callAI(buildPrompt(attempts, lastScore.finalScore, feedback), profile);
        const scored = computeATSScore(profile, jd, true, tailored);

        setIterationMsg(`Attempt ${attempts}: scored ${scored.finalScore}/100 (was ${preScore.finalScore})...`);
        await new Promise(r => setTimeout(r, 600));

        if (scored.finalScore > bestScore.finalScore) {
          bestTailored = tailored;
          bestScore = scored;
          setIterationMsg(`Score improved to ${scored.finalScore} — keeping this version...`);
          await new Promise(r => setTimeout(r, 500));
          // If we've improved, we can stop early if score is already good
          if (scored.finalScore >= preScore.finalScore + 10) break;
        } else if (bestTailored === null) {
          // Keep first attempt as fallback even if no improvement
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
      const res = await fetch("http://localhost:7821/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, tailored: result.tailored })
      });
      if (!res.ok) throw new Error("Server returned " + res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href=url; a.download="SmartCV_Tailored.docx"; a.click();
      URL.revokeObjectURL(url);
    } catch(e) { alert("Run python3 docx_server.py first.\n\n" + e.message); }
    finally { setDownloading(false); }
  };

  // ── SHARED STYLES ────────────────────────────────────────────────────────
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 22px" };
  const primaryBtn = { padding: "13px 24px", fontWeight: 700, fontSize: 14, background: GRAD, border: "none", borderRadius: 10, color: "white", cursor: "pointer" };
  const ghostBtn   = { padding: "13px 20px", fontWeight: 600, fontSize: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.textSecondary, cursor: "pointer" };

  const improvement = result ? result.postScore.finalScore - result.preScore.finalScore : 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.textPrimary, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        textarea, input { outline:none; font-family:inherit; }
        textarea:focus, input:focus { border-color:${C.blue} !important; box-shadow:0 0 0 3px ${C.blue}22; }
        button { font-family:inherit; }
        ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:${C.bg}} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
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
                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, background: p.id===activeProfileId ? "#1e293b" : "transparent", marginBottom:2 }}>
                    {editingLabel === p.id ? (
                      <input autoFocus value={p.label} onChange={e=>updateProfileLabel(p.id,e.target.value)}
                        onBlur={()=>setEditingLabel(null)} onKeyDown={e=>e.key==="Enter"&&setEditingLabel(null)}
                        style={{ flex:1, background:"transparent", border:"none", color:C.textPrimary, fontSize:13, outline:"none" }} />
                    ) : (
                      <span onClick={()=>{switchProfile(p.id);setShowProfilePicker(false);}} style={{ flex:1, fontSize:13, color: p.id===activeProfileId?C.textPrimary:C.textSecondary, cursor:"pointer" }}>{p.label}</span>
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
            style={{ padding:"9px 22px", fontSize:14, fontWeight:600, background: screen==="profile" ? GRAD : C.card, border:`1px solid ${screen==="profile" ? "transparent" : C.border}`, borderRadius:10, color:"white", cursor:"pointer", transition:"all 0.2s" }}>
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
            <h2 style={{ fontSize:22, fontWeight:700, color:C.textPrimary, margin:0 }}>Editing: {activeProfile.label}</h2>
          </div>
          <ProfileForm profile={profile} setProfile={setProfile} />
        </div>
      )}

      {/* ── LOADING ── */}
      {screen === "loading" && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"65vh", animation:"fadeIn 0.3s ease" }}>
          <div style={{ width:56, height:56, border:`3px solid ${C.border}`, borderTop:`3px solid ${C.blue}`, borderRadius:"50%", animation:"spin 0.75s linear infinite", marginBottom:32 }} />
          <div key={iterationMsg} style={{ fontSize:16, fontWeight:600, color:C.textPrimary, marginBottom:10, animation:"fadeIn 0.3s ease", textAlign:"center", maxWidth:320 }}>{iterationMsg}</div>
          <div style={{ display:"flex", gap:6, marginTop:16 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width:7, height:7, borderRadius:"50%", background: iterationMsg.includes(`${i+1} of 3`) || iterationMsg.includes(`Attempt ${i+1}`) ? C.blue : C.border, transition:"background 0.3s" }} />
            ))}
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {screen === "results" && result && (
        <div style={{ maxWidth:860, margin:"0 auto", padding:"28px 32px 60px", animation:"fadeIn 0.4s ease" }}>

          {/* Tab switcher */}
          <div style={{ display:"flex", gap:3, marginBottom:28, background:C.card, borderRadius:12, padding:4, border:`1px solid ${C.border}` }}>
            {[
              ["scores",  "Scores",   C.blue],
              ["insights","Insights", C.purple],
              ["changes", "Changes",  C.teal]
            ].map(([t,l,accent])=>(
              <button key={t} onClick={()=>setResultTab(t)}
                style={{
                  flex:1, padding:"10px 0", fontSize:13, fontWeight: resultTab===t ? 700 : 400,
                  background: resultTab===t ? `${accent}22` : "transparent",
                  border: resultTab===t ? `1px solid ${accent}55` : "1px solid transparent",
                  borderRadius:9, color: resultTab===t ? accent : C.textSecondary,
                  cursor:"pointer", transition:"all 0.2s",
                  boxShadow: resultTab===t ? `0 0 12px ${accent}22` : "none"
                }}>{l}</button>
            ))}
          </div>

          {/* SCORES */}
          {resultTab === "scores" && (
            <div style={{ animation:"fadeUp 0.35s ease" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:24 }}>
                {[{label:"Before",score:result.preScore.finalScore,sub:"Original CV"},{label:"After",score:result.postScore.finalScore,sub:"Tailored CV"}].map(({label,score,sub})=>(
                  <div key={label} style={{ ...card, display:"flex", flexDirection:"column", alignItems:"center", padding:"24px 16px" }}>
                    <div style={{ fontSize:11, color:C.textSecondary, marginBottom:12, textTransform:"uppercase", letterSpacing:"0.1em" }}>{label}</div>
                    <AnimatedScore target={score} />
                    <div style={{ fontSize:12, color:C.textSecondary, marginTop:10 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {improvement > 0 && (
                <div style={{ background:"#052e16", border:`1px solid #065f46`, borderRadius:12, padding:"14px 18px", marginBottom:20, animation:"fadeUp 0.4s ease 0.3s both" }}>
                  <div style={{ fontSize:15, fontWeight:700, color:C.green }}>+{improvement} point improvement</div>
                  <div style={{ fontSize:13, color:"#6ee7b7", marginTop:2 }}>Best version found after {result.attempts} attempt{result.attempts!==1?"s":""}.</div>
                </div>
              )}
              {improvement === 0 && (
                <div style={{ background:"#0c1a2e", border:`1px solid #1e3a5f`, borderRadius:12, padding:"14px 18px", marginBottom:20, animation:"fadeUp 0.4s ease 0.3s both" }}>
                  <div style={{ fontSize:14, color:"#93c5fd" }}>CV was already well-matched — best reordering applied after {result.attempts} attempt{result.attempts!==1?"s":""}.</div>
                </div>
              )}

              <div style={{ ...card, marginBottom:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.textSecondary, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:18 }}>Score breakdown</div>
                <ScoreBar label="Keyword match (55%)" value={result.postScore.keywordScore} color={C.blue} />
                <ScoreBar label="CV structure (25%)"  value={result.postScore.structScore}  color={C.teal} />
                <ScoreBar label="Quantified achievements (20%)" value={result.postScore.quantScore} color={C.amber} />
                <div style={{ fontSize:12, color:C.textSecondary, marginTop:12 }}>{result.postScore.matchedCount} of {result.postScore.totalKeywords} keywords matched</div>
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
                  <p style={{ fontSize:14, color:"#cbd5e1", lineHeight:1.75 }}>{result.tailored.jobSummary}</p>
                  {result.tailored.visaRequirement && (
                    <div style={{ marginTop:14, padding:"10px 14px", background:"#1c0a0a", border:`1px solid ${C.red}55`, borderRadius:8 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:C.red }}>VISA / WORK RIGHTS REQUIRED: </span>
                      <span style={{ fontSize:13, color:"#fca5a5" }}>{result.tailored.visaRequirement}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Gap analysis */}
              {result.tailored.gapAnalysis && (
                <div style={{ ...card, marginBottom:16 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.purple, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:16 }}>Gap analysis</div>

                  {/* Overall fit */}
                  {result.tailored.gapAnalysis.overallFit && (
                    <div style={{ padding:"10px 14px", background:"#0c1a2e", border:`1px solid #1e3a5f`, borderRadius:8, marginBottom:16 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.blue, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.08em" }}>Overall fit</div>
                      <p style={{ fontSize:13, color:"#93c5fd", lineHeight:1.6, margin:0 }}>{result.tailored.gapAnalysis.overallFit}</p>
                    </div>
                  )}

                  {/* Technology gaps */}
                  {(result.tailored.gapAnalysis.technologies||[]).length > 0 && (
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:C.textSecondary, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.08em" }}>Technologies you don't have</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                        {result.tailored.gapAnalysis.technologies.map((t,i)=>(
                          <span key={i} style={{ fontSize:12, padding:"5px 12px", background:"#1c1030", color:"#c4b5fd", border:`1px solid ${C.purple}55`, borderRadius:20 }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Experience gaps */}
                  {(result.tailored.gapAnalysis.experience||[]).length > 0 && (
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:C.textSecondary, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.08em" }}>Experience gaps</div>
                      {result.tailored.gapAnalysis.experience.map((e,i)=>(
                        <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:8, animation:`fadeUp 0.3s ease ${i*0.07}s both` }}>
                          <span style={{ color:C.amber, flexShrink:0, fontWeight:700, marginTop:1 }}>—</span>
                          <span style={{ fontSize:13, color:"#cbd5e1", lineHeight:1.6 }}>{e}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* What AI changed */}
              {result.tailored.tailoringSummary && (
                <div style={{ ...card, background:"#0c1a2e", borderColor:"#1e3a5f" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.blue, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12 }}>What was tailored</div>
                  <p style={{ fontSize:14, color:"#93c5fd", lineHeight:1.75, margin:0 }}>{result.tailored.tailoringSummary}</p>
                </div>
              )}
            </div>
          )}

          {/* CHANGES */}
          {resultTab === "changes" && (() => {
            const t = result.tailored;
            const changes = [];

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

            // 4. Project bullets
            (t.reorderedProjects||[]).forEach(newProj => {
              const origProj = (profile.projects||[]).find(p => p.name === newProj.name);
              if (!origProj) return;
              const bulletItems = [];
              const newBullets  = newProj.tailoredBullets || newProj.bullets || [];
              const origBullets = origProj.bullets || [];
              newBullets.forEach((nb, i) => {
                const ob = origBullets[i] || "";
                if (nb.trim() !== ob.trim()) bulletItems.push({ original: ob, tailored: nb });
              });
              if (bulletItems.length) changes.push({ section: `Projects · ${[newProj.role, newProj.name].filter(Boolean).join(" | ")}`, items: bulletItems });
            });

            // 5. Experience order
            const origExpOrder = (profile.experience||[]).map(e => e.role + " @ " + e.company);
            const newExpOrder  = (t.reorderedExperience||[]).map(e => e.role + " @ " + e.company);
            if (JSON.stringify(origExpOrder) !== JSON.stringify(newExpOrder)) {
              changes.push({ section: "Experience — reordered", items: [{ type: "reorder", original: origExpOrder.join(" → "), tailored: newExpOrder.join(" → ") }] });
            }

            // 6. Experience bullets
            (t.reorderedExperience||[]).forEach(newExp => {
              const origExp = (profile.experience||[]).find(e => e.role === newExp.role && e.company === newExp.company);
              if (!origExp) return;
              const bulletItems = [];
              const newBullets  = newExp.tailoredBullets || newExp.bullets || [];
              const origBullets = origExp.bullets || [];
              newBullets.forEach((nb, i) => {
                const ob = origBullets[i] || "";
                if (nb.trim() !== ob.trim()) bulletItems.push({ original: ob, tailored: nb });
              });
              if (bulletItems.length) changes.push({ section: `Experience · ${newExp.role} @ ${newExp.company}`, items: bulletItems });
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
                      <div key={gi} style={{ marginBottom:20, animation:`fadeUp 0.3s ease ${gi*0.06}s both` }}>
                        <div style={{ fontSize:12, fontWeight:700, color:C.teal, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>{group.section}</div>
                        {group.items.map((item, ii) => (
                          <div key={ii} style={{ ...card, marginBottom:8 }}>
                            {item.type === "reorder" && (
                              <>
                                <div style={{ fontSize:11, color:C.textSecondary, marginBottom:6 }}>{item.label || "Order changed"}</div>
                                <div style={{ fontSize:12, color:C.red, marginBottom:4, opacity:0.8, lineHeight:1.6, textDecoration:"line-through" }}>{item.original}</div>
                                <div style={{ fontSize:12, color:C.green, lineHeight:1.6 }}>{item.tailored}</div>
                              </>
                            )}
                            {item.type === "added" && (
                              <div style={{ fontSize:13, color:C.green }}>
                                <span style={{ fontSize:11, color:C.textSecondary, marginRight:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>{item.label}</span>
                                + {item.tailored}
                              </div>
                            )}
                            {item.type === "removed" && (
                              <div style={{ fontSize:13, color:C.red, textDecoration:"line-through", opacity:0.8 }}>
                                <span style={{ fontSize:11, color:C.textSecondary, marginRight:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>{item.label}</span>
                                — {item.original}
                              </div>
                            )}
                            {!item.type && <DiffLine original={item.original} tailored={item.tailored} />}
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
            <CVPreview profile={profile} tailored={result.tailored} />
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
