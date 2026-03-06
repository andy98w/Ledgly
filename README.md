# Ledgly — Technical & Product Report

**A modern financial management platform for organizations**
*March 2026*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement & Market Context](#2-problem-statement--market-context)
3. [Product Overview](#3-product-overview)
4. [System Architecture](#4-system-architecture)
5. [Technology Stack](#5-technology-stack)
6. [Database Design](#6-database-design)
7. [Authentication & Security](#7-authentication--security)
8. [Core Feature Deep Dives](#8-core-feature-deep-dives)
9. [AI Agent System](#9-ai-agent-system)
10. [Gmail Integration Pipeline](#10-gmail-integration-pipeline)
11. [Frontend Architecture](#11-frontend-architecture)
12. [API Design & Patterns](#12-api-design--patterns)
13. [Testing & Quality Assurance](#13-testing--quality-assurance)
14. [Deployment & Infrastructure](#14-deployment--infrastructure)
15. [Performance & Scalability Considerations](#15-performance--scalability-considerations)
16. [Security Posture](#16-security-posture)
17. [Roadmap & Future Development](#17-roadmap--future-development)
18. [Appendix: Complete API Reference](#appendix-complete-api-reference)

---

## 1. Executive Summary

Ledgly is a full-stack financial management platform built for organizations — fraternities, sororities, clubs, and small groups — that need to track membership dues, record payments, manage expenses, and maintain transparent financial records. It replaces the error-prone spreadsheet-and-Venmo workflow that most small organizations rely on today.

**Key differentiators:**

- **Automated payment reconciliation** — Connects to Gmail to automatically detect and import payment notifications from Venmo, Zelle, Cash App, and PayPal, then matches them to members and allocates them to outstanding charges with confidence scoring.
- **AI-powered financial assistant** — An embedded conversational agent (powered by Claude Sonnet 4) that can query organizational data, create charges, record payments, and manage members through natural language with explicit user confirmation for write operations.
- **Full audit trail with undo/redo** — Every financial action is logged with before/after diffs, batch grouping for related operations, and support for reversal via batch ID.
- **Role-based access hierarchy** — Owner > Admin > Treasurer > Member, with fine-grained permission enforcement and ownership transfer capability.

The platform is built as a TypeScript monorepo with a NestJS API backend, Next.js 14 frontend, PostgreSQL database (via Prisma ORM), and is deployed on Railway (API) and Vercel (web).

---

## 2. Problem Statement & Market Context

### The Problem

Small organizations — particularly Greek-letter organizations, student clubs, and community groups — handle tens of thousands of dollars annually through informal channels. A typical workflow looks like this:

1. Treasurer creates a Google Sheet listing each member and what they owe
2. Members send money via Venmo, Zelle, or Cash App with inconsistent memos
3. Treasurer manually checks their email or payment app, matches each payment to a member, and updates the spreadsheet
4. Discrepancies arise: missed payments, double-counting, misattributed transactions
5. No audit trail exists — disputes become he-said-she-said

This process is:
- **Time-consuming** — Treasurers spend hours each week on manual reconciliation
- **Error-prone** — Name mismatches, forgotten payments, and formula errors in spreadsheets
- **Non-transparent** — Members can't see their balances in real-time; admins can't verify historical changes
- **Unauditable** — When leadership changes, institutional knowledge is lost

### The Opportunity

There are over 750,000 registered student organizations in the US alone, with Greek organizations managing an estimated $3.5B in annual dues. Most use spreadsheets, GroupMe polls, or ad-hoc systems. Existing tools like OmegaFi and GreekBill target large national organizations with enterprise pricing — leaving the long tail of smaller chapters and clubs underserved.

Ledgly targets this segment with:
- Free or low-cost pricing for small groups
- Zero-friction onboarding (join codes, magic link auth)
- Automated payment detection that eliminates manual reconciliation
- An AI assistant that reduces the learning curve to near-zero

---

## 3. Product Overview

### User Roles

| Role | Capabilities |
|------|-------------|
| **Owner** | Full control. Manage admins, delete org, transfer ownership. One per org. |
| **Admin** | Manage members, charges, payments, expenses. Connect Gmail. Configure settings. |
| **Treasurer** | Create/manage charges, record payments, manage expenses. Financial operations. |
| **Member** | View own balance, charges, and payment history. |

### Core Workflows

**Organization Setup:**
1. User registers (email + password or magic link)
2. Creates organization → becomes Owner
3. Generates a join code (e.g., `X7KM2P`) for members
4. Members join via code → auto-approved or pending admin approval

**Financial Management:**
1. Admin/Treasurer creates charges (dues, events, fines, merch) assigned to members
2. Payments arrive via Venmo/Zelle/etc.
3. Ledgly auto-detects payments from Gmail and matches to members
4. Allocations link payments to specific charges
5. Charge statuses update automatically: Open → Partially Paid → Paid

**Expense Tracking:**
1. Admin/Treasurer records organization expenses (events, supplies, food, venue, marketing, services)
2. Outgoing payment emails auto-detected and matched to existing expenses
3. Summary reports group by category and time period

**AI Assistant:**
1. User opens the agent chat
2. Asks natural language questions: "Who hasn't paid their spring dues?"
3. Agent queries data using built-in tools, returns formatted answers
4. User can instruct write operations: "Charge all active members $50 for spring dues"
5. Agent proposes the action, user confirms, agent executes

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                         │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               Next.js 14 (App Router)                │   │
│  │                                                      │   │
│  │  ┌────────┐  ┌──────────┐  ┌────────┐  ┌─────────┐  │   │
│  │  │ Zustand │  │  React   │  │  Radix │  │Recharts │  │   │
│  │  │ (State) │  │  Query   │  │  (UI)  │  │(Charts) │  │   │
│  │  └────────┘  └──────────┘  └────────┘  └─────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │ HTTPS                           │
│                    Vercel (CDN + SSR)                        │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                         API LAYER                           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 NestJS Application                    │   │
│  │                                                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │   │
│  │  │  Helmet   │  │Throttler │  │  Global Pipes &   │  │   │
│  │  │(Security) │  │  (Rate)  │  │  Exception Filter │  │   │
│  │  └──────────┘  └──────────┘  └───────────────────┘  │   │
│  │                                                      │   │
│  │  ┌──────┐ ┌────────┐ ┌────────┐ ┌────────┐          │   │
│  │  │ Auth │ │Members │ │Charges │ │Payments│          │   │
│  │  └──────┘ └────────┘ └────────┘ └────────┘          │   │
│  │  ┌────────┐ ┌──────┐ ┌──────┐ ┌──────────┐          │   │
│  │  │Expenses│ │Gmail │ │Agent │ │  Audit   │          │   │
│  │  └────────┘ └──────┘ └──────┘ └──────────┘          │   │
│  │                                                      │   │
│  │  ┌───────────────┐  ┌───────────┐  ┌─────────────┐  │   │
│  │  │ Prisma Client │  │  Resend   │  │  Anthropic  │  │   │
│  │  │    (ORM)      │  │  (Email)  │  │  (AI SDK)   │  │   │
│  │  └───────┬───────┘  └───────────┘  └─────────────┘  │   │
│  └──────────┼───────────────────────────────────────────┘   │
│             │          Railway (Docker)                      │
└─────────────┼───────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────┐    ┌──────────────────────────────┐
│      PostgreSQL          │    │      External Services       │
│                          │    │                              │
│  Organizations           │    │  Gmail API (read-only)       │
│  Users / Memberships     │    │  Anthropic Claude (AI)       │
│  Charges / Payments      │    │  Resend (transactional email)│
│  Expenses / Allocations  │    │  Google OAuth2               │
│  Audit Logs              │    │                              │
│  Agent Sessions          │    │                              │
│                          │    │                              │
│    Railway (managed)     │    │                              │
└──────────────────────────┘    └──────────────────────────────┘
```

### Monorepo Structure

```
ledgly/
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── prisma/             # Schema, migrations
│   │   └── src/
│   │       ├── common/         # Guards, filters, decorators
│   │       └── modules/        # Feature modules
│   │           ├── auth/
│   │           ├── organizations/
│   │           ├── members/
│   │           ├── charges/
│   │           ├── payments/
│   │           ├── expenses/
│   │           ├── gmail/
│   │           ├── agent/
│   │           ├── audit/
│   │           └── notifications/
│   └── web/                    # Next.js frontend
│       ├── app/
│       │   ├── (auth)/         # Login, register, onboarding
│       │   ├── (dashboard)/    # Main app pages
│       │   └── (portal)/       # Public member portal
│       ├── components/         # Shared components
│       └── lib/                # Hooks, queries, stores, utils
├── packages/
│   └── shared/                 # Shared constants, types, utils
├── Dockerfile                  # Production API build
└── pnpm-workspace.yaml         # Monorepo config
```

---

## 5. Technology Stack

### Backend

| Technology | Purpose | Why This Choice |
|-----------|---------|-----------------|
| **NestJS 10** | Application framework | Modular architecture, dependency injection, decorators for guards/pipes/interceptors. Enterprise-grade structure for a financial application. |
| **Prisma 5** | Database ORM | Type-safe queries, auto-generated client, declarative schema, migration management. Reduces SQL injection risk to near-zero. |
| **PostgreSQL** | Primary database | ACID compliance critical for financial data. Supports row-level locking, JSON columns, array types, and complex indexing. |
| **Passport + JWT** | Authentication | Industry-standard auth with refresh token rotation. Stateless verification for horizontal scaling. |
| **Zod** | Runtime validation | Shared validation schemas between API and frontend. Environment variable validation at startup. |
| **class-validator** | DTO validation | NestJS-native request validation with decorators. Whitelist mode prevents mass assignment. |
| **Resend** | Transactional email | Simple API, reliable delivery for magic links, invitations, and payment reminders. |
| **Anthropic SDK** | AI agent | Streaming tool-use with Claude Sonnet 4. Structured tool definitions with typed parameters. |
| **googleapis** | Gmail integration | Official Google API client for OAuth2 and Gmail message retrieval. |

### Frontend

| Technology | Purpose | Why This Choice |
|-----------|---------|-----------------|
| **Next.js 14** | React framework | App Router for file-based routing, server components, optimized builds. Vercel-native deployment. |
| **React 18** | UI library | Component model, concurrent features, Suspense for loading states. |
| **TailwindCSS** | Styling | Utility-first CSS with consistent spacing/color system. Rapid iteration without CSS file management. |
| **Radix UI** | Component primitives | Unstyled, accessible components (dialogs, dropdowns, tooltips). WAI-ARIA compliant out of the box. |
| **TanStack React Query v5** | Server state | Caching, background refetching, optimistic updates, cursor pagination. Eliminates manual loading/error state management. |
| **Zustand** | Client state | Lightweight (1KB), no boilerplate. Used for UI state (modals, filters) separate from server state. |
| **React Hook Form** | Form management | Uncontrolled inputs for performance, Zod resolver for validation, minimal re-renders. |
| **Recharts** | Data visualization | Composable chart components built on D3. Dashboard revenue/payment charts. |
| **next-themes** | Dark mode | System preference detection, cookie persistence, flash-free theme switching. |
| **cmdk** | Command palette | Global search/navigation (Cmd+K). Keyboard-first UX. |

### Infrastructure

| Technology | Purpose |
|-----------|---------|
| **Railway** | API hosting (Docker), managed PostgreSQL |
| **Vercel** | Frontend hosting, CDN, SSL |
| **Docker** | Containerized API builds with multi-stage optimization |
| **pnpm** | Package management with workspace support for monorepo |
| **GitHub** | Source control, CI/CD triggers |

---

## 6. Database Design

### Entity Relationship Overview

The database consists of 15 tables designed around a multi-tenant organization model. Every financial entity (charges, payments, expenses, allocations) is scoped to an organization via `org_id` foreign keys, ensuring strict data isolation.

### Core Financial Model

```
Organization (1) ──── (N) Membership ──── (N) Charge
                            │                    │
                            │                    │
                            └──── (N) Payment    │
                                       │         │
                                       └─── PaymentAllocation ───┘
```

**Key design decisions:**

1. **Membership as the central entity** — Users don't directly own charges or payments. Everything flows through a Membership, which represents a user's role in a specific organization. This enables:
   - Users belonging to multiple organizations
   - Organization-scoped financial isolation
   - Placeholder members (no linked user account yet)

2. **PaymentAllocation as a junction table** — Rather than a simple 1:1 payment-to-charge relationship, allocations allow:
   - One payment split across multiple charges
   - One charge paid by multiple payments
   - Partial payments with remaining balance tracking
   - Clean audit trail of how money was applied

3. **Soft deletes on payments and expenses** — Financial records use `deleted_at` timestamps rather than hard deletes. This preserves audit history and enables restore operations. Allocations cascade on payment deletion.

4. **Charge status as derived state** — A charge's status (OPEN / PARTIALLY_PAID / PAID / VOID) is recalculated from its allocations within a transaction whenever allocations change, rather than being manually set. This eliminates status drift.

### Indexing Strategy

Performance-critical queries are supported by composite indexes:

```sql
-- Financial queries scoped to org
CREATE INDEX charges_org_id_status_idx ON charges(org_id, status);
CREATE INDEX payments_org_id_paid_at_deleted_at_idx ON payments(org_id, paid_at, deleted_at);
CREATE INDEX expenses_org_id_date_idx ON expenses(org_id, date);

-- Allocation lookups (hot path during payment processing)
CREATE INDEX payment_allocations_payment_id_idx ON payment_allocations(payment_id);
CREATE INDEX payment_allocations_charge_id_idx ON payment_allocations(charge_id);

-- Audit log queries (time-range + entity filtering)
CREATE INDEX audit_logs_org_id_created_at_idx ON audit_logs(org_id, created_at);
CREATE INDEX audit_logs_org_id_entity_type_entity_id_idx ON audit_logs(org_id, entity_type, entity_id);
CREATE INDEX audit_logs_org_id_batch_id_idx ON audit_logs(org_id, batch_id);

-- Idempotency for email imports
CREATE UNIQUE INDEX email_imports_gmail_connection_id_message_id_key ON email_imports(gmail_connection_id, message_id);
CREATE UNIQUE INDEX payments_org_id_external_id_key ON payments(org_id, external_id);
```

### Enum Types

PostgreSQL native enums enforce valid states at the database level:

| Enum | Values | Purpose |
|------|--------|---------|
| `MembershipRole` | OWNER, ADMIN, TREASURER, MEMBER | Access control hierarchy |
| `MembershipStatus` | ACTIVE, INACTIVE, LEFT, INVITED, PENDING | Member lifecycle states |
| `ChargeCategory` | DUES, EVENT, FINE, MERCH, OTHER | Charge classification |
| `ChargeStatus` | OPEN, PARTIALLY_PAID, PAID, VOID | Payment progress |
| `ExpenseCategory` | EVENT, SUPPLIES, FOOD, VENUE, MARKETING, SERVICES, OTHER | Expense classification |
| `EmailImportStatus` | PENDING, CONFIRMED, IGNORED, DUPLICATE, AUTO_CONFIRMED | Import processing state |
| `NotificationType` | PAYMENT_RECEIVED, CHARGE_OVERDUE, MEMBER_JOINED, EXPENSE_CREATED, CHARGE_CREATED, SYSTEM | Notification routing |

---

## 7. Authentication & Security

### Multi-Strategy Authentication

Ledgly implements four authentication strategies, designed to balance security with frictionless onboarding:

**1. Password-based authentication**
- Bcrypt hashing with salt factor 10
- Strength requirements: 8+ characters, uppercase, lowercase, number
- Brute-force protection: 5 failed attempts triggers 15-minute account lockout
- Password change revokes all active sessions (forces re-authentication)

**2. Magic link authentication**
- One-time tokens with 15-minute expiry
- Sent via Resend transactional email
- Timing-safe token comparison (`crypto.timingSafeEqual`) prevents timing attacks
- Auto-links pending invitations on verification

**3. Refresh token rotation**
- Access tokens: 7-day expiry (JWT, stateless verification)
- Refresh tokens: 30-day expiry (stored in DB, revocable)
- **Rotation with reuse detection**: Each refresh generates a new token pair. If a previously-used refresh token is presented (indicating theft), all tokens for that user are revoked immediately.
- Tokens stored with `revokedAt` timestamp for revocation audit trail

**4. OAuth2 (Google)**
- Used exclusively for Gmail API access (read-only scope)
- HMAC-signed state parameter prevents CSRF
- Access/refresh tokens stored for background sync

### Security Middleware Stack

```
Request → Helmet → CORS → ThrottlerGuard → AuthGuard(JWT) → RolesGuard → Validation Pipe → Handler
```

| Layer | Implementation | Configuration |
|-------|---------------|---------------|
| **Helmet** | HTTP security headers | Default CSP, HSTS, X-Frame-Options |
| **CORS** | Origin restriction | Allowlist: `WEB_URL` only |
| **Rate Limiting** | NestJS Throttler | Global: 100 req/60s. Auth endpoints: 5-30 req/min |
| **JWT Validation** | Passport JWT strategy | Bearer token extraction, signature verification |
| **Role Authorization** | Custom RolesGuard | Decorator-based: `@Roles('ADMIN')`. OWNER implies ADMIN. |
| **Input Validation** | Global ValidationPipe | Whitelist mode, forbid non-whitelisted properties, transform enabled |
| **Exception Handling** | Global ExceptionFilter | Unified error response format, stack traces stripped in production |

### Role Hierarchy

The role system implements strict hierarchy enforcement:

```
OWNER (rank 3)  →  Can manage everyone below. Cannot be removed (must transfer).
  ↓
ADMIN (rank 2)  →  Can manage TREASURER and MEMBER. Cannot manage other ADMINs.
  ↓
TREASURER (rank 1)  →  Financial operations only. Cannot manage members.
  ↓
MEMBER (rank 0)  →  Read-only access to own data.
```

The `RolesGuard` treats OWNER as a superset of ADMIN — any endpoint decorated with `@Roles('ADMIN')` automatically grants access to OWNER without modifying decorators.

### Auth Event Logging

Every authentication event is recorded in the `auth_events` table for security audit:

| Event | Data Captured |
|-------|--------------|
| `REGISTER` | email, IP, user agent |
| `LOGIN` | userId, IP, user agent |
| `FAILED_LOGIN` | email, IP, user agent, attempt count |
| `ACCOUNT_LOCKED` | email, lock duration |
| `LOGOUT` | userId, token revocation |
| `MAGIC_LINK_VERIFY` | userId, token used |
| `PASSWORD_CHANGED` | userId, sessions revoked count |
| `PASSWORD_RESET` | userId, token used |
| `TOKEN_REFRESH` | userId, old/new token IDs |

---

## 8. Core Feature Deep Dives

### 8.1 Charge Management

Charges represent money owed by members. The system supports both individual and bulk creation with automatic status lifecycle management.

**Charge lifecycle:**

```
                 ┌──────────────────────────┐
                 │                          │
    Created ──→ OPEN ──→ PARTIALLY_PAID ──→ PAID
                 │                          │
                 └────────→ VOID ←──────────┘
                              │
                              └──→ OPEN (restore)
```

**Bulk creation flow:**
1. Admin selects N members and enters charge details
2. API validates all membership IDs belong to the org
3. Creates N charge records in a single transaction
4. Generates a batch audit log: `"Charged 5 members: Spring Dues — $150.00"`
5. Each charge gets its own audit entry linked by `batch_id`

**Status recalculation** happens inside a transaction with row-level locking:
```typescript
// Pseudocode for status update
const allocated = sum(charge.allocations.amountCents);
if (allocated === 0) status = 'OPEN';
else if (allocated < charge.amountCents) status = 'PARTIALLY_PAID';
else status = 'PAID';
```

**Overdue reminders:**
- Admin triggers batch email to members with overdue charges
- Email contains member name, charge title, amount, and due date
- Sent via Resend transactional email

### 8.2 Payment Processing & Allocation

Payments represent money received. The allocation system links payments to charges with support for partial payments, split payments, and automatic allocation.

**Duplicate detection:**
Before creating a payment, the system checks for existing payments with matching `(rawPayerName, amountCents, paidAt within same day)`. This catches common scenarios like double-entry from both manual recording and Gmail import. Soft-deleted duplicates are hard-deleted to prevent restore conflicts.

**Manual allocation flow:**
1. Select a payment and one or more charges
2. System validates: allocation amount ≤ remaining charge balance
3. Row-level locking (`SELECT FOR UPDATE`) prevents race conditions
4. Creates allocation records, updates charge statuses
5. All within a single database transaction

**Auto-allocation algorithm:**
```
1. Input: chargeId
2. Find the charge's member
3. Get all unallocated payment amounts for that member
4. Sort payments by date (oldest first — FIFO)
5. Allocate from each payment until charge is fully paid
6. Update charge status
7. Return total allocated
```

**Category-aware allocation (for Gmail imports):**
When a payment arrives via email with a memo like "Spring dues", the system:
1. Parses the memo for category keywords (dues, event, fine, etc.)
2. Filters the member's open charges by derived category
3. Allocates to matching charges first, then falls back to any open charge

### 8.3 Member Lifecycle

Members go through distinct lifecycle states with different entry paths:

```
                    ┌─── Magic Link invite ──→ INVITED ──→ ACTIVE
                    │
  New member ───────┼─── Direct add (has password) ──→ ACTIVE
                    │
                    ├─── Join code (approval off) ──→ ACTIVE
                    │
                    └─── Join code (approval on) ──→ PENDING ──→ ACTIVE
                                                        │
                                                        └──→ (rejected/removed)

  Active member ──→ LEFT (soft delete, preserves history)
                      │
                      └──→ ACTIVE (restore, reactivates)
```

**Invitation system:**
- Admins add members with email + role
- If the user exists with a password → immediately ACTIVE
- If the user exists without a password (magic-link-only) → INVITED, sends admin invitation email
- If the user doesn't exist → creates user account, INVITED status, sends invitation
- On verification, `linkPendingInvitations()` auto-promotes all INVITED memberships to ACTIVE

**Join codes:**
- 6-character codes using a safe alphabet (excludes 0/O, 1/I/L to prevent confusion)
- Configurable: enabled/disabled, requires approval or auto-approve
- Reactivates LEFT memberships (re-joining former members)

**Balance calculation:**
Member balances are computed via raw SQL for performance:
```sql
SELECT
  m.id,
  COALESCE(SUM(c.amount_cents), 0) as total_charged,
  COALESCE(SUM(pa.allocated), 0) as total_paid,
  COUNT(CASE WHEN c.due_date < NOW() AND c.status != 'PAID' AND c.status != 'VOID' THEN 1 END) as overdue_count
FROM memberships m
LEFT JOIN charges c ON c.membership_id = m.id
LEFT JOIN (SELECT charge_id, SUM(amount_cents) as allocated FROM payment_allocations GROUP BY charge_id) pa ON pa.charge_id = c.id
WHERE m.org_id = $1
GROUP BY m.id
```

### 8.4 Expense Tracking

Expenses track outgoing organizational spending with category classification and soft-delete support.

**Categories:** EVENT, SUPPLIES, FOOD, VENUE, MARKETING, SERVICES, OTHER

**Summary aggregation:**
The `/expenses/summary` endpoint groups expenses by category and time period, returning:
```json
{
  "byCategory": [
    { "category": "EVENT", "totalCents": 150000, "count": 3 },
    { "category": "FOOD", "totalCents": 45000, "count": 7 }
  ],
  "total": 195000
}
```

**Gmail integration for expenses:**
Outgoing payment emails (e.g., "You paid $200 to Party Supplies Co") are detected during Gmail sync. The system:
1. Identifies outgoing direction from email subject patterns
2. Searches for existing expenses matching amount/date/vendor
3. If match found → links import to expense (pending review)
4. If no match + auto-approve enabled → creates new expense automatically

### 8.5 Audit System

Every create, update, and delete operation produces an audit log entry with full before/after diffs.

**Audit log structure:**
```json
{
  "id": "clx...",
  "orgId": "org_...",
  "actorId": "mem_...",
  "entityType": "CHARGE",
  "entityId": "chg_...",
  "action": "UPDATE",
  "diffJson": {
    "before": { "status": "OPEN", "amountCents": 10000 },
    "after": { "status": "PARTIALLY_PAID", "amountCents": 10000 }
  },
  "batchId": "batch_abc123",
  "batchDescription": "Charged 12 members: Spring Dues — $150.00",
  "source": null,
  "createdAt": "2026-03-01T..."
}
```

**Batch grouping:**
Related operations (e.g., charging 12 members at once) share a `batchId`. The frontend groups these into a single collapsible entry showing the batch description and individual diffs.

**Source tracking:**
- `null` — Manual user action
- `"AI_AGENT"` — Action performed by the AI agent

**Undo/redo support:**
The `undone` flag and `undone_at` timestamp enable future undo functionality by batch. When a batch is undone, all entities created in that batch can be reversed (charges voided, payments deleted, etc.).

---

## 9. AI Agent System

### Architecture

The AI agent is built on Anthropic's Claude Sonnet 4 model with streaming tool use. It operates within the organization context and has access to both read and write tools.

```
User message → Agent Service → Claude API (streaming)
                    ↓
              ┌─────────────┐
              │ Text chunks  │ → Stream to client (SSE)
              │ Tool calls   │ → Render for confirmation
              └─────────────┘
                    ↓
              User confirms tool call
                    ↓
              Execute tool → Database operations
                    ↓
              Continue conversation (up to 10 rounds)
```

### Tool Definitions

**Read-only tools (no confirmation required):**

| Tool | Parameters | Returns |
|------|-----------|---------|
| `list_members` | search?, status? | Member names, roles, statuses, balances |
| `list_charges` | status?, category?, membershipId? | Charges with amounts, due dates, allocation status |
| `list_payments` | membershipId?, unallocated? | Payments with payer, amount, date, source |
| `get_balances` | (none) | Per-member: total charged, total paid, balance, overdue count |

**Write tools (require user confirmation):**

| Tool | Parameters | Action |
|------|-----------|--------|
| `add_members` | members[]{name, email?, role} | Bulk member creation with invitation |
| `create_charges` | membershipIds[], title, amountCents, category, dueDate? | Bulk charge creation |
| `create_expense` | title, amountCents, category, date, vendor?, description? | Single expense record |
| `record_payments` | payments[]{membershipId, amountCents, paidAt, source?} | Bulk payment creation |
| `allocate_payments` | chargeIds[] | Auto-allocate unallocated payments to specified charges |

### Confirmation UX

Write operations are never executed silently. The flow:

1. Agent determines it needs to execute a write tool
2. Tool call is streamed to the client with a human-readable description
3. Client renders a confirmation card: "Create charges for 5 members: Spring Dues — $150.00"
4. User clicks Confirm or Cancel
5. If confirmed, tool executes and result is fed back to the agent
6. Agent acknowledges and may continue the conversation

### CSV Context

Users can upload CSV files (payment exports from Venmo/bank statements) directly into the chat. The CSV content is injected into the system prompt, allowing the agent to:
- Parse and summarize the data
- Cross-reference with existing members
- Bulk-create payments from CSV rows
- Identify discrepancies between CSV data and existing records

### Safety Constraints

- Agent cannot assign the OWNER role
- All write operations are audit-logged with `source: "AI_AGENT"`
- Maximum 10 tool-use rounds per conversation turn (prevents infinite loops)
- Chat history persisted in `agent_sessions` for continuity
- `@MaxLength(50_000)` on message content, `@ArrayMaxSize(100)` on message history

---

## 10. Gmail Integration Pipeline

### Overview

The Gmail integration is Ledgly's most technically sophisticated feature. It connects to a user's Gmail inbox via OAuth2, monitors for payment notification emails from Venmo, Zelle, Cash App, and PayPal, parses transaction details, matches payers to organization members, and optionally auto-allocates payments to outstanding charges.

### Connection Flow

```
1. Admin clicks "Connect Gmail" in settings
2. API generates HMAC-signed state token containing orgId + membershipId
3. Redirect to Google OAuth consent screen (gmail.readonly scope)
4. User grants access → Google redirects to /gmail/callback
5. API verifies state signature, exchanges code for tokens
6. Stores access_token + refresh_token in gmail_connections
7. Checks for duplicate connections (one per org)
8. Triggers immediate sync
```

### Email Parsing Engine

The parser supports multiple email formats per payment provider:

**Venmo:**
- Incoming: `"X paid you $Y"`, `"X paid you $Y for Z"`
- Outgoing: `"You paid X $Y"`, `"You paid X $Y for Z"`
- Memo extraction: Venmo's "For:" field, quoted text

**Zelle:**
- Incoming: `"You received $X from Y"`
- Outgoing: `"You sent $X to Y"`
- Bank-specific format variations

**Cash App:**
- Incoming: `"X sent you $Y"`
- Outgoing: `"You sent X $Y"`
- Cashtag extraction

**PayPal:**
- Incoming: `"You received a payment of $X from Y"`
- Outgoing: `"You sent $X to Y"`
- Transaction ID extraction for idempotency

### Member Matching Algorithm

```
Input: parsed payer name from email
Output: (membershipId, confidence score)

1. Normalize names: lowercase, strip whitespace, remove special chars
2. Try exact email match (if parsed_payer_email available) → confidence 1.0
3. Try exact name match → confidence 0.95
4. Try first + last name match → confidence 0.9
5. Try first name only match → confidence 0.6
6. Try last name only match → confidence 0.5
7. Try fuzzy match (Levenshtein distance < threshold) → confidence 0.4-0.7
8. No match → null (import goes to PENDING for manual review)
```

### Category Derivation

Payment memos are analyzed for category keywords:

| Keywords | Derived Category |
|----------|-----------------|
| dues, membership, semester, monthly | DUES |
| event, party, formal, social | EVENT |
| fine, penalty, late | FINE |
| merch, shirt, merchandise, apparel | MERCH |
| (no match) | OTHER |

### Auto-Confirmation Logic

```
IF org.autoApprovePayments = true AND direction = 'incoming':
  IF memberMatch.confidence >= 0.9:
    IF derivedCategory AND matchingOpenCharges.length > 0:
      → AUTO_CONFIRMED (create payment + allocate to matching charges)
    ELSE:
      → AUTO_CONFIRMED (create payment, no allocation)
  ELSE IF memberMatch.confidence >= 0.7:
    → PENDING (needs_review_reason: "Low confidence member match")
  ELSE:
    → PENDING (needs_review_reason: "No member match found")

IF direction = 'outgoing':
  IF potentialExpenseMatches.length > 0:
    → PENDING (needs_review_reason: "Multiple expense matches")
  ELSE IF org.autoApproveExpenses = true:
    → AUTO_CONFIRMED (create expense)
  ELSE:
    → PENDING
```

### Sync Process

1. **Token refresh**: Check if access_token expired, refresh if needed
2. **Build query**: Construct Gmail search query from enabled payment sources
   - e.g., `from:venmo@venmo.com OR from:alerts@notify.zelle.com`
3. **List messages**: Fetch up to 200 message IDs from last 30 days
4. **Deduplicate**: Filter out messages already in `email_imports`
5. **Process concurrently**: 5 messages at a time (rate limit compliance)
6. **For each message**:
   - Fetch full message (headers + body)
   - Parse email (identify provider, extract amount/payer/memo/direction)
   - Create `email_import` record
   - Run member matching + category derivation
   - Apply auto-confirmation logic
   - Create payment/expense records if auto-confirmed
7. **Update sync timestamp**: `last_sync_at` and `last_history_id`

### Error Handling

- Token revocation detected → mark connection as inactive, notify admin
- Parse failure → create import with `PENDING` status and `needs_review_reason`
- Duplicate message → skip (idempotent via unique index on gmail_connection_id + message_id)
- Partial sync failure → `Promise.allSettled` ensures successful messages are saved even if some fail

---

## 11. Frontend Architecture

### Routing & Layout

```
app/
├── (auth)/                    # Unauthenticated routes
│   ├── login/                 # Email + password login
│   ├── register/              # Account creation
│   ├── onboarding/            # Post-registration org setup
│   ├── verify/                # Magic link verification
│   ├── reset-password/        # Password reset flow
│   └── join/                  # Join via code
│
├── (dashboard)/               # Authenticated, org-scoped
│   ├── layout.tsx             # Sidebar + header + org context
│   ├── dashboard/             # Overview with charts
│   ├── charges/               # Charge management
│   ├── payments/              # Payment management
│   ├── members/               # Member management
│   ├── expenses/              # Expense tracking
│   ├── settings/              # Org settings + Gmail
│   ├── audit/                 # Audit log viewer
│   ├── agent/                 # AI chat interface
│   ├── spreadsheet/           # Data import/export
│   └── inbox/                 # Gmail sync management
│
├── privacy/                   # Privacy policy (public)
├── terms/                     # Terms of service (public)
└── page.tsx                   # Landing page
```

### State Management Strategy

Ledgly uses a **dual-store** pattern that cleanly separates server state from client state:

**Server state (React Query):**
- All data from the API: members, charges, payments, expenses
- Cached with configurable stale times
- Background refetching on window focus
- Optimistic updates for responsive UX
- Cursor-based pagination for large lists

**Client state (Zustand):**
- UI state: modal open/close, selected filters, sidebar collapsed
- Auth state: current user, active organization, membership role
- Ephemeral state: form drafts, selection sets

This separation prevents the common pitfall of stale server data in global stores and makes cache invalidation straightforward — mutations invalidate React Query cache keys, triggering automatic refetches.

### Query Layer

All API interactions are encapsulated in custom hooks:

```typescript
// Example: apps/web/lib/queries/charges.ts
export function useCharges(orgId: string, filters: ChargeFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.charges.list(orgId, filters),
    queryFn: ({ pageParam }) => api.get('/charges', { ...filters, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useCreateCharges() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/charges', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.charges.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
    },
  });
}
```

**Query key factory** (`lib/query-keys.ts`) ensures consistent cache key generation and targeted invalidation:
```typescript
export const queryKeys = {
  charges: {
    all: (orgId) => ['charges', orgId],
    list: (orgId, filters) => ['charges', orgId, 'list', filters],
    detail: (orgId, id) => ['charges', orgId, id],
  },
  // ... members, payments, expenses, etc.
};
```

### Component Library

Built on Radix UI primitives with Tailwind styling:

| Component | Base | Usage |
|-----------|------|-------|
| Button | Radix Slot | Primary, secondary, destructive, ghost, outline variants |
| Dialog | Radix Dialog | Create/edit forms, confirmation modals |
| DropdownMenu | Radix DropdownMenu | Action menus on table rows |
| Select | Radix Select | Filter dropdowns, role selectors |
| Tooltip | Radix Tooltip | Hover context on truncated text |
| Badge | Custom | Status indicators (charge status, member role, import status) |
| Skeleton | Custom | Loading placeholders matching content layout |
| DataTable | Custom | Sortable, filterable tables with pagination |
| CommandPalette | cmdk | Global Cmd+K search/navigation |

### Dark Mode

Implemented via `next-themes` with system preference detection:
- Theme preference persisted in cookie (flash-free on load)
- All components use CSS custom properties via Tailwind's `dark:` variant
- Charts and visualizations adapt colors automatically

---

## 12. API Design & Patterns

### RESTful Resource Hierarchy

All financial resources are nested under the organization scope:

```
/api/v1/auth/...                                    # Authentication (no org scope)
/api/v1/organizations/...                           # Organization management
/api/v1/organizations/:orgId/members/...            # Members within org
/api/v1/organizations/:orgId/charges/...            # Charges within org
/api/v1/organizations/:orgId/payments/...           # Payments within org
/api/v1/organizations/:orgId/expenses/...           # Expenses within org
/api/v1/organizations/:orgId/audit/...              # Audit logs within org
/api/v1/organizations/:orgId/agent/...              # AI agent within org
/api/v1/organizations/:orgId/gmail/...              # Gmail integration within org
/api/v1/gmail/connect/:orgId                        # OAuth initiation
/api/v1/gmail/callback                              # OAuth callback (public)
```

### Pagination

Two pagination strategies are supported based on use case:

**Cursor-based** (default for lists):
```json
{
  "data": [...],
  "nextCursor": "clx_abc123",
  "hasMore": true
}
```
- Consistent results during concurrent modifications
- Efficient for "load more" / infinite scroll patterns
- Used for: charges, payments, audit logs

**Offset-based** (for fixed-page navigation):
```json
{
  "data": [...],
  "total": 247,
  "limit": 50,
  "offset": 100
}
```
- Required when users need to jump to specific pages
- Used for: member lists, expense lists

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Allocation amount exceeds remaining charge balance",
  "error": "Bad Request"
}
```

Validation errors include field-level detail:
```json
{
  "statusCode": 400,
  "message": [
    "amountCents must be a positive integer",
    "title must be shorter than or equal to 200 characters"
  ],
  "error": "Bad Request"
}
```

### Transaction Safety Patterns

**Optimistic locking with row-level locks:**
```typescript
// Payment allocation — prevents double-allocation race condition
await prisma.$transaction(async (tx) => {
  const charge = await tx.charge.findUnique({
    where: { id: chargeId },
    // Row-level lock prevents concurrent modifications
  });

  const currentAllocated = await tx.paymentAllocation.aggregate({
    where: { chargeId },
    _sum: { amountCents: true },
  });

  const remaining = charge.amountCents - (currentAllocated._sum.amountCents || 0);
  if (amount > remaining) throw new BadRequestException('Exceeds remaining balance');

  await tx.paymentAllocation.create({ data: { ... } });

  // Recalculate charge status within same transaction
  const newTotal = (currentAllocated._sum.amountCents || 0) + amount;
  const newStatus = newTotal >= charge.amountCents ? 'PAID' : 'PARTIALLY_PAID';
  await tx.charge.update({ where: { id: chargeId }, data: { status: newStatus } });
});
```

**TOCTOU prevention for duplicate checks:**
```typescript
// Payment creation — check + create in single transaction
await prisma.$transaction(async (tx) => {
  const existing = await tx.payment.findFirst({
    where: { orgId, rawPayerName: name, amountCents: amount, paidAt: { gte: dayStart, lt: dayEnd } },
  });
  if (existing && !existing.deletedAt) throw new ConflictException('Duplicate payment');
  if (existing?.deletedAt) await tx.payment.delete({ where: { id: existing.id } }); // Hard-delete soft-deleted dup

  return tx.payment.create({ data: { ... } });
});
```

### Request Validation

All endpoints use DTOs with class-validator decorators:

```typescript
class BulkCreateChargeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  membershipIds: string[];

  @IsString()
  @MaxLength(200)
  title: string;

  @IsInt()
  @Min(1)
  amountCents: number;

  @IsEnum(ChargeCategory)
  category: ChargeCategory;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
```

Global validation pipe configuration:
```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,           // Strip unknown properties
  forbidNonWhitelisted: true, // Reject requests with unknown properties
  transform: true,            // Auto-transform types
}));
```

---

## 13. Testing & Quality Assurance

### Test Infrastructure

- **Framework:** Jest with ts-jest for TypeScript support
- **NestJS Testing:** `@nestjs/testing` for dependency injection in integration tests
- **Run mode:** `--runInBand` (serial execution for database isolation)

### Test Coverage

| Category | Test File | Coverage |
|----------|----------|----------|
| **Unit Tests** | | |
| Charge logic | `charges-unit.spec.ts` | Status calculation, amount validation, void/restore |
| Payment logic | `payments-unit.spec.ts` | Duplicate detection, allocation math, FIFO ordering |
| Member logic | `members-unit.spec.ts` | Role hierarchy, name normalization, balance aggregation |
| **Integration Tests** | | |
| Charge lifecycle | `charges-lifecycle.integration.spec.ts` | Create → allocate → partially pay → fully pay → void |
| Bulk charge creation | `charges-bulk-create.integration.spec.ts` | Multi-member charging, batch audit logs |
| Member invitations | `members-invitation.integration.spec.ts` | Invite → accept → active, expired tokens, reactivation |
| Owner transfer | `members-owner.spec.ts` | Transfer ownership, hierarchy enforcement |
| Payment auto-allocation | `payments-bulk-allocate.integration.spec.ts` | Category-aware allocation, confidence gating |
| Audit batch grouping | `audit-batch-grouping.spec.ts` | Batch creation, grouping queries, source filtering |
| Audit undo/redo | `audit-undo-redo.integration.spec.ts` | Batch reversal, entity restoration |
| **Agent Tests** | | |
| Tool implementations | `agent-tools.spec.ts` | Each tool's parameter handling and database effects |
| Chat flow | `agent.integration.spec.ts` | Multi-turn conversation with tool calls |
| Edge cases | `agent-edge-cases.spec.ts` | Malformed input, tool failures, context limits |

### Testing Patterns

**Service-level unit tests** mock the Prisma client:
```typescript
const mockPrisma = {
  charge: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  paymentAllocation: { aggregate: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockPrisma)),
};
```

**Integration tests** use a real test database with transaction rollback:
```typescript
beforeEach(async () => {
  await prisma.$executeRaw`BEGIN`;
});
afterEach(async () => {
  await prisma.$executeRaw`ROLLBACK`;
});
```

---

## 14. Deployment & Infrastructure

### Production Architecture

```
GitHub (main branch)
    │
    ├──→ Vercel (auto-deploy)
    │     └── Next.js frontend
    │         ├── CDN for static assets
    │         ├── Edge SSR for dynamic pages
    │         └── Environment: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_APP_URL
    │
    └──→ Railway (auto-deploy)
          ├── API Service (Docker)
          │   ├── NestJS application
          │   ├── Prisma migrations on startup
          │   └── Environment: DATABASE_URL, JWT_SECRET, GOOGLE_*, ANTHROPIC_API_KEY, etc.
          │
          └── PostgreSQL (managed)
              ├── Automatic backups
              ├── Internal networking (postgres.railway.internal)
              └── Connection pooling
```

### Docker Build

Multi-stage Docker build optimized for pnpm monorepo:

```dockerfile
# Stage 1: Build
FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ledgly/shared build
RUN cd apps/api && npx prisma generate && npx nest build

# Stage 2: Production runtime
FROM node:20-slim AS runner
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
# ... minimal runtime files
WORKDIR /app/apps/api
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
```

### Startup Sequence

```
Container starts
  → prisma migrate deploy (applies pending migrations)
  → node dist/main
    → NestJS bootstrap
      → Helmet middleware
      → CORS configuration
      → Global validation pipe
      → Global exception filter
      → Throttler guard
      → Module initialization
        → Prisma connection
        → Gmail scheduler (if configured)
        → Agent service (validates ANTHROPIC_API_KEY)
    → Listen on PORT (default 3001)
```

### Environment Variables

| Variable | Service | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | Railway API | PostgreSQL connection string |
| `DIRECT_DATABASE_URL` | Railway API | Direct connection (bypasses pooler) for migrations |
| `JWT_SECRET` | Railway API | JWT signing key |
| `WEB_URL` | Railway API | Frontend URL for CORS and email links |
| `RESEND_API_KEY` | Railway API | Transactional email delivery |
| `GOOGLE_CLIENT_ID` | Railway API | Gmail OAuth client |
| `GOOGLE_CLIENT_SECRET` | Railway API | Gmail OAuth secret |
| `GOOGLE_REDIRECT_URI` | Railway API | Gmail OAuth callback URL |
| `ANTHROPIC_API_KEY` | Railway API | Claude AI agent |
| `NEXT_PUBLIC_API_URL` | Vercel | API base URL for frontend |
| `NEXT_PUBLIC_APP_URL` | Vercel | Frontend URL for meta tags and redirects |

---

## 15. Performance & Scalability Considerations

### Current Optimizations

| Area | Technique | Impact |
|------|-----------|--------|
| **Database queries** | Composite indexes on hot paths | O(log n) lookups for org-scoped queries |
| **Pagination** | Cursor-based for financial lists | Consistent performance regardless of offset |
| **Member balances** | Raw SQL aggregation | Single query instead of N+1 for balance calculation |
| **Gmail sync** | 5-concurrent message processing | Throughput while respecting Gmail API rate limits |
| **Frontend caching** | React Query with stale-while-revalidate | Instant UI with background freshness |
| **Bundle size** | Next.js app router code splitting | Per-page JavaScript bundles |
| **Docker** | Multi-stage builds | ~150MB production image (vs ~1GB dev) |

### Scaling Path

**Vertical (current):**
- Railway auto-scaling for API container
- Vercel edge network for frontend
- PostgreSQL managed instance sizing

**Horizontal (future):**
- Stateless API enables multiple container replicas
- JWT authentication requires no session affinity
- Database connection pooling (PgBouncer) for high concurrency
- Read replicas for dashboard/analytics queries
- Redis for rate limiting state (currently in-memory)
- Background job queue (BullMQ) for Gmail sync, email delivery

### Known Bottlenecks

1. **Gmail sync** — Currently synchronous per-org. For organizations with high email volume, sync could be offloaded to a background job queue.
2. **Allocation recalculation** — Charge status updates hold row locks. Under very high concurrency (unlikely for target org size), this could be optimized with eventual consistency.
3. **Agent sessions** — Chat history stored as JSON blob. For very long conversations, pagination of message history would reduce payload size.

---

## 16. Security Posture

### Implemented Controls

| Category | Control | Implementation |
|----------|---------|----------------|
| **Authentication** | Multi-factor auth paths | Password + magic link + OAuth |
| **Brute force** | Account lockout | 5 attempts → 15min lock, logged |
| **Token security** | Refresh rotation + reuse detection | Stolen tokens trigger full revocation |
| **Input validation** | Whitelist DTOs | class-validator + global pipe |
| **SQL injection** | Parameterized queries | Prisma ORM (no raw interpolation) |
| **XSS** | Input sanitization | HTML stripping on user-submitted text |
| **CSRF** | HMAC-signed state | OAuth flow state verification |
| **Headers** | Helmet | CSP, HSTS, X-Frame-Options, etc. |
| **Rate limiting** | Per-endpoint throttling | Auth: 5-30/min, Global: 100/min |
| **Data isolation** | Org-scoped queries | Every query includes org_id predicate |
| **Timing attacks** | Constant-time comparison | `crypto.timingSafeEqual` for tokens |
| **Secrets** | Environment variables | No hardcoded credentials in source |
| **Audit** | Immutable log | Every action recorded with actor + diff |
| **Access control** | Role-based + hierarchy | Owner > Admin > Treasurer > Member |
| **Bulk limits** | Array size constraints | `@ArrayMaxSize(500)` on all bulk endpoints |

### OWASP Top 10 Coverage

| Risk | Mitigation |
|------|-----------|
| A01: Broken Access Control | Role guards, org-scoped queries, hierarchy enforcement |
| A02: Cryptographic Failures | Bcrypt passwords, JWT signing, HTTPS only |
| A03: Injection | Prisma parameterization, validation pipes, input sanitization |
| A04: Insecure Design | Threat-modeled auth flow, transaction safety patterns |
| A05: Security Misconfiguration | Helmet headers, CORS restriction, environment validation (Zod) |
| A06: Vulnerable Components | Dependency pinning, modern framework versions |
| A07: Auth Failures | Lockout, rotation, reuse detection, timing-safe comparison |
| A08: Data Integrity Failures | Signed OAuth state, validated DTOs, audit trail |
| A09: Logging Failures | Auth events table, audit logs, structured error logging |
| A10: SSRF | No user-controlled URL fetching (Gmail API uses Google SDK) |

---

## 17. Roadmap & Future Development

### Near-term Enhancements

| Feature | Description | Complexity |
|---------|-------------|-----------|
| **Member Portal** | Public-facing page where members view their balance, charges, and payment history without admin access | Medium |
| **Notification System** | Push notifications for payment received, charge created, overdue reminders. Schema exists, needs frontend + delivery | Medium |
| **Scheduled Gmail Sync** | Automatic periodic sync (currently manual trigger + on-connect). NestJS @Scheduled infrastructure exists | Low |
| **CSV Export** | Export charges, payments, and member lists to CSV/Excel. Component scaffolded | Low |
| **Receipt Upload** | Attach receipt images to expenses. Supabase storage integration scaffolded | Medium |

### Medium-term Features

| Feature | Description | Value |
|---------|-------------|-------|
| **Payment Request Links** | Generate shareable links that deep-link to Venmo/Zelle with pre-filled amounts | High — reduces payment friction |
| **Budget Planning** | Set per-category budgets, track spending vs. budget with alerts | Medium — financial planning |
| **Multi-org Dashboard** | Unified view for users who belong to multiple organizations | Medium — power user feature |
| **Webhook Integrations** | Outbound webhooks on payment/charge events for external automation | Medium — extensibility |
| **2FA / Passkeys** | Time-based OTP or WebAuthn for enhanced security | High — security compliance |

### Long-term Vision

| Feature | Description | Impact |
|---------|-------------|--------|
| **Direct Payment Processing** | Integrate Stripe Connect for in-app payments (not just record-keeping) | Transformative — removes friction |
| **Financial Reporting** | Tax-ready reports, annual summaries, P&L statements | High — compliance and governance |
| **Mobile App** | React Native or Expo app with push notifications | High — accessibility |
| **Organization Templates** | Pre-configured charge structures for different org types (fraternity, club, HOA) | Medium — faster onboarding |
| **API Access** | Public API with OAuth for third-party integrations | Medium — platform play |

---

## Appendix: Complete API Reference

### Authentication

| Method | Endpoint | Auth | Rate Limit | Description |
|--------|----------|------|-----------|-------------|
| POST | `/auth/register` | None | 10/min | Create account with email + password |
| POST | `/auth/login` | None | 10/min | Email + password login |
| POST | `/auth/magic-link` | None | 5/min | Send magic link email |
| POST | `/auth/verify` | None | 30/min | Verify magic link token |
| POST | `/auth/refresh` | None | 30/min | Rotate refresh token |
| POST | `/auth/logout` | JWT | — | Revoke refresh token |
| POST | `/auth/forgot-password` | None | 3/hr | Send password reset email |
| POST | `/auth/reset-password` | None | 10/min | Reset password with token |
| PATCH | `/auth/password` | JWT | — | Change password |
| GET | `/auth/invite/:token` | None | — | Resolve invite token |
| GET | `/auth/me` | JWT | — | Current user + memberships |
| PATCH | `/auth/me` | JWT | — | Update profile |

### Organizations

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/organizations` | JWT | — | List user's organizations |
| POST | `/organizations` | JWT | — | Create organization |
| GET | `/organizations/:orgId` | JWT | Any | Get organization details |
| PATCH | `/organizations/:orgId` | JWT | ADMIN | Update settings |
| DELETE | `/organizations/:orgId` | JWT | OWNER | Delete organization |
| GET | `/organizations/:orgId/dashboard` | JWT | Any | Dashboard stats |
| POST | `/organizations/:orgId/join-code` | JWT | ADMIN | Generate join code |
| DELETE | `/organizations/:orgId/join-code` | JWT | ADMIN | Disable join code |
| PATCH | `/organizations/:orgId/join-code` | JWT | ADMIN | Toggle code settings |
| GET | `/organizations/resolve-code/:code` | None | — | Resolve code to org name |
| POST | `/organizations/join` | JWT | — | Join org with code |

### Members

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/organizations/:orgId/members` | JWT | Any | List members (filterable) |
| GET | `/organizations/:orgId/members/me` | JWT | Any | Current user's membership |
| GET | `/organizations/:orgId/members/:id` | JWT | Any | Member detail + financials |
| POST | `/organizations/:orgId/members` | JWT | ADMIN/TREAS | Bulk create members |
| PATCH | `/organizations/:orgId/members/:id` | JWT | ADMIN/TREAS | Update member |
| DELETE | `/organizations/:orgId/members/:id` | JWT | ADMIN | Remove member (soft) |
| POST | `/organizations/:orgId/members/:id/approve` | JWT | ADMIN | Approve pending member |
| POST | `/organizations/:orgId/members/:id/restore` | JWT | ADMIN | Reactivate left member |
| POST | `/organizations/:orgId/members/:id/resend-invitation` | JWT | ADMIN | Resend invite email |
| POST | `/organizations/:orgId/members/:id/transfer-ownership` | JWT | OWNER | Transfer ownership |
| POST | `/organizations/:orgId/members/bulk-delete` | JWT | ADMIN | Batch remove members |

### Charges

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/organizations/:orgId/charges` | JWT | Any | List charges (filterable) |
| GET | `/organizations/:orgId/charges/:id` | JWT | Any | Charge detail + allocations |
| POST | `/organizations/:orgId/charges` | JWT | ADMIN/TREAS | Create charge(s) |
| POST | `/organizations/:orgId/charges/bulk-create` | JWT | ADMIN/TREAS | Bulk create from CSV |
| PATCH | `/organizations/:orgId/charges/:id` | JWT | ADMIN/TREAS | Update charge |
| DELETE | `/organizations/:orgId/charges/:id` | JWT | ADMIN/TREAS | Void charge |
| POST | `/organizations/:orgId/charges/bulk-void` | JWT | ADMIN/TREAS | Batch void |
| POST | `/organizations/:orgId/charges/:id/restore` | JWT | ADMIN/TREAS | Restore voided charge |
| POST | `/organizations/:orgId/charges/remind` | JWT | ADMIN/TREAS | Send overdue reminders |

### Payments

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/organizations/:orgId/payments` | JWT | Any | List payments (filterable) |
| GET | `/organizations/:orgId/payments/:id` | JWT | Any | Payment detail + allocations |
| POST | `/organizations/:orgId/payments` | JWT | ADMIN/TREAS | Create payment |
| POST | `/organizations/:orgId/payments/bulk` | JWT | ADMIN/TREAS | Bulk create payments |
| PATCH | `/organizations/:orgId/payments/:id` | JWT | ADMIN/TREAS | Update payment |
| DELETE | `/organizations/:orgId/payments/:id` | JWT | ADMIN/TREAS | Soft delete payment |
| POST | `/organizations/:orgId/payments/bulk-delete` | JWT | ADMIN/TREAS | Batch soft delete |
| POST | `/organizations/:orgId/payments/:id/restore` | JWT | ADMIN/TREAS | Restore payment |
| POST | `/organizations/:orgId/payments/:id/allocate` | JWT | ADMIN/TREAS | Allocate to charges |
| DELETE | `/organizations/:orgId/payments/allocations/:id` | JWT | ADMIN/TREAS | Remove allocation |
| POST | `/organizations/:orgId/payments/allocations/bulk-remove` | JWT | ADMIN/TREAS | Batch remove allocations |
| GET | `/organizations/:orgId/payments/member/:id/unallocated` | JWT | ADMIN/TREAS | Unallocated total |
| POST | `/organizations/:orgId/payments/auto-allocate/:chargeId` | JWT | ADMIN/TREAS | Auto-allocate to charge |
| POST | `/organizations/:orgId/payments/bulk-auto-allocate` | JWT | ADMIN/TREAS | Batch auto-allocate |

### Expenses

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/organizations/:orgId/expenses` | JWT | Any | List expenses |
| GET | `/organizations/:orgId/expenses/summary` | JWT | Any | Category summary |
| GET | `/organizations/:orgId/expenses/:id` | JWT | Any | Expense detail |
| POST | `/organizations/:orgId/expenses` | JWT | ADMIN/TREAS | Create expense |
| PATCH | `/organizations/:orgId/expenses/:id` | JWT | ADMIN/TREAS | Update expense |
| DELETE | `/organizations/:orgId/expenses/:id` | JWT | ADMIN/TREAS | Soft delete expense |
| POST | `/organizations/:orgId/expenses/bulk-delete` | JWT | ADMIN/TREAS | Batch soft delete |
| POST | `/organizations/:orgId/expenses/:id/restore` | JWT | ADMIN/TREAS | Restore expense |

### Gmail Integration

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/gmail/connect/:orgId` | JWT | ADMIN | Start OAuth flow |
| GET | `/gmail/callback` | None | — | OAuth callback |
| GET | `/organizations/:orgId/gmail/status` | JWT | ADMIN/TREAS | Connection status |
| DELETE | `/organizations/:orgId/gmail/disconnect` | JWT | ADMIN | Disconnect Gmail |
| POST | `/organizations/:orgId/gmail/sync` | JWT | ADMIN/TREAS | Trigger sync |
| GET | `/organizations/:orgId/gmail/imports` | JWT | ADMIN/TREAS | List imports |
| GET | `/organizations/:orgId/gmail/imports/stats` | JWT | ADMIN/TREAS | Import statistics |
| POST | `/organizations/:orgId/gmail/imports/:id/confirm` | JWT | ADMIN/TREAS | Confirm import |
| POST | `/organizations/:orgId/gmail/imports/:id/unconfirm` | JWT | ADMIN/TREAS | Undo confirmation |
| POST | `/organizations/:orgId/gmail/imports/:id/ignore` | JWT | ADMIN/TREAS | Ignore import |
| POST | `/organizations/:orgId/gmail/imports/:id/restore` | JWT | ADMIN/TREAS | Restore ignored |
| GET | `/organizations/:orgId/gmail/imports/:id/expense-matches` | JWT | ADMIN/TREAS | Find matching expenses |
| POST | `/organizations/:orgId/gmail/imports/:id/confirm-expense` | JWT | ADMIN/TREAS | Confirm as expense |

### Audit

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/organizations/:orgId/audit` | JWT | ADMIN | List audit logs (filterable, paginated) |

### AI Agent

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/organizations/:orgId/agent/chat` | JWT | ADMIN/TREAS | Stream chat response (SSE) |
| POST | `/organizations/:orgId/agent/confirm` | JWT | ADMIN/TREAS | Confirm tool execution |
| GET | `/organizations/:orgId/agent/sessions` | JWT | ADMIN/TREAS | List chat sessions |
| GET | `/organizations/:orgId/agent/sessions/:id` | JWT | ADMIN/TREAS | Get session messages |
| PATCH | `/organizations/:orgId/agent/sessions/:id` | JWT | ADMIN/TREAS | Update session title |
| DELETE | `/organizations/:orgId/agent/sessions/:id` | JWT | ADMIN/TREAS | Delete session |

---

*This report was generated from the Ledgly codebase as of March 2026. For the latest information, refer to the source repository.*
