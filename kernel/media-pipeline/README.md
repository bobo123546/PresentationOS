# Media pipeline

`MediaPipeline.processDeck` requires real page images and uses Windows SAPI by default. `voice` names an installed voice; the pipeline does not install or automatically switch voices. Unknown voices fail explicitly. Package tests use a clearly named deterministic WAV provider to exercise routing, timing and muxing; they do not certify speech quality.

The SAPI provider calls the Windows inbox executable at `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` directly to load `System.Speech`; it does not search `PATH` for a PowerShell helper. FFmpeg and FFprobe must be available through the application's controlled runtime path. A local isolated-path check still uses the installed Windows voice/runtime and is not a clean-machine certification.

Set `narrationLanguage: 'zh-CN'` or `'en-US'` to select numeric pronunciation normalization. English turns a unary `-12.5` into `minus 12.5` and `5%` into `5 percent`, retaining grouped values such as `10,000`. Numeric subtraction, ranges, exponent notation and identifiers remain unchanged. Chinese normalization retains its existing spoken-number rules. The direct `normalizeNarrationScript(text)` helper keeps its legacy Chinese default; pass the language explicitly for English.

When `processDeck` receives no language option, each note containing a Han character uses Chinese normalization. Other notes retain their numeric text and punctuation through the `verbatim` fallback. This conservative fallback prevents inserting Chinese words into another language; it does not certify support for that language or infer the correct voice. Mixed-language notes should use an explicit option and a suitable installed voice. The returned `narrationProfile` records each page's decision and confirms that voice selection was not automatic.

Subtitles follow measured sentence audio boundaries. Stream start/duration checks and audio correlation establish technical alignment, not word timing, natural pronunciation, factual truth or perceptual quality. Those require separate review of the actual installed-voice output.
