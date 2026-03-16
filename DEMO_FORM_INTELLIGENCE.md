# Form Intelligence — Demo Script
## The Complete 90-Second Story

### SETUP (Before demo — have these ready):
- Tab 1: Any Google Form (college event registration works best)
  Suggested: Create a simple Google Form with: Name, Email, Phone, College, Year
- Tab 2: LinkedIn profile (your own or any public one)
- ContextPilot extension open, backend on Railway

---

### SCENE 1 — The Problem (20 seconds)
[DO NOT open the extension yet]

SAY: "How many times have you opened a registration form and spent 3 minutes
     filling in the same name, email, college, year that you've typed a hundred
     times before? Every form, every time, same information."

[Pause for effect]

SAY: "ContextPilot remembers you. Let me show you."

---

### SCENE 2 — Save Details Once (25 seconds)
[Open the extension on any tab]

SAY: "First time — I tell ContextPilot who I am. Just once."

DO: Type in chat:
"Save my details: Name: [Your Name], Email: [your email],
Phone: [your phone], College: [your college],
B.Tech [your branch], [your year] year, CGPA: [your cgpa]"

[Wait for response]

POINT OUT: "It recognized the save intent, called the save_profile tool,
structured my details, and stored them permanently. I'll never type this again."

DO: Click the 👤 profile icon in the header

POINT OUT: "Here's my profile card — every detail organized by category.
This is what the agent knows about me."

DO: Close profile panel

---

### SCENE 3 — Fill a Form Instantly (35 seconds)
[Navigate to the Google Form tab]
[Open ContextPilot side panel on the Google Form page]

POINT OUT: "I'm now on a registration form."

DO: Click the preset command "📋 Fill This Form"
  OR type: "Fill this form for me"

[Wait for agent response — 3-5 seconds]

POINT OUT: "Look at this — it scanned all the form fields, mapped my profile
to each field, and is showing me a review before touching anything."

[Show the fill review card with all fields listed]

SAY: "High confidence on name, email, phone. It's asking me to review the
     year selection — it matched '3rd Year' to the dropdown option. That's
     intelligent field mapping, not hardcoded rules."

DO: Click "✅ Fill 5 Fields"

[Watch the form fill live]

POINT OUT: "Every field filled in under 2 seconds. I just click Submit."

---

### SCENE 4 — The Wow Moment (10 seconds)
[Keep the filled form visible]

SAY: "This is AI Everywhere. Not a chatbot I open separately.
     Not a tool I paste into. An agent that lives in my browser,
     knows who I am, and does the repetitive work so I don't have to."

---

### Judge Q&A for This Feature

Q: "What if the form has unusual field labels?"
A: "The AI matches semantically — it understands that 'Scholar Name',
   'Student Name', and 'Applicant Full Name' all map to the same profile field.
   It's language understanding, not string matching."

Q: "Can it submit the form?"
A: "By design, no. The agent fills but never submits. The human always
   has final control. This is a deliberate safety decision."

Q: "What if my profile changes?"
A: "Say 'update my phone to [new number]' and it updates just that field
   without touching anything else. The profile is a living document."

Q: "Where is the profile data stored?"
A: "In your Supabase database, encrypted at rest, behind Row Level Security.
   The profile is tied to your userId — only you can access it."

Q: "What forms does it work on?"
A: "Google Forms, Typeform, any standard HTML form. It reads the page DOM
   directly, so it works on any form the browser can render."
