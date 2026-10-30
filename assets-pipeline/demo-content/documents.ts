// Fictional documents for the "Demo Project" used in docs captures (mirrors the Figma demo project).
// All parties, people, and figures are invented.

export type Section = { heading: string; clauses: string[] };
export type DemoDocument = {
  fileName: string;
  formats: ("pdf" | "docx")[];
  title: string;
  subtitle?: string;
  preamble: string[];
  sections: Section[];
  signatures: string[];
};

export const PROJECT = {
  name: "Demo Project",
  description: "A simple project to help you get started quickly.",
};

export const documents: DemoDocument[] = [
  {
    fileName: "Example_NDA",
    formats: ["pdf", "docx"],
    title: "Mutual Non-Disclosure Agreement",
    preamble: [
      "This Mutual Non-Disclosure Agreement (the \"Agreement\") is made on 3 March 2026 between ACME Corporation, a Delaware corporation with its principal office at 100 Market Street, Wilmington, DE 19801, USA (\"ACME\"), and Northwind Analytics Ltd., a company registered in England and Wales under number 08421937, with its registered office at 25 Finsbury Square, London EC2A 1DX, United Kingdom (\"Northwind\").",
      "ACME and Northwind are each a \"Party\" and together the \"Parties\". Each Party may disclose Confidential Information (the \"Discloser\") to the other Party (the \"Recipient\").",
    ],
    sections: [
      { heading: "1. Purpose", clauses: ["1.1 The Parties wish to evaluate a potential partnership for the joint development of a contract analytics platform (the \"Purpose\").", "1.2 The Recipient shall use Confidential Information solely for the Purpose."] },
      { heading: "2. Confidential Information", clauses: ["2.1 \"Confidential Information\" means all non-public business, technical, financial, and customer information disclosed by the Discloser, in any form, that is marked as confidential or that a reasonable person would understand to be confidential.", "2.2 Confidential Information includes source code, product roadmaps, pricing, customer lists, and the existence and terms of this Agreement."] },
      { heading: "3. Obligations of the Recipient", clauses: ["3.1 The Recipient shall keep Confidential Information strictly confidential and protect it with at least the same degree of care it uses for its own confidential information, and no less than reasonable care.", "3.2 The Recipient may disclose Confidential Information only to its employees, officers, and professional advisers who need to know it for the Purpose and who are bound by confidentiality obligations no less protective than this Agreement.", "3.3 The Recipient shall notify the Discloser promptly, and in any event within 48 hours, after becoming aware of any unauthorized use or disclosure."] },
      { heading: "4. Exclusions", clauses: ["4.1 The obligations in clause 3 do not apply to information that: (a) is or becomes public other than through a breach of this Agreement; (b) was lawfully known to the Recipient before disclosure; (c) is independently developed without use of Confidential Information; or (d) is lawfully received from a third party without restriction.", "4.2 The Recipient may disclose Confidential Information when required by law or court order, provided it gives the Discloser prompt written notice where legally permitted."] },
      { heading: "5. Term and survival", clauses: ["5.1 This Agreement starts on the date above and continues for two (2) years, unless terminated earlier by either Party on thirty (30) days' written notice.", "5.2 The confidentiality obligations survive for five (5) years after expiry or termination. Obligations relating to trade secrets survive for as long as the information remains a trade secret."] },
      { heading: "6. Return and destruction", clauses: ["6.1 On written request, or on termination, the Recipient shall within ten (10) business days return or destroy all Confidential Information and confirm this in writing.", "6.2 The Recipient may retain copies required by law or held in routine back-up systems, which remain subject to this Agreement."] },
      { heading: "7. Remedies", clauses: ["7.1 The Recipient acknowledges that damages alone may not be an adequate remedy for breach, and the Discloser is entitled to seek injunctive relief in addition to any other remedy.", "7.2 Neither Party's liability under this Agreement is limited in respect of breach of clause 3."] },
      { heading: "8. Non-solicitation", clauses: ["8.1 For twelve (12) months after the date of this Agreement, neither Party shall solicit for employment any employee of the other Party with whom it had contact in connection with the Purpose. General advertisements are not solicitation."] },
      { heading: "9. Governing law and jurisdiction", clauses: ["9.1 This Agreement is governed by the laws of the State of New York.", "9.2 The courts of New York County, New York, have exclusive jurisdiction over any dispute arising from this Agreement."] },
      { heading: "10. General", clauses: ["10.1 No licence or other right is granted under this Agreement except as expressly stated.", "10.2 This Agreement is the entire agreement between the Parties on its subject matter and may be amended only in writing signed by both Parties."] },
    ],
    signatures: ["For ACME Corporation: Jan Wolters, General Counsel", "For Northwind Analytics Ltd.: Priya Raman, Chief Operating Officer"],
  },
  {
    fileName: "JohnSmith-WorkContract",
    formats: ["pdf"],
    title: "Employment Agreement",
    subtitle: "ACME Corporation and John Smith",
    preamble: [
      "This Employment Agreement (the \"Agreement\") is made on 12 January 2026 between ACME Corporation, 100 Market Street, Wilmington, DE 19801, USA (the \"Company\"), and John Smith, residing at 48 Elm Avenue, Philadelphia, PA 19103, USA (the \"Employee\").",
    ],
    sections: [
      { heading: "1. Position and duties", clauses: ["1.1 The Company employs the Employee as Senior Legal Counsel, reporting to the General Counsel.", "1.2 The Employee shall advise on commercial contracts, data protection, and corporate transactions, and perform other duties reasonably assigned by the Company."] },
      { heading: "2. Start date and probation", clauses: ["2.1 Employment starts on 2 February 2026.", "2.2 The first three (3) months are a probationary period, during which either party may terminate this Agreement on two (2) weeks' written notice."] },
      { heading: "3. Place of work and hours", clauses: ["3.1 The Employee's normal place of work is the Company's Philadelphia office. The Employee may work remotely up to two (2) days per week.", "3.2 Normal working hours are 40 hours per week, Monday to Friday."] },
      { heading: "4. Compensation and benefits", clauses: ["4.1 The Company shall pay the Employee a gross annual base salary of USD 145,000, payable in equal semi-monthly instalments.", "4.2 The Employee is eligible for an annual performance bonus of up to 15% of base salary, at the Company's discretion.", "4.3 The Employee may participate in the Company's health, dental, and 401(k) plans under their terms."] },
      { heading: "5. Paid time off", clauses: ["5.1 The Employee is entitled to twenty-five (25) days of paid vacation per calendar year, in addition to public holidays.", "5.2 Up to five (5) unused vacation days may be carried over to the next calendar year."] },
      { heading: "6. Confidentiality", clauses: ["6.1 During and after employment, the Employee shall not disclose or misuse any confidential information of the Company or its clients, except as required to perform the Employee's duties or by law."] },
      { heading: "7. Intellectual property", clauses: ["7.1 All work product created by the Employee in the course of employment belongs to the Company. The Employee assigns to the Company all rights in such work product."] },
      { heading: "8. Restrictive covenants", clauses: ["8.1 For six (6) months after employment ends, the Employee shall not solicit any client of the Company with whom the Employee dealt in the last twelve (12) months of employment.", "8.2 The Employee is not subject to a non-compete obligation."] },
      { heading: "9. Termination", clauses: ["9.1 After the probationary period, either party may terminate this Agreement on sixty (60) days' written notice.", "9.2 The Company may terminate this Agreement immediately for cause, including gross misconduct or material breach of this Agreement."] },
      { heading: "10. Governing law", clauses: ["10.1 This Agreement is governed by the laws of the Commonwealth of Pennsylvania."] },
    ],
    signatures: ["For ACME Corporation: Jan Wolters, General Counsel", "Employee: John Smith"],
  },
  {
    fileName: "Share Purchase Agreement - Draft 2",
    formats: ["docx"],
    title: "Share Purchase Agreement",
    subtitle: "Draft 2 — for discussion purposes only",
    preamble: [
      "This Share Purchase Agreement (the \"Agreement\") is made on [●] 2026 between: (1) Marieke de Vries and Thomas Bakker (together, the \"Sellers\"); and (2) ACME Holdings B.V., a private limited company registered in the Netherlands under number 81234567 (the \"Buyer\").",
      "The Sellers together own the entire issued share capital of Bluefield Software B.V. (the \"Company\"). The Sellers wish to sell, and the Buyer wishes to buy, all shares in the Company on the terms of this Agreement.",
    ],
    sections: [
      { heading: "1. Definitions", clauses: ["1.1 \"Completion\" means completion of the sale and purchase of the Shares under clause 4.", "1.2 \"Shares\" means 18,000 ordinary shares with a nominal value of EUR 1.00 each, being the entire issued share capital of the Company.", "1.3 \"Warranties\" means the warranties given by the Sellers in clause 6 and Schedule 3."] },
      { heading: "2. Sale and purchase", clauses: ["2.1 Each Seller shall sell, and the Buyer shall buy, the Shares held by that Seller, free from all encumbrances, with effect from Completion."] },
      { heading: "3. Purchase price", clauses: ["3.1 The purchase price for the Shares is EUR 12,500,000 (the \"Purchase Price\").", "3.2 EUR 11,250,000 is payable at Completion. EUR 1,250,000 (the \"Retention Amount\") is held in escrow for eighteen (18) months after Completion as security for claims under this Agreement."] },
      { heading: "4. Completion", clauses: ["4.1 Completion takes place on the fifth (5th) business day after the conditions in clause 5 are satisfied, or on another date agreed in writing.", "4.2 At Completion, the Sellers shall deliver the notarial deed of transfer of the Shares and the resignation letters of the current directors."] },
      { heading: "5. Conditions", clauses: ["5.1 Completion is conditional on: (a) clearance from the Netherlands Authority for Consumers and Markets, if required; and (b) no material adverse change affecting the Company before Completion."] },
      { heading: "6. Warranties", clauses: ["6.1 Each Seller warrants to the Buyer that each Warranty is true and accurate at the date of this Agreement and at Completion.", "6.2 The Warranties are qualified by matters fairly disclosed in the Disclosure Letter."] },
      { heading: "7. Limitation of liability", clauses: ["7.1 The Sellers are not liable for any individual claim under the Warranties unless the amount of that claim exceeds EUR 25,000, and until the aggregate amount of all such claims exceeds EUR 125,000, in which case the Sellers are liable for the whole amount and not only the excess.", "7.2 The aggregate liability of the Sellers for all claims under the Warranties shall not exceed thirty per cent (30%) of the Purchase Price. [Buyer comment: the Buyer proposes 50%; to be discussed.]", "7.3 The Sellers are not liable for any claim unless the Buyer notifies the Sellers of the claim in writing within eighteen (18) months after Completion, or seven (7) years for tax claims.", "7.4 The limitations in this clause 7 do not apply to claims resulting from fraud or wilful misconduct of a Seller."] },
      { heading: "8. Indemnities", clauses: ["8.1 The Sellers shall indemnify the Buyer against any tax liability of the Company arising from events before Completion.", "8.2 The Sellers shall indemnify the Buyer against any loss arising from the pending dispute with Orion Logistics B.V. described in the Disclosure Letter."] },
      { heading: "9. Restrictive covenants", clauses: ["9.1 For two (2) years after Completion, no Seller shall carry on a business that competes with the business of the Company in the Benelux."] },
      { heading: "10. Governing law and jurisdiction", clauses: ["10.1 This Agreement is governed by the laws of the Netherlands.", "10.2 The competent court in Amsterdam has exclusive jurisdiction over any dispute arising from this Agreement."] },
    ],
    signatures: ["Seller: Marieke de Vries", "Seller: Thomas Bakker", "For ACME Holdings B.V.: Jan Wolters, Director"],
  },
];
