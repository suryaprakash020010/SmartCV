const YOUR_PROFILE = {
  name: "Alex Johnson",
  email: "alex.johnson@email.com",
  phone: "+1 555 012 3456",
  location: "San Francisco, CA 94105",
  linkedin: "linkedin.com/in/alexjohnson",
  portfolio: "alexjohnson.dev",
  summary: "Final-semester Master of Data Science candidate with hands-on experience in data engineering, full-stack development, and AI integration. Prior industry background at a technology firm with a strong interest in applied AI.",
  skillCategories: [
    { category: "Programming", skills: ["Python", "R", "Java", "JavaScript (Vue 3)"] },
    { category: "Data & BI", skills: ["SQL", "Power BI"] },
    { category: "Cloud & DevOps", skills: ["AWS (RDS, Amplify, Route 53)", "Git/GitHub"] }
  ],
  projects: [
    {
      role: "Data Engineer & Full-Stack Developer", name: "CityConnect Platform",
      startDate: "Jul 2024", endDate: "Jun 2025",
      bullets: [
        "Built the full data pipeline processing 10 government datasets (CSV, SHP, PDF) using Python, including PDF extraction, spatial joins and KDTree nearest-city matching (SciPy).",
        "Designed a normalised 12-table PostgreSQL schema on AWS RDS and built a FastAPI backend serving all application data.",
        "Precomputed a lookup cache table (2,500+ rows), reducing API response time from ~2 minutes to ~1,100ms — an 80–100x improvement.",
        "Built the frontend in Vue 3 with an OpenStreetMap/Leaflet map and GPT-4o AI summary feature; deployed on AWS Amplify with Route 53 custom domain."
      ]
    },
    {
      role: "Builder", name: "SmartCV",
      startDate: "Jun 2025", endDate: "Present",
      bullets: [
        "Built a locally-run CV tailoring tool: React/Vite frontend powered by OpenAI GPT for ATS optimisation.",
        "Implemented iterative ATS scoring (55% keyword match / 25% structure / 20% quantified achievements) with keyword stemming and multi-profile management.",
        "Added gap analysis, keyword diff tracking, and an iterative retry loop that refines tailored output across up to 3 GPT calls to maximise ATS score."
      ]
    },
    {
      role: "NLP Engineer", name: "CitationGuard",
      startDate: "2025", endDate: "Present",
      bullets: [
        "Built an end-to-end NLP pipeline to detect citation hallucinations in AI-generated documents.",
        "Queried Semantic Scholar, CrossRef, and PubMed APIs in parallel to verify citation existence.",
        "Fine-tuned DeBERTa-v3-base with LoRA on the SciFact dataset to classify claim-source relationships as SUPPORTED / CONTRADICTED / INSUFFICIENT."
      ]
    },
  ],
  experience: [
    {
      role: "Software Engineer", company: "Acme Technology Corp",
      startDate: "Aug 2022", endDate: "Jan 2024",
      bullets: [
        "Worked with technical documentation and data pipelines for enterprise clients, reviewing and validating complex workflows.",
        "Used Python and Excel automation to process and analyse large datasets, reducing manual reporting time by 60%.",
        "Awarded Employee Excellence Award (2023) for high-quality delivery and dedication to project goals."
      ]
    },
    {
      role: "Data Analyst Intern", company: "Startup Co",
      startDate: "May 2022", endDate: "Jul 2022",
      bullets: [
        "Worked with large sales datasets to identify leads, analyse trends, and generate actionable insights for reengaging high-value clients.",
        "Gained practical exposure to business analytics and strategies to expand the active client base."
      ]
    }
  ],
  education: [
    {
      degree: "Master of Data Science", institution: "State University",
      startDate: "Jul 2024", endDate: "Present",
      extra: "GPA: 3.8 | Final semester candidate",
      notes: "Completed units in Machine Learning, NLP, Big Data, Data Wrangling and Data Visualisation."
    },
    {
      degree: "Bachelor of Computer Science", institution: "City College",
      startDate: "Aug 2018", endDate: "May 2022",
      extra: "First Class Honours | Final Year Project: Distributed Systems Optimisation", notes: ""
    }
  ]
};

export default YOUR_PROFILE;
