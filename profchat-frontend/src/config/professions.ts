export interface Profession {
  id: string;
  title: string;
  scenario: string;
  duration: string;
  image: string;
  description: string;
  tags: string[];
}

export const PROFESSIONS: Profession[] = [
  {
    id: "software-engineer",
    title: "Software Engineer",
    scenario: "Production Outage — Real-Time Triage",
    duration: "20–25 min",
    image: "https://images.unsplash.com/photo-1605379399642-870262d3d051?w=600&h=400&fit=crop",
    description: "Navigate a critical production incident under pressure while managing competing priorities.",
    tags: ["Tech", "Crisis", "Decision-Making"],
  },
  {
    id: "high-school-teacher",
    title: "High School Teacher",
    scenario: "Classroom Disruption — Student Escalation",
    duration: "20–25 min",
    image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=600&h=400&fit=crop",
    description: "Handle a challenging classroom situation that tests your management and communication skills.",
    tags: ["Education", "Communication", "Leadership"],
  },
  {
    id: "financial-analyst",
    title: "Financial Analyst",
    scenario: "Delivering Bad News to a Client",
    duration: "20–25 min",
    image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=400&fit=crop",
    description: "Present an underperforming portfolio to a demanding client and navigate their pushback.",
    tags: ["Finance", "Client Relations", "Analytics"],
  },
  {
    id: "supply-chain-manager",
    title: "Supply Chain Manager",
    scenario: "Supplier Disruption — Executive Escalation",
    duration: "20–25 min",
    image: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&h=400&fit=crop",
    description: "Respond to a critical supplier failure and brief leadership with limited good options.",
    tags: ["Operations", "Risk", "Leadership"],
  },
  {
    id: "marketing-manager",
    title: "Marketing Manager",
    scenario: "Social Media Crisis — Brand Damage Control",
    duration: "20–25 min",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=400&fit=crop",
    description: "Manage a viral brand crisis while navigating conflicting stakeholder demands.",
    tags: ["Marketing", "Crisis Comms", "Strategy"],
  },
  {
    id: "human-resources-manager",
    title: "Human Resources Manager",
    scenario: "Workplace Complaint — Investigation & Mediation",
    duration: "20–25 min",
    image: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&h=400&fit=crop",
    description: "Handle a harassment complaint involving a high-performer and a resistant VP.",
    tags: ["HR", "Conflict", "Ethics"],
  },
];
