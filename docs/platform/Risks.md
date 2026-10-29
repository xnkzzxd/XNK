# Platform migration & SaaS: Risks (Phase V)

## 7. Remaining risks to accept or watch

- **R1 GIFs in the Play app for XNK** (D30): copyrighted media in a commercial app can get the **whole app** removed for all tenants. Keep a remote kill switch (`EXERCISE_GIFS=false`) so they can be turned off without an app release. The owner accepted this risk.
- **R2 Manual QRIS billing** does not scale beyond tens of coaches; revisit a gateway once there is revenue or a legal entity.
- **R3 Solo maintenance**:
  - Everything is managed (no servers).
  - Sentry free tier for errors; Cloudflare/Supabase status alerts go to the owner.
  - Weekly `pg_dump` to R2 on top of the Supabase daily backups.
- **R4 Health data** (PDP Law): privacy policy, consent screens and a breach-response runbook are written in V6.
- **R5 Number as the global ID**: numbers get recycled by carriers, and a client may lose access to their number. An admin-only number-change flow exists, and a Google account is needed to reach any data. A recycled number alone never opens an account, because linking needs the coach's confirmation (D37).
- **R6 Full super-owner access with no audit log**: competing coaches may distrust the platform, and it is weak under the PDP Law (accountability principle). Recommendation: keep at least an internal log. The owner has chosen none; revisit before opening public signup.
- **R7 Variable session length (D48)** changes the slot engine (`_freeSlots_`, `_snapSlot_`, the hour grid). It ships **after** cutover, behind per-tenant settings, so XNK parity is untouched.
- **R9 E-signature validity**: a drawn signature + timestamp + IP + a PDF hash is fine for a waiver, but not a certified e-signature under UU ITE. Use a certified provider (Privy, PeruriSign) only if a lawyer requires it.
- **R10 Portal shop + manual QRIS**: stock reservation vs. unpaid orders. Orders reserve stock for 24 h, then expire.
- **R11 Cost**: PDF rendering through Browser Rendering is billed per use; cache the PDFs in R2 and regenerate one only when its source data changes.
- **R8 Open Food Facts** has sparse Indonesian data; barcode misses fall back to "add as a private food".

