// Three real questions for the landing's sample run, copied with their keys from the public banks in content/
// (samples.test.ts fails if any of them drifts from its bank). Nothing a visitor does with them is sent anywhere.

import type { Diff } from "../../lib/elo";

export type SampleQuestion = {
  id: string;
  event: string;
  eventName: string;
  sub: string;
  diff: Diff;
  q: string;
  choices: string[];
  answer: number;
  explain: string;
};

export const SAMPLE_QUESTIONS: SampleQuestion[] = [
  {
    id: "acc-010",
    event: "accounting",
    eventName: "Accounting",
    sub: "Foundations of Accounting",
    diff: 2,
    q: "Land is bought for $300,000, with a $25,000 title search and a $5,000 legal fee to acquire it. What is the recorded cost of the land under U.S. GAAP?",
    choices: ["$300,000", "$325,000", "$305,000", "$330,000"],
    answer: 3,
    explain:
      "All costs necessary to get the land ready for use are capitalized: $300,000 + $25,000 + $5,000 = $330,000.",
  },
  {
    id: "ent-006",
    event: "entrepreneurship",
    eventName: "Entrepreneurship",
    sub: "Business Plan and Opportunity Assessment",
    diff: 3,
    q: "A product sells for $25 per unit, has a variable cost of $15 per unit and fixed costs of $12,000 per year. How many units must be sold to break even?",
    choices: ["480 units", "1,200 units", "600 units", "1,800 units"],
    answer: 1,
    explain:
      "Contribution per unit is $25 minus $15, or $10, so $12,000 divided by $10 is 1,200 units. Dividing by the $25 price gives the wrong answer of 480.",
  },
  {
    id: "law-011",
    event: "business-law",
    eventName: "Business Law",
    sub: "Legal systems",
    diff: 2,
    q: "A court's obligation to follow precedent from earlier decisions on similar facts is known as:",
    choices: [
      "Judicial review",
      "Stare decisis",
      "Original jurisdiction",
      "Due process",
    ],
    answer: 1,
    explain:
      "Stare decisis means to stand by things decided. Judicial review is the power to strike down laws that violate the Constitution.",
  },
];
