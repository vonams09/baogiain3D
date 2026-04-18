# Security Spec - Báo Giá In 3D

## Data Invariants
1. Materials must have a valid ownerId matching the authenticated user.
2. Settings document ID must match the owner's UID.
3. Material prices and weights must be positive numbers.
4. Timestamps must be server-validated.

## Dirty Dozen Payloads
1. Create material without being signed in (authRequired).
2. Create material with ownerId matching someone else (identitySpoofing).
3. Update material and try to change ownerId (immutabilityViolation).
4. Update settings with extremely long string in number field (resourcePoisoning).
5. Create material with a 1MB string in name field (dosAttack).
6. Create material with future timestamp (temporalIntegrity).
7. Update material from another user (relationalViolation).
8. Read someone else's private material collection (piiLeak).
9. List all materials without filtering by ownerId (queryScraping).
10. Delete someone else's material (unauthorizedDeletion).
11. Update settings and inject 'isAdmin: true' (privilegeEscalation).
12. Create material with invalid colorHex format (schemaViolation).
