# SmartCV

AI-powered CV tailoring tool built for job seekers who want to optimise their applications without misrepresenting themselves. It uses GPT-4o to intelligently reword and reorder your existing experience to better match a job description — the same thing a professional resume writer does, but faster and on demand.

![SmartCV](src/assets/SmartCV.svg)

## Philosophy

**Honest by design** — SmartCV never fabricates skills or experience. It reframes what you already have.

**ATS-aware** — a deterministic keyword-matching scorer (no AI) gives you a transparent, reproducible signal on how well your CV aligns with a job description before you apply.

**Private by default** — your CV data is never stored or logged. All AI calls go directly to OpenAI and nothing is persisted beyond your own browser session.

**Gap-aware, not gap-filling** — missing skills are flagged explicitly so you know where you stand, not quietly inserted to game a filter.

Built for personal use as part of an active graduate job search. Not intended to deceive recruiters — intended to make sure a strong candidate doesn't get filtered out by a keyword mismatch.

## What it does

- Paste a job description → AI extracts keywords and requirements
- Rewrites and reorders your CV using GPT-4o with an iterative scoring loop (up to 3 attempts, keeps the best version)
- Scores your CV on keyword match, structure, and quantified achievements — before and after
- Shows every change made: skills added, bullets rephrased, sections reordered
- Gap analysis: missing technologies, experience gaps, visa requirements highlighted
- Smart keyword placement — clicking a missing keyword calls AI to find the right place to insert it (summary, a bullet, or skills) rather than blindly adding to skills
- Import your existing CV via PDF upload — AI autofills all profile fields
- Exports a clean, formatted `.docx` ready to submit
- Multi-profile support with automatic persistence across sessions
- Runs fully locally — no database, no cloud hosting needed

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite |
| AI tailoring | OpenAI GPT-4o |
| DOCX export | `docx` npm package (browser-side) |
| PDF import | `pdfjs-dist` (browser-side) |
| Persistence | localStorage / sessionStorage |

## Usage

SmartCV is hosted as a web app — no installation needed. Visit the URL, enter the password, and start tailoring.

## How the scoring works

The ATS score (0–100) is a weighted combination of:
- **Keyword match (55%)** — overlap between your CV text and JD keywords, using stemming and union of original + tailored text so rephrasing never drops the score
- **CV structure (25%)** — presence of summary, skills, projects, experience, education
- **Quantified achievements (20%)** — percentage of bullets containing numbers or metrics

## License

MIT
