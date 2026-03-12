export const AGENT_TOOLS = [
  {
    name: 'summarize_page',
    description:
      'Summarizes the current page into concise, structured bullet points. Use for TL;DR, key points, main ideas, action items, decisions, or quick understanding of what the page is about.',
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
    description:
      'Drafts a professional email reply based on the visible email thread on the page. Use when the user wants to respond or craft a reply in an email client (e.g., Gmail).',
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
    description:
      'Answers a specific user question using the current page content as the primary source. Use for direct Q&A about the page.',
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
    description:
      'Extracts structured data from the page such as tables, lists, contacts, pricing, or specifications for easier downstream use.',
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
    description:
      'Generates a personalized outreach or connection request based on a LinkedIn profile page. Use only when the current page is a LinkedIn profile (/in/ URL).',
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
    description:
      'Generates a tailored cover letter based on a job posting page (e.g., LinkedIn Jobs, Indeed, Naukri).',
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
    description:
      'Explains a technical concept, code snippet, or jargon found on the page in plain English. Use when the user asks to explain, simplify, or break something down.',
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
