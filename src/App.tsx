import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Aperture,
  Check,
  CircleHelp,
  Download,
  ImagePlus,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Share2,
  Sparkles,
  SunMedium,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react'
import {
  analyzeImage,
  applyMimic,
  fingerprintFromStats,
  formatStyleTags,
  getFingerprintDefinitions,
  getMatchMetrics,
  loadImage,
  type EditControls,
  type ImageStats,
  type StyleFingerprint,
} from './lib/mimic'

type ReferenceImage = { id: string; name: string; url: string; width: number; height: number; stats: ReturnType<typeof analyzeImage> }
type TargetImage = { id: string; name: string; url: string; processedUrl?: string; stats?: ImageStats; status: 'ready' | 'processing' | 'done' | 'error' }

const emptyFingerprint: StyleFingerprint = {
  warmth: 0,
  saturation: 0.24,
  brightness: 0.5,
  contrast: 0.22,
  shadowLift: 0.42,
  highlightSoftness: 0.5,
  grain: 0.2,
  red: 0.5,
  green: 0.5,
  blue: 0.5,
  skinWarmth: 0.12,
  skinBrightness: 0.55,
  skinSaturation: 0.35,
  skinCoverage: 0,
  sampleCount: 0,
}

const initialControls: EditControls = { strength: 68, warmer: 0, softer: 0, film: 28, color: 0, flash: 0, clean: 0 }
type PreviewMode = 'original' | 'mimic' | 'stronger'
type LookEffects = { flash: boolean; soften: boolean; clean: boolean }
const initialEffects: LookEffects = { flash: false, soften: false, clean: false }

