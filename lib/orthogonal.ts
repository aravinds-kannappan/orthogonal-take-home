const ORTHOGONAL_BASE = "https://api.orthogonal.com/v1";
const API_KEY = process.env.Orthogonal!;

export interface OrthogonalResult {
  success: boolean;
  price?: string;
  data?: unknown;
  error?: string;
}

async function runOrthogonal(
  api: string,
  endpoint: string,
  body?: Record<string, unknown>,
  query?: Record<string, unknown>
): Promise<OrthogonalResult> {
  try {
    const payload: Record<string, unknown> = { api, path: endpoint };
    if (body) payload.body = body;
    if (query) payload.query = query;

    const res = await fetch(`${ORTHOGONAL_BASE}/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }

    const data = await res.json();
    return { success: true, price: data.price, data: data.data ?? data };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { success: false, error: "Request timed out after 15s" };
    }
    return { success: false, error: String(err) };
  }
}

export const orthogonalTools = {
  // Search people — Apollo primary, Fiber NL fallback
  searchPeople: async (p: { name?: string; title?: string; company?: string; keywords?: string; limit?: number }) => {
    const result = await runOrthogonal("apollo", "/api/v1/mixed_people/api_search", {
      q_person_name: p.name,
      person_titles: p.title ? [p.title] : undefined,
      q_organization_name: p.company,
      q_keywords: p.keywords,
      per_page: p.limit ?? 10,
    });
    if (!result.success) {
      return runOrthogonal("fiber", "/v1/natural-language-search/profiles", {
        query: [p.name, p.title, p.company, p.keywords].filter(Boolean).join(" "),
      });
    }
    return result;
  },

  // Search companies — Apollo primary, Fiber NL fallback
  searchCompanies: async (p: { name?: string; industry?: string; keywords?: string; limit?: number }) => {
    const result = await runOrthogonal("apollo", "/api/v1/mixed_companies/search", {
      q_organization_name: p.name,
      q_keywords: p.keywords,
      per_page: p.limit ?? 10,
    });
    if (!result.success) {
      return runOrthogonal("fiber", "/v1/natural-language-search/companies", {
        query: [p.name, p.industry, p.keywords].filter(Boolean).join(" "),
      });
    }
    return result;
  },

  // Enrich person — Sixtyfour primary, Apollo people match fallback
  enrichPerson: async (p: { firstName: string; lastName: string; domain?: string; linkedinUrl?: string }) => {
    const result = await runOrthogonal("sixtyfour", "/enrich-lead", {
      lead_info: {
        first_name: p.firstName,
        last_name: p.lastName,
        company_domain: p.domain,
        linkedin_url: p.linkedinUrl,
      },
    });
    if (!result.success) {
      return runOrthogonal("apollo", "/api/v1/people/match", {
        first_name: p.firstName,
        last_name: p.lastName,
        organization_domain: p.domain,
      });
    }
    return result;
  },

  // Find email — Tomba primary, Fiber contact details fallback
  findEmail: async (p: { firstName: string; lastName: string; domain: string }) => {
    const result = await runOrthogonal("tomba", "/v1/email-finder", undefined, {
      domain: p.domain,
      first_name: p.firstName,
      last_name: p.lastName,
    });
    if (!result.success) {
      return runOrthogonal("fiber", "/v1/contact-details/turbo/sync", {
        first_name: p.firstName,
        last_name: p.lastName,
        company_website: p.domain,
      });
    }
    return result;
  },

  // Enrich company — Apollo primary, Fiber kitchen sink fallback
  enrichCompany: async (p: { domain: string }) => {
    const result = await runOrthogonal("apollo", "/api/v1/organizations/enrich", undefined, {
      domain: p.domain,
    });
    if (!result.success) {
      return runOrthogonal("fiber", "/v1/kitchen-sink/company", {
        company_website: p.domain,
      });
    }
    return result;
  },

  // Find contacts at company — Apollo primary, Tomba domain search fallback
  findContactsAtCompany: async (p: { domain: string; title?: string; limit?: number }) => {
    const result = await runOrthogonal("apollo", "/api/v1/mixed_people/api_search", {
      q_organization_domains: [p.domain],
      person_titles: p.title ? [p.title] : undefined,
      per_page: p.limit ?? 10,
    });
    if (!result.success) {
      return runOrthogonal("tomba", "/v1/domain-search", undefined, {
        domain: p.domain,
      });
    }
    return result;
  },

  // Natural language people search — Fiber primary, Apollo keyword fallback
  searchPeopleNL: async (p: { query: string }) => {
    const result = await runOrthogonal("fiber", "/v1/natural-language-search/profiles", {
      query: p.query,
    });
    if (!result.success) {
      return runOrthogonal("apollo", "/api/v1/mixed_people/api_search", {
        q_keywords: p.query,
        per_page: 10,
      });
    }
    return result;
  },
};

export const CLAUDE_TOOLS = [
  {
    name: "search_people",
    description: "Search for people by name, job title, company, or keywords. Returns matching contacts with details.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Person's full or partial name" },
        title: { type: "string", description: "Job title e.g. 'CEO', 'VP Sales'" },
        company: { type: "string", description: "Company name" },
        keywords: { type: "string", description: "Additional keywords" },
        limit: { type: "number", description: "Number of results (default 10)" },
      },
    },
  },
  {
    name: "search_companies",
    description: "Search for companies by name, industry, or keywords.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Company name" },
        industry: { type: "string", description: "Industry or sector" },
        keywords: { type: "string", description: "Keywords" },
        limit: { type: "number", description: "Number of results" },
      },
    },
  },
  {
    name: "enrich_person",
    description: "Get detailed info about a specific person — email, LinkedIn, company, title.",
    input_schema: {
      type: "object",
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
        domain: { type: "string", description: "Company domain e.g. stripe.com" },
        linkedinUrl: { type: "string" },
      },
      required: ["firstName", "lastName"],
    },
  },
  {
    name: "find_email",
    description: "Find the professional email address for a person at a company.",
    input_schema: {
      type: "object",
      properties: {
        firstName: { type: "string" },
        lastName: { type: "string" },
        domain: { type: "string", description: "Company domain e.g. stripe.com" },
      },
      required: ["firstName", "lastName", "domain"],
    },
  },
  {
    name: "enrich_company",
    description: "Get detailed company info by domain — funding, headcount, industry, description.",
    input_schema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Company domain e.g. stripe.com" },
      },
      required: ["domain"],
    },
  },
  {
    name: "find_contacts_at_company",
    description: "Find employees at a company, optionally filtered by job title.",
    input_schema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Company domain" },
        title: { type: "string", description: "Filter by job title (optional)" },
        limit: { type: "number" },
      },
      required: ["domain"],
    },
  },
  {
    name: "search_people_nl",
    description: "Natural language search for people. Use this for queries like 'VPs of Sales at fintech startups' or 'engineers at Series B AI companies'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language description of the people you're looking for" },
      },
      required: ["query"],
    },
  },
] as const;

export type ToolName = (typeof CLAUDE_TOOLS)[number]["name"];
