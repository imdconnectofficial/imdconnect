# AGENTS.md — Engineering Rules & Constraints for ImdConnect

This document defines the strict, non-negotiable architectural, security, and development rules for the **ImdConnect** project. All human developers and AI coding agents operating on this codebase MUST adhere strictly to every rule in this specification.

---

## 1. Core Platform Scope & Chat Media Constraints

- **Rule 1 (Text-Only Messaging Platform):**  
  ImdConnect is strictly a **text-only messaging platform**. The core chat experience focuses exclusively on fast, secure, encrypted text communication.
- **Rule 2 (Zero In-Chat Media Attachments):**  
  **NEVER** add image, video, audio, document, file, or voice-message attachments to chat conversations. No file picker or attachment upload button shall ever be introduced into the chat input or message schema.
- **Rule 3 (Restricted Identity Media Only):**  
  Profile pictures, cover/banner images, and group profile avatars are allowed **ONLY** as profile and group identity media. Supabase Storage buckets are strictly scoped to identity avatars/banners (`avatars`, `group_covers`), with tight file size and MIME-type restrictions.

---

## 2. Technology Stack & Backend Constraints

- **Rule 4 (No PHP):**  
  **NEVER** use PHP under any circumstances. No `.php` files, no PHP runtimes, and no PHP scripts.
- **Rule 5 (No MySQL):**  
  **NEVER** use MySQL or MariaDB.
- **Rule 6 (Supabase as Sole Backend):**  
  Use **Supabase** for all backend services (PostgreSQL, Supabase Auth, Supabase Realtime, Supabase Storage, and Supabase Cron). No secondary backend runtime (e.g., standalone Node.js, Express, Python) is permitted in production.
- **Rule 7 (PostgreSQL Engine):**  
  Use **PostgreSQL 15+** exclusively. Take full advantage of native Postgres capabilities (extensions, UUIDs, check constraints, foreign keys, triggers, and stored procedures/RPCs).
- **Rule 8 (Supabase Auth):**  
  Use **Supabase Auth** for identity and session management. Implement username-based authentication using the deterministic synthetic alias pattern (`<username>@auth.imdconnect.local`) so that users are never forced to supply personal email addresses or phone numbers.

---

## 3. Database Security & Key Management

- **Rule 9 (Mandatory Row-Level Security):**  
  Enable **Row-Level Security (RLS)** on **ALL** user-accessible database tables without exception. Default to denying all access (`RESTRICTIVE`), and explicitly define granular `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies for authenticated users.
- **Rule 10 (Zero Service-Role Key Exposure):**  
  **NEVER** expose the Supabase `service_role` secret key in frontend code, static files, client bundles, or publicly accessible assets.
- **Rule 11 (Zero Secrets in Source Control):**  
  **NEVER** commit secrets, private tokens, service-role keys, or sensitive credentials to GitHub. Always use `.env.local` (ignored by `.gitignore`) and Cloudflare Pages environment variables.
- **Rule 12 (Publishable/Anon Key Boundary):**  
  Use only the Supabase publishable/anonymous client key (`SUPABASE_ANON_KEY`) in client code, and ensure it operates strictly under the confines of Row-Level Security.
- **Rule 13 (Database-Side Security Validation):**  
  Always validate authorization, business logic, constraints, and data integrity on the **server/database side** (via RLS, check constraints, foreign keys, and PostgreSQL triggers/RPCs). Client-side JavaScript validation is for user experience only and MUST NEVER be relied upon as a security boundary.

---

## 4. Frontend Standards, Accessibility & UI Design

- **Rule 14 (Semantic HTML & Accessible UI):**  
  Write clean, semantic HTML5 (`<main>`, `<nav>`, `<header>`, `<article>`, `<section>`, `<button>`, `<input>`). Ensure high contrast ratios, proper ARIA labels, focus states, keyboard navigability, and screen-reader accessibility across all UI components.
- **Rule 15 (Mandatory Mobile-First Design):**  
  Every page and component must be designed and styled **mobile-first** using responsive CSS layouts (Flexbox, CSS Grid, clamp functions). Touch targets must be at least 44x44px. Interfaces must scale seamlessly from small mobile viewports (320px) up to ultra-wide desktop monitors.
- **Rule 16 (Theme Support: Light, Dark & System):**  
  Support **Light**, **Dark**, and **System** (automatic based on `prefers-color-scheme`) themes. Manage theme tokens cleanly using CSS Custom Properties (`:root`, `[data-theme="light"]`, `[data-theme="dark"]`).
- **Rule 17 (No Fake Backend Functionality in Production):**  
  Do not use simulated, mock, or fake backend delays/placeholders in production code. All authentication, messaging, and data operations must execute against real Supabase APIs.
- **Rule 18 (No Mock Data Once Connected):**  
  Do not retain hardcoded mock data, stub arrays, or fake test conversations once a feature is connected to Supabase.
- **Rule 19 (Mandatory 4-State UI):**  
  Every major feature, view, and data-bound component must implement all four fundamental UI states:
  1. **Loading State:** Clean skeleton loaders or spinners.
  2. **Empty State:** Informative, friendly messages explaining that no data exists and what action to take next.
  3. **Error State:** Clear, actionable error messaging with retry capabilities.
  4. **Success / Content State:** The fully rendered, responsive view.

---

## 5. Security Realism & Privacy Claims

- **Rule 20 (Honest Security Claims — No False Guarantees):**  
  **NEVER** claim or advertise that browser screenshot detection or blocking is 100% reliable. The web sandbox cannot prevent operating system-level screenshots, hardware capture devices, or external cameras. Always be transparent with users regarding browser sandbox capabilities.

---

## 6. Architecture, Quality & Deployment Gates

- **Rule 21 (Modular Architecture):**  
  Keep the architecture strictly modular. Organize code into distinct domains: core utilities, state management, API services, UI components, and views using native Vanilla JavaScript ES Modules (`import`/`export`).
- **Rule 22 (Simplicity & Maintainability Over Complexity):**  
  Prefer secure, simple, transparent, and maintainable code over unnecessary abstractions, bloated design patterns, or heavy external libraries. Do not add libraries unless standard browser APIs cannot fulfill the requirement.
- **Rule 23 (Mandatory Pre-Completion Testing):**  
  Thoroughly test every feature across auth, data flow, responsive layout, and edge cases before declaring the task or feature complete.
- **Rule 24 (Deployment Security Gate):**  
  **DO NOT deploy** to production or Cloudflare Pages until all security checks pass:
  - RLS policies verified on all tables.
  - Zero secrets in client-facing code.
  - Strict Content Security Policy (CSP) and security headers configured.
  - All input sanitized against XSS attacks.

---

## Enforcement Checklist for Agents

Before completing any task or code change on ImdConnect, check each item:
- [ ] Is messaging strictly text-only? (No chat attachments)
- [ ] Are media uploads restricted solely to profile/group identity avatars?
- [ ] Are all database operations secured by PostgreSQL RLS?
- [ ] Is the frontend built with pure HTML5, CSS3, and Vanilla JS ES Modules?
- [ ] Does the UI support Light, Dark, and System themes?
- [ ] Is the UI mobile-first with Loading, Empty, Error, and Success states?
- [ ] Are Supabase service-role keys completely absent from client code?
- [ ] Are all tests passing with zero mock data in connected features?
