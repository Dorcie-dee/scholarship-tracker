# Claude Terminal Prompt — Initial Scholarship OS Foundation Build

You are helping me build a personal-use software product called **Scholarship OS**.

This is the first implementation phase.

Your job in this phase is **NOT to build the entire product**. Your job is to establish a clean, extensible technical foundation based on the product architecture described below.

The project will initially be used personally by the owner to manage international scholarship and university applications. It may eventually become a public SaaS product, so the architecture should be designed with future extensibility in mind without prematurely over-engineering the system.

---

# 1. PRODUCT VISION

The product is an intelligent scholarship and application management system.

It is NOT simply:

- a scholarship search website
- a scholarship database
- a document storage application
- a task manager
- an AI writing tool

Instead, it connects all of these concepts around the applicant's actual application journey.

The core philosophy is:

> **Assist, Don't Control.**

The system should help the applicant:

- discover opportunities
- capture scholarship information
- structure requirements
- understand eligibility
- connect universities and programmes
- organise documents
- track applications
- manage deadlines
- manage tasks
- understand dependencies
- prepare application materials
- preserve historical application records
- receive recommendations

However:

> **The user always has the final decision.**

The system must never technically prevent the user from continuing because an AI model thinks something should happen first.

---

# 2. IMPORTANT PRODUCT CONCEPT

We have decided that an academic objective should be represented as an:

## Application Journey

An Application Journey represents the user's larger goal.

Example:

```text
University of Twente
└── MSc Computer Science
    │
    └── Application Journey
        │
        ├── University Admission Application
        │
        ├── University Twente Scholarship Application
        │
        ├── External Scholarship Application
        │
        └── Other Funding Application
```

Therefore:

### Goal

Where the user wants to end up.

Example:

> MSc Computer Science at University of Twente

### Application Journey

The collection of connected application processes required to achieve that goal.

### Individual Application

One specific application process.

Examples:

- University admission application
- Scholarship application
- External funding application

### Requirement

Something that must or should be satisfied.

Example:

> Bachelor's degree in a relevant field.

### Document

Evidence or application material that may satisfy a requirement.

Example:

> Bachelor's transcript.

### Task

An action the user needs to perform.

Example:

> Request recommendation letter.

This distinction is extremely important.

---

# 3. TECHNOLOGY STACK

Use the following technologies.

## Backend

- NestJS
- TypeScript
- TypeORM
- PostgreSQL
- Cloudinary
- REST API
- Yarn

## Frontend

- Next.js
- TypeScript
- React
- Ant Design
- Tailwind CSS
- TanStack Query

## Package manager

Use:

```bash
yarn
```

Do not switch to npm or pnpm.

---

# 4. FRONTEND ARCHITECTURE

Use:

```text
Next.js + TypeScript
```

Use the modern Next.js App Router.

Use:

```text
Ant Design
```

as the primary UI component system.

Ant Design should provide components such as:

- Layout
- Menu
- Sidebar
- Cards
- Tables
- Forms
- Modals
- Drawers
- Tabs
- Steps
- Tags
- Alerts
- Progress indicators
- Date pickers
- Dropdowns
- Notifications
- Empty states

Use Tailwind CSS where it improves:

- page layout
- spacing
- responsive behaviour
- custom utility styling
- small visual adjustments

Do NOT duplicate an entire component system unnecessarily.

The principle should be:

> Ant Design provides the reusable application components; Tailwind provides utility-level styling and layout support.

---

# 5. SERVER-STATE MANAGEMENT

Use:

```text
TanStack Query
```

for communication with the NestJS API and server-state management.

Do not build a large Redux architecture unless a real requirement emerges later.

Keep client state and server state conceptually separate.

---

# 6. BACKEND ARCHITECTURE

The backend must be a standalone NestJS application.

The frontend communicates with the backend through REST APIs.

Do NOT create a second backend inside Next.js.

Do NOT duplicate business logic between Next.js and NestJS.

The intended architecture is:

```text
Browser
   │
   ▼
Next.js Frontend
   │
   │ REST API
   ▼
NestJS Backend
   │
   ├── TypeORM
   │
   ▼
PostgreSQL

NestJS
   │
   └── Cloudinary
```

