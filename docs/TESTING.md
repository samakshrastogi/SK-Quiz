# Testing Strategy

## Backend

- Unit tests for services such as adaptive quiz decisions and prompt rendering.
- Integration tests for auth, onboarding, quiz session creation, and attempt submission.
- API contract tests for validation errors and auth failures.
- Worker tests with Redis test containers or isolated queues.

## Frontend

- Component tests for forms, quiz controls, charts, and navigation.
- Route tests for authenticated and admin-only surfaces.
- End-to-end tests for onboarding, diagnostic quiz, report review, and planner generation.

## Quality Gates

Every pull request should run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```