const getEffectiveControls = (controls: EditControls, mode: PreviewMode, effects: LookEffects): EditControls => {
  const effective = { ...controls }
  if (mode === 'original') return { ...controls, strength: 0, flash: 0, clean: 0 }
  if (mode === 'stronger') effective.strength = Math.min(100, controls.strength + 22)
  if (effects.soften) effective.softer = Math.max(controls.softer, 42)
  if (effects.flash) effective.flash = Math.max(controls.flash, 82)
  if (effects.clean) {
    effective.clean = Math.max(controls.clean, 88)
    effective.film = Math.min(controls.film, 8)
  }
  return effective
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

const readFiles = (event: ChangeEvent<HTMLInputElement> | DragEvent<HTMLDivElement>) => {
  event.preventDefault()
  return 'dataTransfer' in event ? Array.from(event.dataTransfer.files) : Array.from(event.target.files ?? [])
}

function UploadZone({ label, hint, onFiles, multiple = true }: { label: string; hint: string; onFiles: (files: File[]) => void; multiple?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className={`upload-zone ${dragging ? 'is-dragging' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { setDragging(false); onFiles(readFiles(event)) }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click() }}
    >
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} onChange={(event) => { onFiles(readFiles(event)); event.currentTarget.value = '' }} />
      <span className="upload-icon"><Upload size={17} /></span>
      <strong>{label}</strong>
      <span>{hint}</span>
    </div>
  )
}

function Slider({ label, left, right, value, onChange, tone = '' }: { label: string; left: string; right: string; value: number; onChange: (value: number) => void; tone?: string }) {
  return (
    <label className={`slider-row ${tone}`}>
      <span className="slider-heading"><strong>{label}</strong><output>{value}%</output></span>
      <input type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="slider-caption"><span>{left}</span><span>{right}</span></span>
    </label>
  )
}

function MatchCard({ label, score, referenceColor, originalColor, matchedColor, detail }: { label: string; score: number; referenceColor: string; originalColor: string; matchedColor: string; detail: string }) {
  return (
    <div className="match-card">
      <div className="match-card-top"><div><strong>{label}</strong><span>{detail}</span></div><b>{Math.round(score * 100)}%</b></div>
      <div className="match-patches" aria-label={`${label} color patches`}><span className="patch reference" style={{ background: referenceColor }} /><span className="patch original" style={{ background: originalColor }} /><span className="patch matched" style={{ background: matchedColor }} /></div>
      <div className="match-card-foot"><span>Reference</span><span>Original</span><span>Mimic</span></div>
      <div className="match-meter"><span style={{ width: `${Math.round(score * 100)}%` }} /></div>
    </div>
  )
}

function App() {
  const [references, setReferences] = useState<ReferenceImage[]>([])
  const [targets, setTargets] = useState<TargetImage[]>([])
  const [selectedTargetId, setSelectedTargetId] = useState<string>()
  const [fingerprint, setFingerprint] = useState<StyleFingerprint>(emptyFingerprint)
  const [controls, setControls] = useState<EditControls>(initialControls)
  const [effects, setEffects] = useState<LookEffects>(initialEffects)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('mimic')
  const [compareOriginal, setCompareOriginal] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedTargetStats, setSelectedTargetStats] = useState<ImageStats>()
  const [matchChecked, setMatchChecked] = useState(false)
  const [notice, setNotice] = useState('')

  const selectedTarget = targets.find((target) => target.id === selectedTargetId) ?? targets[0]
  const styleTags = useMemo(() => formatStyleTags(fingerprint), [fingerprint])
  const fingerprintDefinitions = useMemo(() => getFingerprintDefinitions(fingerprint), [fingerprint])
  const styleReady = references.length > 0
  const fingerprintConfidence = styleReady ? Math.min(100, 34 + references.length * 9 + Math.round(fingerprint.skinCoverage * 16)) : 0
  const matchMetrics = matchChecked && selectedTargetStats && styleReady ? getMatchMetrics(fingerprint, selectedTargetStats, getEffectiveControls(controls, previewMode, effects)) : undefined

  useEffect(() => {
    if (!selectedTargetId && targets[0]) setSelectedTargetId(targets[0].id)
    if (selectedTargetId && !targets.some((target) => target.id === selectedTargetId)) setSelectedTargetId(targets[0]?.id)
  }, [selectedTargetId, targets])

  useEffect(() => {
    setFingerprint(references.length ? fingerprintFromStats(references.map((reference) => reference.stats)) : emptyFingerprint)
  }, [references])

  useEffect(() => {
    let cancelled = false
    const readTarget = async () => {
      if (!selectedTarget) {
        setSelectedTargetStats(undefined)
        return
      }
      try {
        const image = await loadImage(selectedTarget.url)
        const stats = selectedTarget.stats ?? analyzeImage(image)
        if (!cancelled) setSelectedTargetStats(stats)
      } catch {
        if (!cancelled) setSelectedTargetStats(undefined)
      }
    }
    void readTarget()
    return () => { cancelled = true }
  }, [selectedTarget?.id, selectedTarget?.url])

  useEffect(() => {
    setMatchChecked(false)
  }, [fingerprint, selectedTarget?.id])

  const addReferences = async (files: File[]) => {
    const remainingSlots = Math.max(0, 20 - references.length)
    const imageFiles = files.filter((file) => file.type.startsWith('image/')).slice(0, remainingSlots)
    if (!imageFiles.length) {
      setNotice(references.length >= 20 ? 'You can add up to 20 reference photos.' : 'Choose a JPG, PNG, or WebP image.')
      window.setTimeout(() => setNotice(''), 3500)
      return
    }
    setIsAnalyzing(true)
    const next = await Promise.all(imageFiles.map(async (file) => {
      const url = URL.createObjectURL(file)
      try {
        const image = await loadImage(url)
        return { id: makeId(), name: file.name, url, width: image.naturalWidth, height: image.naturalHeight, stats: analyzeImage(image) }
      } catch {
        URL.revokeObjectURL(url)
        return null
      }
    }))
    const valid = next.filter(Boolean) as ReferenceImage[]
    if (valid.length) setReferences((current) => [...current, ...valid])
    if (valid.length !== imageFiles.length) {
      setNotice('One or more photos could not be read. Try another image.')
      window.setTimeout(() => setNotice(''), 3500)
    }
    setIsAnalyzing(false)
  }

  const addTargets = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (!imageFiles.length) {
      setNotice('Choose a JPG, PNG, or WebP image.')
      window.setTimeout(() => setNotice(''), 3500)
      return
    }
    setIsUploading(true)
    const next = await Promise.all(imageFiles.map(async (file) => {
      const url = URL.createObjectURL(file)
      try {
        const image = await loadImage(url)
        if (!image.naturalWidth || !image.naturalHeight) throw new Error('Image has no size')
        return { id: makeId(), name: file.name, url, stats: analyzeImage(image), status: 'ready' as const }
      } catch {
        URL.revokeObjectURL(url)
        return null
      }
    }))
    const valid = next.filter(Boolean) as TargetImage[]
    if (valid.length) {
      setTargets((current) => [...current, ...valid])
      if (!selectedTargetId) setSelectedTargetId(valid[0].id)
    }
    if (valid.length !== imageFiles.length) {
      setNotice('One or more photos could not be read. Try another image.')
      window.setTimeout(() => setNotice(''), 3500)
    }
    setIsUploading(false)
  }

  useEffect(() => {
    let cancelled = false
    const render = async () => {
      if (!selectedTarget) return
      if (!styleReady) {
        setTargets((current) => current.map((target) => target.id === selectedTarget.id ? { ...target, processedUrl: undefined, status: 'ready' } : target))
        return
      }
      const modeControls = getEffectiveControls(controls, previewMode, effects)
      setTargets((current) => current.map((target) => target.id === selectedTarget.id ? { ...target, status: 'processing' } : target))
      try {
        const image = await loadImage(selectedTarget.url)
        const processedUrl = await applyMimic(image, fingerprint, modeControls)
        if (!cancelled) setTargets((current) => current.map((target) => target.id === selectedTarget.id ? { ...target, processedUrl, status: 'done' } : target))
      } catch {
        if (!cancelled) setTargets((current) => current.map((target) => target.id === selectedTarget.id ? { ...target, status: 'error' } : target))
      }
    }
    void render()
    return () => { cancelled = true }
  }, [selectedTarget?.id, selectedTarget?.url, styleReady, fingerprint, controls, effects, previewMode])

  const updateControl = (key: keyof EditControls, value: number) => setControls((current) => ({ ...current, [key]: value }))

  const setMode = (mode: PreviewMode) => {
    setPreviewMode(mode)
  }

  const toggleEffect = (effect: keyof LookEffects) => {
    setPreviewMode('mimic')
    setEffects((current) => ({ ...current, [effect]: !current[effect] }))
  }

  const checkMatch = () => {
    if (!styleReady) {
      setNotice('Add at least one reference photo first.')
    } else if (!selectedTargetStats || !selectedTarget) {
      setNotice('Add a photo to edit first.')
    } else {
      setMatchChecked(true)
    }
    window.setTimeout(() => setNotice(''), 3500)
  }

  const removeReference = (id: string) => {
    const item = references.find((reference) => reference.id === id)
    if (item) URL.revokeObjectURL(item.url)
    const remaining = references.filter((reference) => reference.id !== id)
    setReferences(remaining)
  }

  const removeTarget = (id: string) => {
    const item = targets.find((target) => target.id === id)
    if (item) URL.revokeObjectURL(item.url)
    setTargets((current) => current.filter((target) => target.id !== id))
  }

  const downloadImage = (target: TargetImage) => {
    if (!target.processedUrl) return
    const link = document.createElement('a')
    link.href = target.processedUrl
    link.download = `mimic-${target.name.replace(/\.[^/.]+$/, '')}.jpg`
    link.click()
  }

  const saveToPhotos = async (target?: TargetImage) => {
    if (!target?.processedUrl) return
    const filename = `mimic-${target.name.replace(/\.[^/.]+$/, '')}.jpg`
    try {
      const blob = await fetch(target.processedUrl).then((response) => response.blob())
      const file = new File([blob], filename, { type: 'image/jpeg' })
      const shareNavigator = navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>
        canShare?: (data?: ShareData) => boolean
      }
      const canShareFile = typeof shareNavigator.share === 'function' && typeof shareNavigator.canShare === 'function' && shareNavigator.canShare({ files: [file] })
      if (canShareFile && shareNavigator.share) {
        await shareNavigator.share({ files: [file], title: 'Mimic edit', text: 'Save this edited photo to your photo library.' })
        setNotice('Use “Save Image” or “Save to Photos” in the share sheet.')
      } else {
        downloadImage(target)
        setNotice('Saved to your device. Mobile browsers can use “Save Image” to add it to Photos.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      downloadImage(target)
      setNotice('Saved to your device.')
    }
    window.setTimeout(() => setNotice(''), 4500)
  }

  const displayUrl = compareOriginal || previewMode === 'original' ? selectedTarget?.url : selectedTarget?.processedUrl

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Aperture size={20} strokeWidth={2.5} /></span><span>Mimic</span><span className="brand-divider" /><span className="brand-context">Look maker</span></div>
        <div className="topbar-actions"><span className="local-pill"><LockKeyhole size={14} /> Photos stay on this device</span><button className="icon-button" aria-label="Help"><CircleHelp size={18} /></button></div>
      </header>

      <main className="workspace">
        <section className="workspace-intro">
          <div><p className="eyebrow">Look maker</p><h1>Make a look from photos you already love.</h1><p className="intro-copy">Add a few references, choose the photos you want to edit, and shape the result until it feels like you.</p></div>
        </section>

        <div className="editor-grid">
          <aside className="side-panel reference-panel">
            <div className="panel-heading"><div><span className="panel-kicker"><span className="step-number">1</span> Reference photos</span><h2>Teach Mimic a look</h2></div><span className="count-badge">{references.length}/20</span></div>
            <p className="panel-copy">Choose a few photos with the mood, color, and softness you want to carry over. Adding more helps Mimic learn how your look behaves in different light.</p>
            <UploadZone label="Add reference photos" hint="JPG, PNG, or WebP · up to 20" onFiles={addReferences} />
            {references.length > 0 && <div className="thumb-grid">{references.map((reference) => <div className="thumb-card" key={reference.id}><img src={reference.url} alt={reference.name} /><button className="thumb-remove" onClick={() => removeReference(reference.id)} aria-label={`Remove ${reference.name}`}><X size={13} /></button></div>)}</div>}
            <div className={`fingerprint-card ${styleReady ? 'is-ready' : ''}`}>
              <div className="fingerprint-header"><span className="fingerprint-icon"><Sparkles size={15} /></span><span>{isAnalyzing ? 'Reading your references…' : styleReady ? 'Your visual fingerprint' : 'Your fingerprint will appear here'}</span>{isAnalyzing && <LoaderCircle className="spin" size={15} />}</div>
              {styleReady ? <><div className="fingerprint-summary"><span className="summary-dot" /><span><strong>Learning from {references.length} {references.length === 1 ? 'photo' : 'photos'}</strong><small>Each photo helps refine color, texture, and skin tone handling.</small></span></div><div className="fingerprint-confidence"><div><span>Fingerprint confidence</span><strong>{fingerprintConfidence}%</strong></div><span className="confidence-track"><span style={{ width: `${fingerprintConfidence}%` }} /></span></div><div className="tag-list">{styleTags.map((tag) => <span key={tag}><Check size={12} /> {tag}</span>)}</div><div className="fingerprint-definitions">{fingerprintDefinitions.map((definition) => <div className="definition-row" key={definition.label}><div className="definition-top"><span><strong>{definition.label}</strong><small>{definition.description}</small></span><b>{definition.value}%</b></div><div className="definition-track"><span style={{ width: `${definition.value}%` }} /></div></div>)}</div></> : <p>Add at least one reference image to extract the tone, color, contrast, texture, and skin tone behavior your photos share.</p>}
            </div>
            <div className="privacy-note"><LockKeyhole size={14} /><span>Photos never leave this device. Mimic uses conventional pixel analysis — no generated content.</span></div>
          </aside>

          <section className="preview-panel">
            <div className="preview-toolbar"><div className="toolbar-label"><span className="panel-kicker"><span className="step-number">3</span> Preview</span><span className="preview-status">{selectedTarget ? selectedTarget.name : 'Add a target photo to begin'}</span></div><div className="preview-controls"><div className="mode-switch" role="group" aria-label="Preview mode">{(['original', 'mimic', 'stronger'] as const).map((mode) => <button key={mode} className={previewMode === mode ? 'active' : ''} onClick={() => setMode(mode)}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}</div><div className="effect-toggles" role="group" aria-label="Optional look effects"><button className={effects.flash ? 'active' : ''} aria-pressed={effects.flash} onClick={() => toggleEffect('flash')}>Flash</button><button className={effects.soften ? 'active' : ''} aria-pressed={effects.soften} onClick={() => toggleEffect('soften')}>Soften</button><button className={effects.clean ? 'active' : ''} aria-pressed={effects.clean} onClick={() => toggleEffect('clean')}>Clean</button></div></div></div>
            <div className={`preview-stage ${!displayUrl ? 'is-empty' : ''}`}>
              {displayUrl ? <img src={displayUrl} alt="Mimic preview" /> : <div className="preview-empty"><div className="empty-orbit"><ImagePlus size={28} /></div><h3>Your preview will live here</h3><p>Start by adding a reference look and one photo to edit.</p></div>}
              {selectedTarget?.status === 'processing' && <div className="processing-overlay"><LoaderCircle className="spin" size={22} /><span>Adapting your look…</span></div>}
              {selectedTarget && <div className="preview-caption"><span><span className="status-dot" /> Same photo. Same scene. Your look.</span><button className={`compare-toggle ${compareOriginal ? 'active' : ''}`} onClick={() => setCompareOriginal((value) => !value)}>{compareOriginal ? 'Showing original' : 'Compare original'}</button></div>}
            </div>
            <div className="preview-footer"><div className="match-control"><div className="control-title"><span><WandSparkles size={15} /> Match strength</span><strong>{controls.strength}%</strong></div><input type="range" min="0" max="100" value={controls.strength} onChange={(event) => { updateControl('strength', Number(event.target.value)); setPreviewMode('mimic') }} /><div className="control-scale"><span>Natural</span><span>Exact look</span></div></div><div className="preview-size"><span>Preview</span><b>{selectedTarget ? 'Ready to save' : 'Waiting for photo'}</b></div></div>
            <div className="match-report"><div className="match-report-heading"><div><span className="panel-kicker">Match check</span><h3>How close is the look?</h3></div><div className="match-report-actions"><strong>{matchMetrics ? `${Math.round(matchMetrics.overall * 100)}% matched` : 'Ready when you are'}</strong><button className="check-match-button" onClick={checkMatch}><Check size={13} /> Check match</button></div></div>{matchMetrics ? <div className="match-cards"><MatchCard label="Color" score={matchMetrics.color} referenceColor={matchMetrics.referenceColor} originalColor={matchMetrics.originalColor} matchedColor={matchMetrics.matchedColor} detail="Overall palette" /><MatchCard label="Skin tone" score={matchMetrics.skin} referenceColor={matchMetrics.referenceSkinColor} originalColor={matchMetrics.originalSkinColor} matchedColor={matchMetrics.matchedSkinColor} detail="Face and skin balance" /><MatchCard label="Contrast" score={matchMetrics.contrast} referenceColor="#555b68" originalColor="#8b8d94" matchedColor="#626773" detail="Light and shadow" /></div> : <p className="match-empty">Add your photos, then tap Check match to compare color, skin tone, and contrast with the visual fingerprint.</p>}</div>
          </section>

          <aside className="side-panel target-panel">
            <div className="panel-heading"><div><span className="panel-kicker"><span className="step-number">2</span> Photos to edit</span><h2>Make them match</h2></div><span className="count-badge">{targets.length}</span></div>
            <p className="panel-copy">Add one photo or a whole set. Each image keeps its own lighting while sharing the look.</p>
            <UploadZone label={isUploading ? 'Reading photos…' : 'Add photos to edit'} hint="Drop one or many images here" onFiles={addTargets} />
            {targets.length > 0 && <div className="target-list">{targets.map((target, index) => <div className={`target-item ${selectedTarget?.id === target.id ? 'selected' : ''}`} key={target.id} role="button" tabIndex={0} onClick={() => setSelectedTargetId(target.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedTargetId(target.id) }}><img src={target.url} alt="" /><span className="target-info"><strong>{target.name}</strong><small>{target.status === 'processing' ? 'Adapting…' : target.status === 'done' ? 'Ready to save' : target.status === 'error' ? 'Could not process' : `Photo ${String(index + 1).padStart(2, '0')}`}</small></span>{target.status === 'processing' ? <LoaderCircle className="spin target-state" size={16} /> : target.status === 'done' ? <Check className="target-state done" size={16} /> : <button className="remove-target" onClick={(event) => { event.stopPropagation(); removeTarget(target.id) }} aria-label={`Remove ${target.name}`}><Trash2 size={15} /></button>}</div>)}</div>}
            {targets.length > 0 && <button className="download-all" onClick={() => void saveToPhotos(selectedTarget)} disabled={!selectedTarget?.processedUrl}><Share2 size={17} /> Save to Photos</button>}
            {targets.length > 0 && <p className="save-hint">On phone, this opens the share sheet so you can choose Save Image or Photos.</p>}
            <div className="batch-note"><Layers3 size={15} /><span>Batch mode keeps each photo’s lighting natural while carrying over the look.</span></div>
          </aside>
        </div>

        <section className="fine-tune-section">
          <div className="fine-tune-heading"><div><span className="panel-kicker">Fine tune</span><h2>Make it feel more like you</h2></div><span className="fine-tune-hint"><SunMedium size={15} /> Gentle by default</span></div>
          <div className="slider-grid"><Slider label="Warmer" left="Cool" right="Golden" value={controls.warmer + 50} onChange={(value) => updateControl('warmer', value - 50)} tone="warm" /><Slider label="Softer" left="Crisp" right="Dreamy" value={controls.softer + 50} onChange={(value) => updateControl('softer', value - 50)} tone="soft" /><Slider label="More film" left="Clean" right="Textured" value={controls.film} onChange={(value) => updateControl('film', value)} tone="film" /><Slider label="More color" left="Quiet" right="Rich" value={controls.color + 50} onChange={(value) => updateControl('color', value - 50)} tone="color" /></div>
        </section>

        <footer className="app-footer"><span><Aperture size={14} /> Mimic keeps the identity of your photo intact.</span><span>Built for looks, not generated scenes.</span></footer>
      </main>
      {notice && <div className="toast"><Download size={15} /> {notice}</div>}
    </div>
  )
}

export default App
