// The events the landing shows, grouped into five disciplines for the network. Names, formats and competency areas
// mirror content/<slug>.json exactly (observatoryEvents.test.ts reads the banks and fails on any drift).
// The disciplines are this site's own grouping for browsing, not an FBLA category.

export type EventFormat = "objective" | "case";

export type DisciplineId =
  "finance" | "law" | "markets" | "data" | "hospitality";

export type Discipline = { id: DisciplineId; name: string; blurb: string };

export type LandingEvent = {
  slug: string;
  name: string;
  format: EventFormat;
  discipline: DisciplineId;
  /** competency areas, in the bank's order (content `subs`) */
  areas: string[];
  /** set when the event has an eligibility limit */
  note?: string;
  /**
   * "outline": the bank's areas are a standard course outline, not (yet) FBLA's own list for the event (the bank's
   * notes say so). Otherwise they are FBLA's own areas, from its guideline or a state chapter's copy.
   */
  areasFrom?: "outline";
};

export const QUESTIONS_PER_EVENT = 100;
export const TERMS_PER_EVENT = 60;
/** A full mock: 100 questions in 50 minutes, like competition day (src/pages/play/parts.tsx). */
export const MOCK_QUESTIONS = 100;
export const MOCK_MINUTES = 50;
export const DUEL_QUESTIONS = 10;
export const DUEL_ACCEPT_HOURS = 24;

export const FORMAT_LABEL: Record<EventFormat, string> = {
  objective: "Objective test",
  case: "Case study event",
};

export const DISCIPLINES: Discipline[] = [
  {
    id: "finance",
    name: "Finance",
    blurb: "Money, markets and the numbers behind them.",
  },
  {
    id: "law",
    name: "Law and management",
    blurb: "How organizations are run, led and kept legal.",
  },
  {
    id: "markets",
    name: "Marketing and ventures",
    blurb: "Selling, starting and growing, at home and abroad.",
  },
  {
    id: "data",
    name: "Data and health",
    blurb: "Two of the newer fields in the program.",
  },
  {
    id: "hospitality",
    name: "Hospitality and sport",
    blurb: "Events, venues, teams and audiences.",
  },
];