---

# 7. MONOREPO

Create a clean monorepo.

Use a structure similar to:

```text
scholarship-os/
│
├── apps/
│   ├── web/
│   │   └── Next.js application
│   │
│   └── api/
│       └── NestJS application
│
├── packages/
│   ├── types/
│   ├── config/
│   └── eslint-config/
│
├── docs/
│
├── .env.example
├── package.json
├── yarn.lock
└── README.md
```

You may adjust the exact structure if there is a strong technical reason.

Do not introduce unnecessary packages or infrastructure.

We are intentionally starting as a modular monolith rather than microservices.

---

# 8. DATABASE

Use PostgreSQL.

Use TypeORM.

Create proper TypeORM entities and migrations.

Do NOT rely on:

```text
synchronize: true
```

for the actual application architecture.

Use migrations.

Development convenience is acceptable temporarily, but the project must ultimately use migration-based schema management.

---

# 9. INITIAL DOMAIN MODEL

Create the initial domain model based on the following concepts.

Do not try to implement every future feature yet.

The first entities should cover the foundation.

Potential initial entities include:

```text
User
ApplicantProfile
University
Programme
Opportunity
OpportunitySource
Requirement
Deadline / Milestone
ApplicationJourney
Application
Task
Document
ApplicationDocument
ApplicationSnapshot
```

You may introduce supporting entities where necessary.

However:

> Do not create dozens of speculative tables simply because they might be useful someday.

Use the architecture to establish the important relationships first.

---

# 10. CORE RELATIONSHIPS

The intended conceptual relationships are approximately:

```text
User
 │
 └── ApplicantProfile
```

```text
University
 │
 └── Programme
```

```text
Opportunity
 ├── OpportunitySource
 ├── Requirement
 ├── Deadline/Milestone
 └── University/Programme relationships
```

```text
University
      │
   Programme
      │
      ▼
ApplicationJourney
      │
      ├── Application
      ├── Application
      └── Application
```

Each Application belongs to an Application Journey.

Each Application can have:

```text
Requirements
Tasks
Deadlines/Milestones
Documents
Application Snapshot
```

---

# 11. APPLICATION JOURNEY

The ApplicationJourney entity is one of the most important entities.

It represents the larger objective.

Example:

```text
University of Twente
MSc Computer Science
```

Application Journey:

```text
MSc Computer Science — University of Twente
```

Connected applications:

```text
University Admission
University Twente Scholarship
External Scholarship
Other Funding
```

The journey should have a lifecycle/status.

Do not hard-code a single rigid workflow.

The design should allow future customisation.

---

# 12. APPLICATION

An Application represents one concrete application process.

Examples:

```text
University Admission Application
University Twente Scholarship Application
External Scholarship Application
```

It should be able to track:

- status
- start date
- submission date
- portal
- external application URL
- requirements
- tasks
- milestones
- documents
- snapshot
- notes
- history where appropriate

---

# 13. OPPORTUNITY

Opportunity represents a scholarship, grant, fellowship, funding opportunity or similar opportunity.

It should be able to store structured information such as:

- title
- provider
- opportunity type
- country/region
- funding type
- funding amount
- currency
- duration
- study level
- field/discipline
- eligibility information
- application method
- application URL
- related university
- related programme
- requirements
- deadlines

Do not attempt to capture every possible field from every scholarship website.

We will eventually support an:

```text
Other
```

category or flexible metadata mechanism for information that does not fit predefined fields.

---

# 14. OPPORTUNITY SOURCES

A scholarship can originate from:

- official university website
- scholarship provider
- newsletter
- secondary scholarship website
- uploaded document
- forwarded email
- manual entry

Create an OpportunitySource concept.

It should eventually support information such as:

- source URL
- source type
- source name
- capture date
- publication date if available
- relevant extracted source content
- authority level

The system must eventually preserve a **relevant historical source snapshot**.

Important:

> We do NOT want to archive the entire external website.

We want to preserve the relevant information used when creating or updating the opportunity record.

---

