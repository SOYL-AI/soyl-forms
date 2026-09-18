# Future AI Scope

AI is deliberately not required for V1. The current architecture must make it easy to add without coupling form rendering to an LLM.

## 1. Text-to-form

User prompt:
> Create an event registration form for a college MUN. Ask for name, email, college, committee preference, experience and dietary restrictions.

AI output should be a validated `FormSchemaV1` JSON object, not executable code.

Pipeline:
```text
natural language
 -> structured generation
 -> schema validation
 -> safety/length normalization
 -> preview draft
 -> user approves/edits
```

Never publish automatically from AI output.

## 2. Voice-to-form

User records/narrates requirements.

Pipeline:
```text
voice
 -> speech-to-text
 -> form generation prompt
 -> structured schema JSON
 -> validator
 -> builder draft
```

Store transcript only as needed and communicate retention.

## 3. AI rewriting

Per question:
- simplify wording
- make friendly/formal
- suggest answer options
- identify ambiguity

## 4. AI response summaries

For creator:
- summarize open text answers
- cluster themes
- highlight common objections

Must be opt-in and usage-metered because this becomes an actual marginal cost.

## 5. Adaptive forms — later

Future differentiator:
- AI can choose next question based on a constrained objective and prior answers

Do not let an LLM invent arbitrary UI/actions. It should choose from validated allowed blocks/actions or generate schema through strict structured output.

## 6. Cost model

AI must have separate entitlements/credits rather than being silently unlimited in ₹199 plans.

Possible future model:
- Free: small trial credits
- Starter: limited generations/month
- Pro: larger pool
- extra AI credits purchasable

## 7. Architecture readiness

Keep:
- versioned schema
- stable block IDs
- centralized schema validators
- pure rendering from schema

This makes AI simply another way to produce/edit the same schema rather than a separate product path.
