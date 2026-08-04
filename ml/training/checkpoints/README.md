# Model artifact integrity

The ten tracked checkpoint artifacts are Git LFS objects. Their expected byte
sizes and SHA-256 object IDs are pinned in `manifest.json`; run
`npm run lfs:verify` to verify either a checked-in LFS pointer's metadata or a
materialized artifact's byte-level SHA-256. Remote-object availability is a
separate Git LFS service check.

Three age-aware abnormal checkpoints formerly referenced objects that are not
present in the repository's Git LFS store and made a fresh clone fail:

- `best_age_aware_abnormal.pt`
- `epoch_10_age_aware_abnormal.pt`
- `epoch_20_age_aware_abnormal.pt`

Those broken pointers were removed. They must not be recreated from an
unverifiable local copy. Reintroducing an age-aware model requires a documented,
reproducible training run, validation evidence, preprocessing metadata, and a
new manifest entry whose object is uploaded before merge.
