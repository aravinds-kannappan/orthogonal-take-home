# Orthogonal Chat

An AI-powered chat interface backed by real business intelligence data via Orthogonal APIs. Ask about companies, find contacts, enrich lead profiles, and more — all in a persistent, streaming chat experience.

**Live demo:** _[your Vercel URL here]_

---

## Getting Started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com)
- An [Orthogonal API key](https://orthogonal.com/dashboard/settings/api-keys)
- An [Upstash Redis](https://upstash.com) database

### Setup

```bash
git clone https://github.com/aravinds-kannappan/orthogonal-take-home
cd orthogonal-take-home
npm install
cp .env.example .env.local
# Fill in your keys in .env.local
npm run dev
```

Open http://localhost:3000.

### Environment Variables

```
Orthogonal=orth_live_xxxxxxxxxxxx
Anthropic=sk-ant-xxxxxxxxxxxx
UPSTASH_REDIS_REST_URL=xxxxxxxxxxxx
UPSTASH_REDIS_REST_TOKEN=xxxxxxxxxxxx
```

---

## What It Does

Users have natural language conversations where the AI automatically calls Orthogonal APIs to fetch real business intelligence data. The assistant chains multiple tools in a single turn when needed.

**Example queries:**
- "Find VP of Sales at Salesforce" → searches Apollo, returns contacts with email/phone availability
- "Enrich stripe.com" → runs Apollo + Fiber in parallel, returns funding, headcount, industry
- "Find engineering managers at Notion" → searches Apollo by domain + title
- "Who is the CRO at Salesforce?" → searches Apollo, returns name, title, contact info
- "Find contacts at workday.com filtered by Software Engineer" → domain + title filtered search

**APIs used:**
- **Apollo** — people search, company search, contact enrichment (primary for most queries)
- **Fiber AI** — kitchen-sink person/company enrichment, natural language profile search
- **Sixtyfour** — lead enrichment, email finding (fallback for person enrichment)
- **Tomba** — email finding, domain search (fallback for email lookups)

---

## How does your app handle the context window filling up?

The context window fills quickly — Orthogonal API responses can be large JSON payloads, and conversation history compounds on top of that. I handle this with two strategies:

**1. Sliding window** — Only the most recent 20 messages are sent to Claude on each request. Older messages are dropped from the active context. This keeps token usage predictable regardless of how long a conversation gets.

**2. Summarization** — When a conversation exceeds the window, the older messages are summarized into a compact 2-3 sentence block via a separate Claude call. That summary is prepended to the context so Claude retains key facts (names, companies, emails found earlier) without paying the full token cost of the raw history.

---

## How do conversations persist?

Conversations are stored in **Upstash Redis** (serverless Redis). Every message is written to Redis immediately after it's sent or received, keyed by conversation ID.

When a user returns to the app, their conversation list is fetched from Redis and their selected conversation is reloaded in full. The conversation ID is tracked in React state — if the user returns to the same session, their history is fully restored.

Redis was chosen because:
- Conversations are naturally key-value shaped (conversation ID → conversation object)
- Reads and writes are extremely fast with no joins needed
- Upstash's serverless Redis works seamlessly with Vercel's serverless functions

---

## System Design

### Architecture

```
Browser (Next.js)
    |
    +-- GET  /api/conversations        -> list all conversations
    +-- POST /api/conversations        -> create conversation
    +-- GET  /api/conversations/:id    -> load conversation history
    +-- DELETE /api/conversations      -> delete conversation
    +-- POST /api/chat                 -> streaming chat endpoint
                |
                +-- Anthropic Claude (with tool use)
                |       |
                |       +-- tools: search_people, search_companies,
                |                  enrich_person, find_email,
                |                  enrich_company, find_contacts_at_company,
                |                  search_people_nl
                |
                +-- Orthogonal API (POST /v1/run)
                        |
                        +-- Apollo      (people + company search, primary)
                        +-- Fiber AI    (kitchen-sink enrichment, NL search)
                        +-- Sixtyfour  (lead enrichment, email finding)
                        +-- Tomba      (email finding, domain search)

Storage: Upstash Redis
Deployment: Vercel (serverless)
```

### Tool Fallback Chain

Every tool has a primary API and one or more fallbacks:

| Tool | Primary | Fallback 1 | Fallback 2 |
|---|---|---|---|
| search_people | Apollo | Fiber NL search | — |
| search_companies | Apollo | Fiber NL search | — |
| enrich_person | Fiber kitchen-sink | Apollo people/match | Sixtyfour enrich-lead |
| find_email | Sixtyfour find-email | Tomba email-finder | — |
| enrich_company | Apollo (parallel w/ Fiber) | Sixtyfour enrich-company | — |
| find_contacts_at_company | Apollo | Tomba domain-search | — |
| search_people_nl | Fiber NL search | Apollo keyword search | — |

### What database(s) would you use?

**Current: Upstash Redis**
Good for this use case — conversations are key-value shaped, reads/writes are fast, and it works natively with Vercel's serverless environment.

**At scale: PostgreSQL + Redis**

```sql
CREATE TABLE conversations (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL,
  title       TEXT,
  summary     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id              UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  tool_events     JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_convs_user ON conversations(user_id, updated_at DESC);
```

- **Postgres** for durable storage, user management, conversation search
- **Redis** as a cache layer — cache enrichment results with a 1-hour TTL to cut Orthogonal API costs significantly on repeated queries

### How would it scale?

```
                    Load Balancer
                         |
          +--------------+--------------+
          |              |              |
     Next.js #1     Next.js #2     Next.js #3
          |              |              |
          +--------------+--------------+
                         |
                    PostgreSQL (RDS)
                         |
                    Redis Cache (Upstash)
```

- **Stateless API routes** — each serverless function reads/writes from the database directly with no shared in-memory state, so horizontal scaling is trivial
- **Connection pooling** — PgBouncer or Supabase's built-in pooler to handle connection limits under load
- **CDN** — static assets served from Vercel's edge network globally

---

## How would you handle multiple users hitting the same APIs concurrently?

Each request to `/api/chat` is fully independent — there's no shared mutable state between requests. Multiple users can hit Orthogonal APIs simultaneously without interfering with each other.

For rate limiting and fairness:

- **Per-user rate limiting** via Upstash Redis — sliding window counter keyed on user ID to limit requests per minute, preventing one user from exhausting Orthogonal credits
- **Orthogonal rate limits** — if Orthogonal itself rate limits us, the tool call returns a structured error and Claude tells the user gracefully rather than crashing
- **Request queuing** — for very high load, a Redis-based queue (e.g. BullMQ) could throttle outbound Orthogonal calls while keeping the UX smooth

The agentic loop (Claude calling multiple tools in sequence) is the most expensive flow — each tool call costs both Orthogonal credits and Claude tokens. Caching enrichment results in Redis would dramatically reduce concurrent load on both APIs.

---

## What happens when an API is slow or down?

**Timeouts** — every Orthogonal API call has a 15-second timeout via `AbortSignal.timeout(15000)`. If a call times out, the tool returns `{ success: false, error: "Request timed out after 15s" }`.

**Fallback chain** — every tool has 2-3 fallback APIs. If the primary fails, it automatically retries with the next provider. For example if Fiber kitchen-sink times out on person enrichment, it falls back to Apollo people/match, then Sixtyfour as a last resort.

**Graceful degradation** — Claude receives failures as structured tool results and responds naturally: "I wasn't able to retrieve the email, but here's what I found from the company search..." The user gets a useful partial response rather than a crash.

**Streaming resilience** — responses stream via Server-Sent Events. If an error occurs mid-stream it's caught and displayed inline without breaking the UI. The stop button uses AbortController to cancel in-flight requests.

**Known limitations** — C-suite executives at major companies (Stripe, OpenAI, Google) intentionally keep their contact info off these databases. The APIs work best for mid-level managers, sales/marketing roles, and smaller companies. This is a data availability issue, not an app issue — the fallback chain still fires and Claude explains what it found.

**What I'd add with more time:**
- **Circuit breaker** — after N consecutive failures to a specific sub-API, stop routing to it temporarily
- **Retry with exponential backoff** — for transient 5xx errors, retry up to 3 times before giving up
- **User-facing status** — show which specific API is slow/failing in the UI

---

## What I'd Do With More Time

1. **Auth** — NextAuth.js with Google OAuth for per-user private conversations
2. **Token-precise context management** — use tiktoken for exact sliding window instead of message count
3. **Redis enrichment cache** — cache company/person results to cut Orthogonal costs on repeated queries
4. **Circuit breaker pattern** — automatic fallback when a sub-API is consistently failing
5. **Retry with exponential backoff** — for transient Orthogonal API failures
6. **Conversation search** — full-text search across message history
7. **Per-user rate limiting** — Upstash Redis sliding window to prevent credit exhaustion
8. **Additional APIs** — Hunter (email verification), Brand.dev (company branding), Linkup (web search/news), Nyne (deep intelligence) are all available on Orthogonal and would significantly improve enrichment quality
9. **Export** — download conversation as markdown or CSV
10. **Streaming tool results** — show partial API data as it arrives rather than waiting for full response
