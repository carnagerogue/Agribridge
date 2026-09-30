# Farm assistant

The authenticated `/api/assistant` endpoint uses the OpenAI Responses API with `gpt-6-luna`, reasoning effort `none`, at most 600 output tokens, no tools, no model fallback and no automatic retries. It makes no claim to be a free service. The model choice and structured-output format were checked against [official OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) and [structured-output guidance](https://developers.openai.com/api/docs/guides/structured-outputs).

As checked on 28 September 2026, official model pricing lists USD 0.10 per million input tokens and USD 0.50 per million output tokens. For illustration, 2,000 input tokens and 600 output tokens cost about USD 0.0005 at those rates, excluding any taxes or other services. Actual input varies and prices may change. An initial root integration check returned HTTP 429 for insufficient credits. After the user added credit, a second tiny direct Responses API request succeeded with `gpt-6-luna`, reporting 11 input and 6 output tokens. The authenticated browser assistant was then tested with a maize-recordkeeping question: it returned a grounded answer qualified as using draft guidance, with MAAIF and Open-Meteo reference links. Provider access and this complete app journey are verified; mocked contract and safety tests also pass. These checks do not establish agronomic accuracy across crops, languages or scenarios. This implementation agent made no paid calls.

## Configuration and budget

Set `OPENAI_API_KEY` in the server environment or a secret manager, never a browser variable. `AI_DAILY_REQUEST_LIMIT` defaults to 200 and cannot exceed 5,000; `AI_USER_DAILY_REQUEST_LIMIT` defaults to 10 and cannot exceed 50. A value of zero disables paid calls. Invalid or over-ceiling values fail closed to zero. The host reserves both global and authenticated-user daily counters in a database transaction before each provider call. Counters reset by UTC date. Failed calls retain their reservation because timeouts can still incur provider usage. These are request ceilings, not guaranteed monetary caps; configure provider project spending controls as well.

`GET /api/assistant/status` reports key presence separately from observed provider availability. `configured: true` only means a key exists. `availability: unverified` is the initial state after process startup; `billing_unavailable` means a provider response reported insufficient credits. The availability observation is process-local and not a persistent service-level health guarantee. The endpoint never returns secret values.

## Input, knowledge and privacy

`POST /api/assistant` accepts `{question, crop?, district?, consent: true}`. The host applies normal authentication, CSRF protection and request rate limits. Question text is limited to 600 characters. There is no chat-history upload. The prompt contains only the current general question, crop, district, and bounded public reference excerpts. Account names, contacts, report records and household coordinates are not added to model context.

Common phone numbers, emails, exact coordinate pairs and named private-identifier markers are rejected before network use. This pattern filter is not perfect anonymization. The interface must ask people to omit names and personal information and explicitly disclose that the question is sent to OpenAI. Do not store question/answer text in normal audit logs. `store: false` disables Responses API storage; it does not promise zero provider retention or replace the applicable provider data terms.

Production retrieval uses only `reviewStatus: reviewed` lessons with allowlisted official-source URLs. Up to three short excerpts are selected by crop and question keywords. A current forecast can be included only if its district matches the question, its source URL is allowlisted, and its retrieval time is no more than six hours old. The AI never fetches precise farm weather or invents missing forecasts. No reviewed corpus means `knowledge_not_reviewed`, not an invented answer.

Local demo mode may use clearly labelled draft content only when `AGRIBRIDGE_DEMO=true` and `NODE_ENV` is not `production`. Responses then carry a draft-content disclaimer. A generated answer's source IDs are checked against the actual selected excerpts; unrecognized sources, generated URLs, invalid output or missing usage fail closed. The model can still make factual mistakes, so agronomist evaluation remains necessary.

## Boundaries

Human illness, pesticide dosing and wetland-drainage questions have deterministic safety/referral responses that make no provider call and identify themselves as fixed guidance. Other prompts instruct the model to avoid diagnosis, prescribing, chemical rates and unsupported predictions. These safeguards are a first line of defense; language-specific adversarial and field evaluations remain necessary before a public rollout. This endpoint does not autonomously send WhatsApp or SMS, contact a clinician, order supplies or change farm records.

Run `npx tsx --test server/ai/ai.test.ts` for mocked tests covering no-key behavior, consent, review gating, budgets, source selection, privacy, output validation and billing failure. No test calls OpenAI.
