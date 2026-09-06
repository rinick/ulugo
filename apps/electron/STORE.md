# Microsoft Store package

Build on Windows with `pnpm build:msix-x64` from the repository root.

The Store configuration automatically includes the versions pinned in
`store-katago.json`:

- KataGo v1.18.1 OpenCL, Windows x64, standard board-size build.
- `kata1-zhizi-b28c512nbt-muonfd2.bin.gz`.

These versions match the OpenCL version and selected model in the development
cache on 2026-09-05. The Windows archive checksum comes from the official KataGo
release; the model checksum comes from that cached model. Building does not
switch to newer releases automatically.

Before packaging, the build hook prepares files in `resources/store-katago/`.
It reuses files already there, otherwise copies from the cache paths below,
or downloads the pinned files if they are missing. Every file is checked against
its SHA-256 before packaging; a download or checksum failure stops packaging.
The resource directory is ignored by Git.

The cache defaults to `%USERPROFILE%\.ulugo`. Set `ULUGO_KATAGO_CACHE` to use
another cache root. Expected paths relative to that root are:

```text
katago/katago-v1.18.1-opencl-windows-x64/katago-v1.18.1-opencl-windows-x64.zip
models/kata1-zhizi-b28c512nbt-muonfd2.bin.gz
```

For offline packaging, place these two files directly in
`apps/electron/resources/store-katago/` before building. The ZIP must be the
original Windows archive, not the Linux executable or a repacked installation.
An installed KataGo cache normally no longer contains its downloaded ZIP.
The model can be copied unchanged from the Linux cache.

On first use, the Store app extracts the complete KataGo archive, including its
dependencies, and copies the model into the user's `.ulugo` directory. It creates
the analysis configuration there and completes setup without refreshing any
online catalogs. Existing installed selections are preserved; only missing
components are installed. Installation failures are reported to the KataGo
console and leave setup incomplete for retry on the next launch.

Other package formats retain their existing setup behavior. Windows packaging
and offline first-launch validation remain to be performed on Windows.