export const EVENTS: LandingEvent[] = [
  {
    slug: "accounting",
    name: "Accounting",
    format: "objective",
    discipline: "finance",
    areas: [
      "Foundations of Accounting",
      "Standards and Compliance",
      "The Accounting Cycle",
      "Accounts Payable and Receivable",
      "Tax Accounting",
      "Financial Reports",
      "Technology and Accounting",
      "Career Opportunities",
    ],
  },
  {
    slug: "economics",
    name: "Economics",
    format: "objective",
    discipline: "finance",
    areas: [
      "Fundamental Economic Concepts",
      "Nature of Business",
      "Economic Systems",
      "Government's Impact on Business",
      "Cost/Profit Relationships",
      "Economic Indicators",
      "Global Trade",
    ],
  },
  {
    slug: "personal-finance",
    name: "Personal Finance",
    format: "objective",
    discipline: "finance",
    areas: [
      "Principles of Money",
      "Financial Needs and Goals",
      "Financial-Services Providers",
      "Investment Strategies",
      "Financial Literacy",
      "Risk Management",
    ],
  },
  {
    slug: "securities-investments",
    name: "Securities & Investments",
    format: "objective",
    discipline: "finance",
    areas: [
      "Investment Fundamentals",
      "Investment Wrappers, Taxation, and Trusts",
      "Investment Products and Funds",
      "Stock Market",
      "Stocks Versus Other Investments",
      "Mutual Funds",
      "Basics of Bonds",
      "Derivatives",
      "Financial Services Regulation",
    ],
  },
  {
    slug: "business-law",
    name: "Business Law",
    format: "objective",
    discipline: "law",
    areas: [
      "Legal systems",
      "Contracts and sales",
      "Business organization",
      "Property laws",
      "Agency and employment laws",
      "Negotiable instruments, insurance, secured transactions, bankruptcy",
      "Consumer protection and product/personal liability",
      "Computer law",
      "Domestic and private law",
    ],
  },
  {
    slug: "business-management",
    name: "Business Management",
    format: "case",
    discipline: "law",
    areas: [
      "Business Environment",
      "Management Types",
      "Business Finance",
      "Operations",
      "Strategic Management",
    ],
  },
  {
    slug: "organizational-leadership",
    name: "Organizational Leadership",
    format: "objective",
    discipline: "law",
    areasFrom: "outline",
    areas: [
      "Leadership Concepts and Traits",
      "Motivation and Leadership Theories",
      "Communication and Teamwork",
      "Managerial Functions",
      "Decision Making and Problem Solving",
      "Ethics and Social Responsibility",
      "Organizational Structure and Culture",
      "Change Management and Conflict Resolution",
    ],
  },
  {
    slug: "intro-business-concepts",
    name: "Introduction to Business Concepts",
    format: "objective",
    discipline: "law",
    note: "Grades 9 and 10 only",
    areas: [
      "Fundamental Economic Concepts",
      "Nature of Business",
      "Economic Systems",
      "Cost/Profit Relationships",
      "Owning a Business",
      "Types of Business Activities",
      "Career Planning",
      "Job-Search Skills",
    ],
  },
  {
    slug: "marketing",
    name: "Marketing",
    format: "case",
    discipline: "markets",
    areas: [
      "Marketing Fundamentals",
      "Market Planning",
      "Marketing-Information Management",
      "Product/Service Management",
      "Channel Management",
      "Pricing",
      "Promotion",
      "Selling",
    ],
  },
  {
    slug: "entrepreneurship",
    name: "Entrepreneurship",
    format: "case",
    discipline: "markets",
    areasFrom: "outline",
    areas: [
      "Business Plan and Opportunity Assessment",
      "Marketing Management",
      "Financial Management and Initial Capital",
      "Legal Issues and Business Structure",
      "Operations and Personnel Management",
      "Ethics, Taxes and Government Regulation",
    ],
  },
  {
    slug: "international-business",
    name: "International Business",
    format: "case",
    discipline: "markets",
    areasFrom: "outline",
    areas: [
      "Global Business Environment",
      "International Trade Theory and Agreements",
      "Trade Barriers and Documentation",
      "Foreign Exchange and International Finance",
      "Market Entry and Expansion Strategies",
      "Global Marketing and Cultural Adaptation",
      "Global Operations and Supply Chain",
      "Legal, Ethical and Political Risk",
    ],
  },
  {
    slug: "data-science-ai",
    name: "Data Science & AI",
    format: "objective",
    discipline: "data",
    areas: [
      "Probability and Statistics Foundations",
      "Data Analysis and Statistics for AI",
      "Tools for Data and AI",
      "AI Basics",
      "Machine Learning",
      "Perception, Representation, and Reasoning",
      "Privacy and Ethics",
      "Data Literacy and Foundations",
    ],
  },
  {
    slug: "healthcare-administration",
    name: "Healthcare Administration",
    format: "objective",
    discipline: "data",
    areas: [
      "Healthcare Organizations and Structure",
      "Healthcare Finances and Budgeting",
      "Staffing and Training",
      "Strategic Management",
      "Healthcare Technology",
      "Healthcare Billing and Insurance",
      "Healthcare Policy and Regulation",
      "Communication and Leadership",
    ],
  },
  {
    slug: "hospitality-event-management",
    name: "Hospitality & Event Management",
    format: "case",
    discipline: "hospitality",
    areas: [
      "Event Planning and Logistics",
      "Venue Selection and Layout",
      "Budgeting and Financial Management",
      "Vendor and Contract Management",
      "Marketing and Promotion",
      "Guest Services and Experience",
      "Food and Beverage Operations",
      "Risk Management and Safety",
      "Staffing and Leadership",
      "Evaluation and Post-Event Review",
    ],
  },
  {
    slug: "sports-entertainment-management",
    name: "Sports & Entertainment Management",
    format: "case",
    discipline: "hospitality",
    areas: [
      "Sports and Entertainment Marketing/Strategic Marketing",
      "Facility and Event Management",
      "Human Resource Management (Labor Relations)",
      "Promotion, Advertising, and Sponsorship for Sports and Entertainment Industry",
      "Financing and Economic Input",
      "Planning, Distribution, Marketing, Pricing, and Selling Sports and Entertainment Events",
      "Sports Law",
      "Communication in Sports and Entertainment (Media)",
      "Ethics",
      "Licensing",
      "Sports Governance",
      "Careers",
      "Marketing/Management Information Technology and Research",
      "Leadership and Managing Groups and Teams in the Sports and Entertainment Industry",
      "Management Strategies and Strategic Planning Tools",
      "Basic Functions of Management",
    ],
  },
];

export const TOTAL_TERMS = EVENTS.length * TERMS_PER_EVENT;

export function eventsIn(discipline: DisciplineId): LandingEvent[] {
  return EVENTS.filter((e) => e.discipline === discipline);
}

export function eventBySlug(slug: string): LandingEvent | undefined {
  return EVENTS.find((e) => e.slug === slug);
}

export function disciplineOf(event: LandingEvent): Discipline {
  return DISCIPLINES.find((d) => d.id === event.discipline) ?? DISCIPLINES[0];
}

/** Sign-up link that lands on the event's page once the account exists. */
export function signupFor(slug: string): string {
  return `/signup?next=${encodeURIComponent(`/play/${slug}`)}`;
}
