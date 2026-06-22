# SmartCV — ATS Resume Optimizer

An AI-powered CV tailoring tool that rewrites and scores your resume against any job description — built to beat Applicant Tracking Systems.

![SmartCV](src/assets/SmartCV.svg)

## What it does

- Paste a job description → AI extracts keywords and requirements
- Rewrites and reorders your CV using GPT-5.5 with an iterative scoring loop (up to 3 attempts, keeps the best version)
- Scores your CV on keyword match, structure, and quantified achievements — before and after
- Shows every change made: skills added, bullets rephrased, sections reordered
- Gap analysis: missing technologies, experience gaps, visa requirements highlighted
- Exports a clean, formatted `.docx` in your exact CV style
- Multi-profile support with automatic persistence across sessions
- Runs fully locally — no database, no cloud hosting needed

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite |
| AI tailoring | OpenAI GPT-5.5 |
| DOCX export | Flask + Node.js (`docx` package) |
| Persistence | localStorage |
| Styling | Inline CSS with dark theme |

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/smartcv.git
cd smartcv
```

### 2. Add your OpenAI API key
```bash
cp .env.example .env
# Edit .env and add your key
```

### 3. Install dependencies
```bash
npm install
npm install -g docx
pip install flask flask-cors
```

### 4. Run
```bash
./start.sh
```

Opens at `http://localhost:5173`. The DOCX export server runs on port `7821`.

## How the scoring works

The ATS score (0–100) is a weighted combination of:
- **Keyword match (55%)** — overlap between your CV text and JD keywords
- **CV structure (25%)** — presence of summary, skills, projects, experience, education
- **Quantified achievements (20%)** — percentage of bullets containing numbers/metrics

## Project structure

```
smartcv/
├── src/
│   ├── App.jsx          # Main React app
│   └── assets/
│       ├── SmartCV.svg  # Logo
│       └── favicon.svg  # Browser tab icon
├── docx_server.py       # Flask server for DOCX generation
├── gen_docx.cjs         # Node.js DOCX builder
├── start.sh             # One-command startup script
├── .env.example         # Environment variable template
└── index.html
```

## License

MIT
