# Orthogonal Chat

An AI-powered chat interface backed by real business intelligence data via Orthogonal APIs. Ask about companies, find contacts, enrich lead profiles, and more — all in a persistent, streaming chat experience.

**Live demo:** _[[deploy URL here](https://orthogonal-take-home.vercel.app)]_

---

## Getting Started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com)
- An [Orthogonal API key](https://orthogonal.com/dashboard/settings/api-keys)

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

---

## How does your app handle the context window filling up?

The context window fills quickly — Orthogonal API responses can be large JSON payloads, and conversation history compounds on top of that. I handle this with two strategies:

**1. Sliding window** — Only the most recent 20 messages are sent to Claude on each request. Older messages are dropped from the active context. This keeps token usage predictable regardless of how long a conversation gets.

**2. Summarization** — When a conversation exceeds the window, the older messages are summarized into a compact 2-3 sentence block via a separate Claude call. That summary is prepended to the context so Claude retains key facts (names, companies, emails found earlier) without paying the full token cost of the raw history.

This means a user can have a very long research session — finding 10 companies, enriching contacts, following up on leads — and the assistant will still remember the important context from earlier in the conversation.

---

## How do conversations persist?

Conversations are stored in **Upstash Redis** (serverless Redis). Every message is written to Redis immediately after it's sent or received, keyed by conversation ID.

When a user returns to the app, their conversation list is fetched from Redis and their selected conversation is reloaded in full. The conversation ID is tracked in React state on the client — if the user bookmarks a URL or returns to the same session, their history is restored.

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
                |                  enrich_company, find_contacts_at_company
                |
                +-- Orthogonal API (POST /v1/run)
                        |
                        +-- Apollo      (people + company search)
                        +-- Fiber AI    (contact enrichment)
                        +-- Sixtyfour  (lead research)
                        +-- Tomba      (email finding)

Storage: Upstash Redis
Deployment: Vercel (serverless)
```

### What database(s) would you use?

**Current: Upstash Redis**
Good for this use case because conversations are key-value shaped, reads/writes are fast, and it works natively with Vercel's serverless environment.

**At scale: PostgreSQL + Redis**

For a production system with many users I'd use both:

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
- **Redis** as a cache layer — cache enrichment results with a 1-hour TTL to cut Orthogonal API costs significantly

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

---

## What happens when an API is slow or down?

**Timeouts** — every Orthogonal API call has a 15-second timeout via `AbortSignal.timeout(15000)`. If a call times out, the tool returns `{ success: false, error: "Request timed out after 15s" }`.

**Graceful degradation** — Claude receives the error as a structured tool result and responds naturally: "I wasn't able to reach the email finder API, but here's what I found from the company search..." The user gets a useful partial response rather than a crash.

**Streaming resilience** — responses are streamed via Server-Sent Events. If an error occurs mid-stream, it's caught and displayed inline without breaking the UI.

**What I'd add with more time:**
- **Circuit breaker** — after N consecutive failures to a specific sub-API, stop routing to it and fall back to alternatives
- **Retry with exponential backoff** — for transient 5xx errors, retry up to 3 times before giving up
- **User-facing status** — show which specific tool is slow/failing in the UI so users understand what's happening

---

## What I'd Do With More Time

1. **Auth** — NextAuth.js with Google OAuth for per-user private conversations
2. **Token-precise context management** — use tiktoken for exact sliding window instead of message count
3. **Redis enrichment cache** — cache company/person results to cut Orthogonal costs on repeated queries
4. **Circuit breaker pattern** — automatic fallback when a sub-API is consistently failing
5. **Retry logic** — exponential backoff on transient Orthogonal API failures
6. **Conversation search** — full-text search across message history
7. **Per-user rate limiting** — Upstash Redis sliding window to prevent credit exhaustion
8. **Export** — download conversation as markdown or CSV
