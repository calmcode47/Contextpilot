// Tool Selection Priority (Routing Guidance for the LLM)
// - Use summarize_page when the user wants an overview (e.g., “summarize”, “TL;DR”, “key points”, “high level”)
//   Prefer summarize_page over answer_question when the user requests highlights or a TL;DR rather than a specific fact.
// - Use answer_question when the user asks a specific question (“who/what/when/where/why/how”, “is/does/which”).
//   Prefer answer_question over summarize_page when the ask is narrow and can be answered directly from the page.
// - Use extract_structured_data when the user wants raw data (tables/lists/contacts/pricing/specs/dates) rather than narrative.
//   Prefer extract_structured_data over summarize_page for tabular/structured outputs intended for downstream use.
// - Answer directly without any tool for simple conversational questions that do not require page-grounded analysis.
export const AGENT_TOOLS = [
  {
    name: 'summarize_page',
    description: `Summarizes the content of the current webpage into a structured, scannable output.
Use this when the user says: "summarize", "TL;DR", "key points", "what is this about", "give me the highlights", "overview", "brief", "short version".
Page type conditions: Works best on long-form pages (articles, docs, blogs, reports, policy pages). If the user requests raw data (tables, lists, contacts, pricing), prefer extract_structured_data.
Do NOT use for simple factual questions that can be answered directly from the page; prefer answer_question when the ask is a specific question.
What it produces: A TL;DR one‑liner followed by grouped bullet points organized by theme.
Routing note: Prefer this tool over answer_question when the user wants an overview rather than a specific answer.`,
    input_schema: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          enum: ['main_points', 'action_items', 'decisions', 'key_facts', 'all'],
          default: 'main_points',
          description:
            'Focus of the summary. main_points = overall gist, action_items = steps to take, decisions = outcomes, key_facts = facts/stats, all = comprehensive.'
        }
      },
      required: []
    }
  },
  {
    name: 'draft_email_reply',
    description: `Drafts a professional, ready‑to‑send email reply based on the visible email thread.
Use this when the user says: "reply", "respond", "draft a reply", "write an email", "answer this email", "write back".
Page type conditions: Use on webmail/conversation pages (e.g., Gmail, Outlook) or when the page clearly shows an email thread. Do NOT use on news articles, job postings, or profiles.
Do NOT use for general Q&A or summarization; if the user asks a factual question about the page, prefer answer_question.
What it produces: A complete reply body only (no subject), matching the requested tone and the thread’s formality.`,
    input_schema: {
      type: 'object',
      properties: {
        tone: {
          type: 'string',
          enum: ['formal', 'casual', 'assertive', 'empathetic'],
          description: 'Desired tone for the reply.'
        },
        intent: {
          type: 'string',
          description:
            'What the reply should achieve, e.g., confirm meeting, request more info, provide summary, negotiate terms.'
        }
      },
      required: ['intent']
    }
  },
  {
    name: 'answer_question',
    description: `Answers a specific question strictly using the current page as the source of truth.
Use this when the user asks a specific question: starts with "who/what/when/where/why/how", "is/does/which", "find", or "according to this page".
Page type conditions: Works across all pages; do NOT use on LinkedIn profiles for outreach—prefer generate_outreach_message when the user wants to contact someone.
Do NOT use when the user requests an overview ("summarize", "TL;DR")—prefer summarize_page in that case.
What it produces: A concise, page‑grounded answer; cite or quote relevant snippets when helpful.
Routing note: Prefer this over summarize_page for narrow, well‑scoped questions.`,
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The exact user question to answer from the page content.'
        }
      },
      required: ['question']
    }
  },
  {
    name: 'extract_structured_data',
    description: `Extracts clean, well‑organized structured data from the page for downstream use.
Use this when the user says: "extract table", "list items", "pull contacts", "get emails/phones", "pricing plans", "specs", "convert to table", "dates/timeline".
Page type conditions: Best for pricing pages, spec sheets, documentation tables, directories, catalogs, schedules.
Do NOT use for narrative overviews or explanations—prefer summarize_page or explain_concept in those cases.
What it produces: Proper markdown tables or labeled lists, depending on the requested dataType.`,
    input_schema: {
      type: 'object',
      properties: {
        dataType: {
          type: 'string',
          enum: ['table', 'list', 'contacts', 'pricing', 'specifications', 'dates'],
          description: 'The type of structured data to extract from the page.'
        }
      },
      required: []
    }
  },
  {
    name: 'generate_outreach_message',
    description: `Writes a short, personalized professional outreach message for a LinkedIn profile.
Use this when the user says: "write a connection request", "send a note", "cold outreach", "message this person", "collaboration message".
Page type conditions: Only use on LinkedIn profile pages (URL contains "/in/"). Do NOT use on LinkedIn posts, company pages, or job listings.
Do NOT use on non‑LinkedIn pages; instruct the user to open a LinkedIn profile instead if needed.
What it produces: A concise message tailored to the profile and the selected purpose (connection_request, cold_outreach, collaboration).`,
    input_schema: {
      type: 'object',
      properties: {
        purpose: {
          type: 'string',
          enum: ['connection_request', 'cold_outreach', 'collaboration'],
          description: 'The purpose of the outreach message.'
        },
        tone: {
          type: 'string',
          enum: ['formal', 'friendly'],
          description: 'The tone of the message.'
        }
      },
      required: ['purpose']
    }
  },
  {
    name: 'generate_cover_letter',
    description: `Generates a targeted, three‑paragraph cover letter tailored to the visible job posting.
Use this when the user says: "write a cover letter", "apply for this", "draft cover letter", "application letter".
Page type conditions: Prefer job board postings (linkedin.com/jobs, indeed.com, naukri.com, greenhouse.io, lever.co). If the page may not be a job posting, the tool will still write a letter based on the available content.
Do NOT use for email replies or generic messages—prefer draft_email_reply or summarize_page where appropriate.
What it produces: A 3‑paragraph letter (≤300 words) connecting the candidate’s background to the job requirements with specific evidence.`,
    input_schema: {
      type: 'object',
      properties: {
        candidateBackground: {
          type: 'string',
          description:
            "Brief description of the user's background/experience to contextualize the cover letter."
        },
        tone: {
          type: 'string',
          enum: ['formal', 'enthusiastic'],
          description: 'Desired tone for the cover letter.'
        }
      },
      required: ['candidateBackground']
    }
  },
  {
    name: 'explain_concept',
    description: `Explains a concept at the right level for the audience, using precise analogies and concrete examples.
Use this when the user says: "explain", "what is", "help me understand", "simplify", "ELI5", "how does it work".
Page type conditions: Works well on technical docs, code pages, research posts; also valid on general pages if a concept is present.
Do NOT use when the user asks a narrow factual question—prefer answer_question; do NOT summarize entire pages—prefer summarize_page.
What it produces: A structured explanation: (1) what it is, (2) why it matters, (3) how it works (with analogy), (4) key points.`,
    input_schema: {
      type: 'object',
      properties: {
        targetAudience: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'expert'],
          description: 'The assumed knowledge level of the explanation.'
        },
        conceptToExplain: {
          type: 'string',
          description: 'The specific concept, snippet, or term to explain.'
        }
      },
      required: ['conceptToExplain']
    }
  }
];