# 15. REQUIREMENTS

Requirements must be first-class records.

Examples:

```text
Nationality requirement
Academic requirement
GPA requirement
Degree requirement
Language requirement
Work experience requirement
Document requirement
Recommendation requirement
Interview requirement
Application portal requirement
```

Requirements should eventually support states such as:

```text
Confirmed
Profile Match
AI Assessment
Needs Verification
Not Met
Unknown
Not Applicable
Conditional
```

For this initial build, establish the structure without implementing AI evaluation.

---

# 16. DEADLINES AND MILESTONES

Do NOT assume an opportunity has only one deadline.

An opportunity/application may have:

```text
Opening Date
University Deadline
Scholarship Deadline
Recommendation Deadline
Interview
Expected Decision
Programme Start
Other Milestones
```

Create a flexible Deadline/Milestone concept.

Each milestone should be capable of being associated with:

- opportunity
- application
- task
- requirement
- status
- source
- notes

Do not overcomplicate this in V1.

---

# 17. TASKS

Tasks represent actions.

Examples:

```text
Update CV
Request transcript
Request recommendation
Write motivation letter
Upload passport
Submit application
Verify deadline
Check admission requirement
```

Tasks should eventually support:

- title
- description
- status
- priority
- due date
- completion date
- application
- journey
- requirement
- dependency relationships

---

# 18. HARD AND SOFT DEPENDENCIES

We have explicitly decided that dependencies should NEVER technically block the user.

There are two types.

## Hard Dependency

Example:

```text
Admission application
        ↓
Scholarship application
```

The system may say:

> "Scholarship application normally depends on admission."

But it must NOT prevent the user from continuing.

## Soft Dependency

Example:

```text
Finish CV
   ↓
Draft motivation letter
```

The system may recommend this order.

Again:

> The user can ignore the recommendation.

Therefore:

```text
Dependency = information + recommendation
NOT
Dependency = technical restriction
```

Preserve this principle throughout the architecture.

---

# 19. DOCUMENTS

Create the foundation for an intelligent document library.

Documents may include:

- CV
- SOP
- Motivation Letter
- Transcript
- Certificate
- Recommendation Letter
- Passport
- Research Proposal
- Writing sample
- Other supporting files

Users must eventually be able to upload documents created elsewhere.

Cloudinary should be integrated for file storage where appropriate.

Do not build full AI document intelligence yet.

For now establish:

- document metadata
- upload
- storage reference
- document type
- version
- user ownership
- relationships to applications
- relationships to requirements

---

# 20. DOCUMENT VERSIONING

The architecture must support:

```text
CV v1
CV v2
CV v3
CV v4
```

An old application must continue referencing the exact document version that was used.

Updating the user's current CV must NOT modify historical applications.

This is extremely important.

---

# 21. APPLICATION SNAPSHOT

An ApplicationSnapshot preserves what was true/used for a particular application.

It should eventually preserve things such as:

- relevant profile information
- documents submitted
- exact written responses
- application status
- important application facts
- submission information

Do not make historical application records automatically change when the user's master profile changes.

Example:

```text
Master Profile
   ↓
Current information

Application Snapshot
   ↓
What was used at the time
```

---

# 22. MASTER PROFILE

Create the foundation for a reusable ApplicantProfile.

It may eventually contain:

```text
Education
Experience
Skills
Certifications
Languages
Other reusable information
```

Do not duplicate every applicant fact inside every application.

Instead:

```text
Master Profile
      ↓
Reusable information

Application Snapshot
      ↓
Historical state
```

---

# 23. AUTHENTICATION FOUNDATIONS

Establish authentication foundations.

Use a secure, standard approach appropriate for NestJS + Next.js.

The initial implementation should support:

- user registration
- login
- logout
- authenticated API requests
- password hashing
- protected backend routes
- basic authenticated frontend state

Do not build social login yet unless required for the foundation.

Do not build complex role/permission systems yet.

However, structure the authentication system so roles/permissions can be added later.

---

# 24. CLOUDINARY

Configure Cloudinary properly through environment variables.

Create a clean abstraction/service in NestJS for file uploads.

