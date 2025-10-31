# Backend Engineer

## Objective
**Microservices-Based Subscription Billing System**

Design and implement a microservices subscription billing system using **2 decoupled services**.

---

## Services

### 1. User & Subscription Management Service
Responsible for:
- Managing **Users**, **Plans**, and **Subscriptions**
- Handling subscription actions:
  - Subscribe to a plan
  - Upgrade/Downgrade
  - Cancel subscription
- Accepting webhook events from the payment service to update subscription status
- Exposing a well-documented **REST** or **GraphQL API**

---

### 2. Simulated Payment Gateway Service
Responsible for:
- Receiving “initiate payment” requests
- Simulating **payment success/failure**
- Sending **webhook callbacks** to the Subscription Service

---

## Technical Requirements
Follow **microservice principles**:
- Separate **Docker services**
- **Stateless HTTP** communication
- **Webhook-based** event handling

Include:
- API authentication
- Input validation and structured error handling
- Unit tests for key business logic
- Dockerized setup using `docker-compose`
- Seed data for users, plans, and subscriptions
- Async request handling (e.g., **FastAPI**, **aiohttp**, or **NestJS**)

### Choose your stack

1. Web Framework: NestJS
2. ORM: Prisma 
3. Database: PostgreSQL
4. Testing: Jest, supertest

---

## Submission Requirements
Please submit the following:
- A **GitHub repository** link
- A `docker-compose.yml` file that spins up both services along with PostgreSQL
- A **README.md** containing:
  - Setup instructions (how to run locally using Docker)
  - API flow walkthrough (user → payment → webhook → subscription flow)
  - Sample payloads for key endpoints
  - Deployment notes (how you'd run this in staging/production)
  - Time spent and any assumptions or trade-offs made

---

## Evaluation Criteria

### 1. Docker Compose Setup
- `docker-compose up` must bring up both services and PostgreSQL without manual intervention

### 2. Swagger / OpenAPI Flow
- Each service must expose **Swagger UI** (FastAPI or NestJS)
- Swagger should reflect and support the full end-to-end API flow described in the README

### 3. REST API Design
- Clean, resource-oriented endpoints
- Proper use of HTTP verbs and status codes
- Consistent and descriptive error handling

### 4. Database Design
- Normalized schema with foreign key relationships
- Migrations or SQL schema included
- Indexes and constraints where appropriate

### 5. Code Quality & Testing
- Modular, maintainable code structure
- Unit tests for key logic
- Appropriate separation of concerns

### 6. Documentation
- Clear setup instructions
- Accurate and complete API flow
- Sample requests/responses included

---

## Timeline & Notes
- **Submission deadline:** Within 1 week (extensions allowed with prior communication)
- You may use external resources (e.g., ChatGPT, GitHub Copilot) for ideation or scaffolding
- Deliver working, clean, and well-documented code

---

