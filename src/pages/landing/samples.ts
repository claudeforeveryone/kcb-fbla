// Three questions for the landing's sample run, written for this page only and kept out of the question banks
// (samples.test.ts checks every bank). A visitor sees their keys before joining, so if they were bank items, the
// member's first rated try at them would be free Elo, outside the rule that a question whose key you have seen does not
// move your rating. They follow the banks' events, competency areas and difficulty levels. Nothing a visitor does with
// them is sent anywhere.

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
    id: "landing-accounting",
    event: "accounting",
    eventName: "Accounting",
    sub: "Foundations of Accounting",
    diff: 2,
    q: "A business has assets of $85,000 and liabilities of $30,000. It then borrows $10,000 from a bank and keeps the cash. What is owner's equity after the loan?",
    choices: ["$45,000", "$65,000", "$55,000", "$95,000"],
    answer: 2,
    explain:
      "Borrowing adds $10,000 to cash and $10,000 to liabilities, so equity does not change: $85,000 minus $30,000 is $55,000. A loan is not income.",
  },
  {
    id: "landing-entrepreneurship",
    event: "entrepreneurship",
    eventName: "Entrepreneurship",
    sub: "Financial Management and Initial Capital",
    diff: 3,
    q: "A retailer pays $40 for a product and wants a 20 percent profit margin on the selling price. What price should it charge?",
    choices: ["$48", "$60", "$52", "$50"],
    answer: 3,
    explain:
      "A margin is a share of the selling price, so the $40 cost must be 80 percent of the price: $40 divided by 0.80 is $50. Adding 20 percent to the cost gives $48, a 20 percent markup but only about a 16.7 percent margin.",
  },
  {
    id: "landing-business-law",
    event: "business-law",
    eventName: "Business Law",
    sub: "Property laws",
    diff: 2,
    q: "A shop owner who rents her store bolts custom display shelving to the walls for her business. When the lease ends, the shelving is generally:",
    choices: [
      "Part of the building, owned by the landlord",
      "A trade fixture she may remove",
      "An easement held by the landlord",
      "A lien on the building",
    ],
    answer: 1,
    explain:
      "Fixtures a commercial tenant installs for the business are trade fixtures. They stay the tenant's property and may be removed by the end of the lease, as long as she repairs any damage the removal causes.",
  },
];