Do not spread Cloudinary-specific logic throughout controllers.

The architecture should allow us to replace or expand the storage layer later if necessary.

Never commit credentials.

---

# 25. ENVIRONMENT CONFIGURATION

Create:

```text
.env.example
```

and clearly document required variables.

Expected categories include:

```text
DATABASE_URL
DATABASE_HOST
DATABASE_PORT
DATABASE_NAME
DATABASE_USER
DATABASE_PASSWORD

CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET

AUTH/JWT configuration
```

Use appropriate NestJS configuration management.

Never hard-code secrets.

Never commit real credentials.

---

# 26. REST API

Create the initial REST API structure.

Use clear resource-oriented routes.

For example:

```text
/api/auth

/api/users

/api/profile

/api/universities

/api/programmes

/api/opportunities

/api/opportunity-sources

/api/requirements

/api/journeys

/api/applications

/api/tasks

/api/documents
```

Do not implement every CRUD endpoint if it is unnecessary for the initial test.

However, establish the modules/controllers/services structure cleanly.

Use DTOs and validation.

---

# 27. FRONTEND PAGES

Create a very basic authenticated dashboard.

It should not be visually perfect yet.

Create a foundation for pages such as:

```text
/dashboard

/opportunities

/universities

/journeys

/applications

/tasks

/documents

/profile
```

Use Ant Design components.

The dashboard should show useful summary cards such as:

```text
Active Application Journeys
Active Applications
Upcoming Deadlines
Pending Tasks
Opportunities to Review
```

The UI should make the Application Journey concept visible.

---

# 28. SAMPLE DATA

Seed the database with a realistic example based on:

```text
University:
University of Twente

Programme:
MSc Computer Science
```

Create an example Application Journey:

```text
MSc Computer Science — University of Twente
```

Add example connected applications such as:

```text
University Admission Application
University Twente Scholarship Application
Other Funding Application
```

Add realistic example:

- requirements
- milestones
- tasks
- documents
- statuses
- relationships

Clearly mark seed/demo information where necessary.

Do not pretend that seeded scholarship requirements are verified current facts unless they have been explicitly verified.

The purpose of this seed is to test the architecture.

---

# 29. WHAT WE ARE NOT BUILDING YET

This is extremely important.

DO NOT implement the following yet:

## No AI

Do not implement:

- LLM integration
- OpenAI
- Claude API
- AI extraction
- AI eligibility assessment
- AI writing
- Writing Voice Profile
- AI document analysis
- AI recommendations

We will add the AI architecture after the core domain model has been tested.

---

## No Gmail Integration

Do NOT implement Gmail integration yet.

---

## No Outlook Integration

Do NOT implement Outlook integration yet.

---

## No Automatic Newsletter Processing

Do not build automatic email processing yet.

---

## No Agentic System

Do not build autonomous agents yet.

We have intentionally defined future agent levels:

```text
D1 Observe
D2 Analyse
D3 Recommend
D4 Authorised Execution
D5 Autonomous Consequential Execution
```

D5 is explicitly excluded from the product.

Do not implement agentic execution in this phase.

---

# 30. NO MICROSERVICES

Do NOT create:

```text
AI microservice
Email microservice
Document microservice
Notification microservice
Workflow microservice
```

at this stage.

Use a:

> **Modular monolith**

with NestJS modules.

Example:

```text
apps/api
│
├── auth
├── users
├── profile
├── universities
├── programmes
├── opportunities
├── requirements
├── journeys
├── applications
├── tasks
├── documents
└── common
```

We can extract services later if real scaling requirements justify it.

---

# 31. ARCHITECTURAL DOCUMENTATION

Create documentation explaining the architecture.

At minimum:

```text
docs/
├── architecture.md
├── domain-model.md
├── database.md
├── api.md
├── decisions.md
└── development.md
```

Document:

- why Next.js was selected
- why NestJS is the backend
- why PostgreSQL was selected
- why TypeORM was selected
- why we use a monorepo
- why we use a modular monolith
- why Application Journey exists
- why Application is separate from Application Journey
- why Master Profile and Application Snapshot are separate
- why dependencies never block users
- why AI is intentionally postponed
- why Gmail/Outlook integration is postponed

