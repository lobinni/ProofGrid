# Active deployment verification

Verified at `2026-09-05T11:52:27Z` with:

```bash
node scripts/verify-deployment.mjs
```

## Canonical source

| Source | SHA-256 |
| --- | --- |
| canonical factory (contracts/task_factory.py) | `cbcfb4a7ca1b4fc62311c64955a702d35ad2add4db7736838fb7b48f6856ff86` |
| canonical verifier (contracts/task_verifier.py) | `309f5595bd9b5bfb59dd53d1589fe1d36129f00dcbe77e75d82134dffade7477` |
| canonical child embedded in factory | `309f5595bd9b5bfb59dd53d1589fe1d36129f00dcbe77e75d82134dffade7477` — byte-identical |
| active deployed factory source | `c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a` |
| active deployed verifier source | `9806f9c34da2612f73fca430c22f414bb9e1ea71b897ff001e716e600e1034ad` |

Exact active source is archived under:

`deployments/sources/c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a/`

The current source and the byte-locked deployment archive are identical and independently pass the same portable suite:

```text
current source:     23/23 passed
deployment archive: 23/23 passed
```

## GenLayer Studio / Studionet

- Chain ID: `61999`
- Frontend route: `0xfB0dF18C4c55179Bb57Bbbe48AE2d61Dc282043E`
- Explorer: https://explorer-studio.genlayer.com/address/0xfB0dF18C4c55179Bb57Bbbe48AE2d61Dc282043E
- Deployed source SHA-256: `c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a`
- Manifest source SHA-256: `c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a`
- Source alignment: `MATCH`
- Factory self-report: `0xfB0dF18C4c55179Bb57Bbbe48AE2d61Dc282043E` — `MATCH`
- Release window: `86400` seconds
- Task count / registry length: `0 / 0`

## Asimov / Bradbury Testnet

- Chain ID: `4221`
- Frontend route: `0x503Bdaed62C1419516052Eb5cE55d4cE6210f67D`
- Explorer: https://explorer-bradbury.genlayer.com/address/0x503Bdaed62C1419516052Eb5cE55d4cE6210f67D
- Deployed source SHA-256: `c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a`
- Manifest source SHA-256: `c4270798e5b002f7e505e7fbf5e2793f6ff7297c4f89ccc6ee131db4a3ab3b2a`
- Source alignment: `MATCH`
- Factory self-report: `0x503Bdaed62C1419516052Eb5cE55d4cE6210f67D` — `MATCH`
- Release window: `86400` seconds
- Task count / registry length: `0 / 0`

## Missing evidence

The factory deployment transaction hashes were not supplied with the addresses
and cannot safely be inferred from an address alone. They remain `null` in the
manifest. Add the finalized hashes before claiming complete on-chain deployment
evidence. No hash has been fabricated.

Both registries were empty during this verification, so per-task child, escrow,
settlement and recipient-balance reads cannot yet be demonstrated on these exact
factories. Run `scripts/studionet-e2e.mjs` with funded keys to create that
evidence; it prints the required finalized hashes and before/after reads.
