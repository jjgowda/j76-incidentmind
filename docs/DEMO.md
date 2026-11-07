# Live demo guide

## Before presenting

1. Configure real LLM and Hindsight credentials. Start the stack, provision a dedicated bank, and perform one test investigation. Initial Hindsight model download can take several minutes.
2. Use synthetic data only. Open the dashboard, API docs and Hindsight UI (local port 9999).
3. Confirm that provider requests succeed; Settings configuration flags alone do not establish live connectivity.

## Presentation script

**The first incident:** Generate an image-loading failure. Show 403/AccessDenied logs and explain that no production systems were changed. Run AI with memory disabled. Read its ranked hypotheses and evidence; emphasize that these are unverified suggestions.

**Developer verification:** Open the answer key and explain the known simulated cause. Enter the confirmed R2 configuration issue, successful fix, synthetic verification evidence, a failed cache purge attempt and a lesson. Record the resolution. Click Save learning to Hindsight. Show that failure would leave a retryable pending state rather than pretend to have saved memory.

**Evidence retained:** Search for image origin / R2 in Memory Explorer. Show the actual recalled text and source metadata. In the Hindsight UI, inspect the source document. Explain retain, recall, and reflect without substituting local JSON for memory.

**Recurring incident:** Trigger images again with recurring variant enabled. Show the new 502/forbidden transformer symptoms. Run the Comparison Lab against this same incident. Read both ranked results, their actual durations, recalled evidence and memory-influence explanations. Record your observed root-cause ranks, correct fixes and explanation quality in the Reviewer assessment form, with supporting notes. A useful memory may raise the R2 hypothesis, but the app does not guarantee or fabricate that outcome.

**Persistence:** Stop and restart backend/Hindsight while preserving volumes. Recall the same incident from the same bank. Use reflect to explore relationships supported by historical evidence.

## Honest evaluation

- Duration includes Hindsight retrieval for ON; one sequential pair is not a performance study.
- Exact wording match provides a conservative simulator cause rank. Different wording requires manual assessment.
- Review explanation quality and equivalent fixes from the evidence. There is no fabricated accuracy percentage.
- A first memory-enabled run may return no historical facts; that is a valid result.
- Tests with provider doubles establish application behavior, not actual LLM accuracy or live service availability.
