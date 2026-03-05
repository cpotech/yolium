# Review: Discord + Yolium Kanban Integration Plan

## Overall Assessment

The plan is strong on product intent and phased delivery, but it is currently under-specified in reliability, ownership model, and security implementation details. It is a good strategy draft; it needs an execution contract before implementation starts.

---

## What’s Good

1. **Clear phased rollout**
   - Phase 1/2/3 decomposition is practical and lowers delivery risk.
   - Webhooks-first provides a low-friction path to user value.

2. **Strong feature framing**
   - Goals cleanly separate visibility, interaction, collaboration, and persistence.
   - Data-flow and architecture diagrams make integration boundaries understandable.

3. **Reasonable integration points**
   - Hooking from protocol handling and store mutations aligns with existing Yolium architecture.
   - The plan correctly keeps Yolium as source of truth.

4. **Security awareness is present early**
   - Secrets handling, sanitization, and rate-limiting are explicitly called out.

---

## Gaps / Missing Details

1. **No explicit delivery acceptance criteria per phase**
   - Add measurable exit criteria (e.g., “Phase 1 supports 7 event types, retries 429 with backoff, and has automated tests for queue + payload formatting”).

2. **Event semantics are not normalized**
   - Define one canonical event schema/version to prevent webhook and bot drift.
   - Specify idempotency keys and ordering guarantees for repeated/out-of-order events.

3. **Duplicate notification strategy is unresolved**
   - Multi-user desktop usage can produce duplicated outbound traffic.
   - Needs a concrete ownership/leader model before Phase 1 production use.

4. **No failure-state product behavior**
   - Missing user-facing behavior for Discord outages, auth revocation, invalid channel permissions, and token rotation.

5. **No migration/config lifecycle details**
   - Where config lives today vs future store is noted, but no migration plan/versioning/rollback strategy is provided.

6. **Insufficient test strategy**
   - Should define unit/integration contracts for message formatting, rate-limit handling, command authorization, and replay safety.

7. **Observability is not specified**
   - Need structured logs, per-integration health status, and metrics (success/failure rate, retry count, queue depth, event lag).

8. **Security controls are conceptual, not enforceable yet**
   - “Sanitize input” and “strip sensitive data” need concrete rules/patterns, redaction policy, and test cases.

9. **Bot permission and RBAC model lacks detail**
   - Must define role-to-action matrix (who can move items, retry agents, answer questions).

10. **Potential protocol mismatch in Phase 1**
    - Plan mentions display-only buttons in webhook messages; clarify whether interactive components are intended before bot mode (webhook-only interactions are limited).

---

## Concerns / Risks

1. **Desktop runtime availability risk**
   - If bot/webhook processing depends on app uptime, team reliability suffers when no machine is running.

2. **Scope creep risk in Phase 3**
   - Thread sync + log streaming + dashboard + PR actions may overrun timelines without strict scope guards.

3. **Privacy/data leakage risk**
   - Agent output streaming to Discord can expose local paths, stack traces, secrets, or proprietary snippets unless redaction defaults are strict.

4. **Operational complexity risk**
   - Supporting both webhooks and bot interactions doubles state and troubleshooting complexity unless unified through one event pipeline.

---

## “Wants” (Recommended Enhancements)

1. **Event bus abstraction first**
   - Create one internal `DiscordEvent` pipeline consumed by webhook and bot adapters.

2. **Delivery guarantees**
   - Add dedupe keys, retry policy matrix, dead-letter handling, and at-least-once semantics documentation.

3. **Admin UX**
   - Add “Test integration”, “Last delivery status”, “Last error”, and “Pause Discord sync” controls.

4. **Secure-by-default output policy**
   - Default to minimal summaries; require explicit opt-in for streaming raw agent output.

5. **RBAC and audit log**
   - Store actor identity for every Discord-originated mutation in kanban comments/system logs.

6. **Feature flags per phase**
   - Gate Phase 2/3 features behind flags to de-risk rollout and permit selective enablement.

7. **Runbook + incident handling**
   - Define operational procedures for revoked tokens, channel deletion, API outages, and rate-limit storms.

---

## Suggested Phase Gates

### Phase 1 gate
- Canonical event schema and payload tests completed
- Retry/backoff + dedupe implemented
- Integration health UI available
- Duplicate-sender mitigation chosen and documented

### Phase 2 gate
- RBAC enforced for all mutation commands
- Interaction replay protection in place
- Full audit trail for Discord actions
- Soak test with concurrent command usage

### Phase 3 gate
- Explicit privacy mode for log streaming
- Thread sync conflict policy documented
- Load test for dashboard update cadence and thread fan-out

---

## Final Verdict

- **Good:** Product framing, phased strategy, and architecture direction.
- **Needs work before build:** reliability model, multi-user ownership, enforceable security rules, and test/observability definition.
- **Recommendation:** Proceed only after adding a short “Execution Spec” that hardens the above gaps and defines phase exit criteria.