Use clear language.

The documentation is part of the deliverable.

---

# 32. ARCHITECTURAL RULES

Follow these rules throughout implementation.

### Rule 1

The user is always the final decision-maker.

### Rule 2

AI recommendations must never become silent facts.

### Rule 3

Historical application records must remain stable.

### Rule 4

The Master Profile must not overwrite historical Application Snapshots.

### Rule 5

Dependencies must never technically block the user.

### Rule 6

Avoid unnecessary duplication of data.

### Rule 7

Avoid premature abstraction.

### Rule 8

Avoid microservices.

### Rule 9

Do not build AI before the domain model is proven.

### Rule 10

Do not build Gmail/Outlook integration before the Opportunity model and Opportunity Inbox architecture are proven.

### Rule 11

Do not store secrets in source code.

### Rule 12

Use migrations rather than relying on automatic schema synchronisation.

### Rule 13

Prefer clear, maintainable code over clever code.

### Rule 14

Do not add a library unless there is a clear reason for it.

### Rule 15

Document significant architectural decisions.

---

# 33. CODE QUALITY

Use:

- TypeScript strictness where practical
- DTO validation
- clean module boundaries
- meaningful naming
- consistent error handling
- reusable services where appropriate
- environment-based configuration
- clear API responses
- database constraints where appropriate
- indexes where justified
- migration files
- linting
- formatting

Avoid:

- `any` unless genuinely necessary
- giant controllers
- giant services
- duplicated business logic
- magic strings
- hard-coded credentials
- unnecessary abstraction layers

---

# 34. FIRST DEVELOPMENT OBJECTIVE

The first objective is NOT:

> "Finish Scholarship OS."

The first objective is:

> **Prove that the domain model works.**

After implementation, I should be able to:

1. Start PostgreSQL.
2. Start the NestJS API.
3. Start the Next.js frontend.
4. Register/login.
5. Open the dashboard.
6. View the seeded University of Twente programme.
7. View its Application Journey.
8. See the connected applications.
9. See requirements.
10. See tasks.
11. See milestones/deadlines.
12. See associated documents.
13. Understand the relationships.

---

# 35. DEVELOPMENT PROCESS

Before writing large amounts of code:

1. Inspect the current directory.
2. Check whether a project already exists.
3. Do not overwrite unrelated files.
4. Create the proposed project structure.
5. Explain any major deviation from the architecture.
6. Implement incrementally.
7. Run tests/build/type checks.
8. Fix errors.
9. Verify database migrations.
10. Verify seed data.
11. Verify API endpoints.
12. Verify frontend can communicate with backend.

Do not simply generate files and assume they work.

Actually run the relevant commands.

---

# 36. BEFORE FINALISING

At the end, provide me with:

## A. Project tree

Show the important directory structure.

## B. Architecture summary

Explain how:

```text
Next.js
     ↓
NestJS
     ↓
TypeORM
     ↓
PostgreSQL
```

works.

## C. Domain model

Explain the main entities and relationships.

## D. Database

List the created tables and important relationships.

## E. API

List the implemented endpoints.

## F. Frontend

List the created pages/components.

## G. Seed data

Explain exactly what was seeded.

## H. Commands

Tell me exactly how to:

```bash
install
run development
run migrations
seed database
run tests
build
```

## I. Environment variables

Explain every required `.env` variable.

## J. Architectural decisions

Summarise the most important decisions made.

## K. Known limitations

Explicitly state what has NOT been implemented.

---

# 37. MOST IMPORTANT INSTRUCTION

Do not interpret this prompt as permission to build every future feature.

This is the **foundation phase**.

We will inspect the implementation, run it, test it with real scholarship/application scenarios, identify weaknesses in the domain model, and then continue designing the next phase.

When there is ambiguity, prefer:

> **simple, extensible, explicit architecture**

over:

> **complex, speculative architecture.**

Before making a major architectural decision that contradicts the architecture described here, explain the decision and its trade-offs.

Start by inspecting the environment and then proceed with the implementation.