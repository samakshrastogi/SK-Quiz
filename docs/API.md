# API Documentation

Base URL: `/api`

All successful responses use:

```json
{
  "data": {},
  "requestId": "..."
}
```

Errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {}
  },
  "requestId": "..."
}
```

## Health

`GET /health`

Returns API status.

## Auth

`POST /auth/register`

```json
{
  "email": "student@example.com",
  "password": "long-secure-password",
  "name": "Student Name"
}
```

`POST /auth/login`

```json
{
  "email": "student@example.com",
  "password": "long-secure-password",
  "rememberMe": true
}
```

## Onboarding

`POST /onboarding`

Requires `Authorization: Bearer <accessToken>`.

Triggers provider-backed exam discovery when the exam is not already stored.

## Quizzes

`POST /quizzes`

Starts a quiz session from the question bank.

`POST /quizzes/:quizSessionId/attempts`

Stores answer, correctness, timing, confidence, bookmark state, and revision scheduling for wrong answers.
