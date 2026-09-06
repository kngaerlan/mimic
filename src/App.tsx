import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Aperture,
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  ImagePlus,
  Layers3,
  LoaderCircle,
  LockKeyhole,
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
  loadImage,
  type EditControls,
  type StyleFingerprint,
} from './lib/mimic'

type ReferenceImage = { id: string; name: string; url: string; width: number; height: number; stats: ReturnType<typeof analyzeImage> }
type TargetImage = { id: string; name: string; url: string; processedUrl?: string; status: 'ready' | 'processing' | 'done' | 'error' }

const emptyFingerprint: StyleFingerprint = {
  warmth: 0,
  saturation: 0.24,
  brightness: 0.5,
  contrast: 0.22,
  shadowLift: 0.42,
  highlightSoftness: 0.5,
  grain: 0.2,
  sampleCount: 0,
}

const initialControls: EditControls = { strength: 68, warmer: 0, softer: 0, film: 28, color: 0 }

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
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} onChange={(event) => onFiles(readFiles(event))} />
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

function App() {
  const [references, setReferences] = useState<ReferenceImage[]>([])
  const [targets, setTargets] = useState<TargetImage[]>([])
  const [selectedTargetId, setSelectedTargetId] = useState<string>()
  const [fingerprint, setFingerprint] = useState<StyleFingerprint>(emptyFingerprint)
  const [controls, setControls] = useState<EditControls>(initialControls)
  const [previewMode, setPreviewMode] = useState<'original' | 'mimic' | 'stronger' | 'softer'>('mimic')
  const [compareOriginal, setCompareOriginal] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [notice, setNotice] = useState('')

  const selectedTarget = targets.find((target) => target.id === selectedTargetId) ?? targets[0]
  const styleTags = useMemo(() => formatStyleTags(fingerprint), [fingerprint])
  const styleReady = references.length > 0

  useEffect(() => {
    if (!selectedTargetId && targets[0]) setSelectedTargetId(targets[0].id)
    if (selectedTargetId && !targets.some((target) => target.id === selectedTargetId)) setSelectedTargetId(targets[0]?.id)
  }, [selectedTargetId, targets])

  const addReferences = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (!imageFiles.length) return
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
    if (valid.length) {
      setReferences((current) => [...current, ...valid])
      setFingerprint(fingerprintFromStats([...references, ...valid].map((item) => item.stats)))
    }
    setIsAnalyzing(false)
  }

  const addTargets = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    const next = imageFiles.map((file) => ({ id: makeId(), name: file.name, url: URL.createObjectURL(file), status: 'ready' as const }))
    setTargets((current) => [...current, ...next])
    if (!selectedTargetId && next[0]) setSelectedTargetId(next[0].id)
  }

  useEffect(() => {
    let cancelled = false
    const render = async () => {
      if (!selectedTarget || !styleReady) return
      const modeControls = previewMode === 'stronger' ? { ...controls, strength: Math.min(100, controls.strength + 22) } : previewMode === 'softer' ? { ...controls, strength: Math.max(0, controls.strength - 24) } : previewMode === 'original' ? { ...controls, strength: 0 } : controls
      setTargets((current) => current.map((target) => target.id === selectedTarget.id ? { ...target, status: 'processing' } : target))
      try {
        const image = await loadImage(selectedTarget.url)
        const processedUrl = applyMimic(image, fingerprint, modeControls)
        if (!cancelled) setTargets((current) => current.map((target) => target.id === selectedTarget.id ? { ...target, processedUrl, status: 'done' } : target))
      } catch {
        if (!cancelled) setTargets((current) => current.map((target) => target.id === selectedTarget.id ? { ...target, status: 'error' } : target))
      }
    }
    void render()
    return () => { cancelled = true }
  }, [selectedTarget?.id, selectedTarget?.url, styleReady, fingerprint, controls, previewMode])

  const updateControl = (key: keyof EditControls, value: number) => setControls((current) => ({ ...current, [key]: value }))

  const setMode = (mode: 'original' | 'mimic' | 'stronger' | 'softer') => {
    setPreviewMode(mode)
    if (mode === 'original') updateControl('strength', 0)
    if (mode === 'mimic') updateControl('strength', 68)
    if (mode === 'stronger') updateControl('strength', 88)
    if (mode === 'softer') updateControl('strength', 42)
  }

  const removeReference = (id: string) => {
    const item = references.find((reference) => reference.id === id)
    if (item) URL.revokeObjectURL(item.url)
    const remaining = references.filter((reference) => reference.id !== id)
    setReferences(remaining)
    setFingerprint(remaining.length ? fingerprintFromStats(remaining.map((reference) => reference.stats)) : emptyFingerprint)
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

  const downloadAll = async () => {
    const ready = targets.filter((target) => target.processedUrl)
    for (const target of ready) {
      downloadImage(target)
      await new Promise((resolve) => window.setTimeout(resolve, 120))
    }
    setNotice(`${ready.length} edited ${ready.length === 1 ? 'photo is' : 'photos are'} ready in your downloads.`)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const displayUrl = compareOriginal || previewMode === 'original' ? selectedTarget?.url : selectedTarget?.processedUrl

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Aperture size={20} strokeWidth={2.5} /></span><span>Mimic</span><span className="brand-divider" /><span className="brand-context">Adaptive photo styling</span></div>
        <div className="topbar-actions"><span className="local-pill"><LockKeyhole size={14} /> Local-only editing</span><button className="icon-button" aria-label="Help"><CircleHelp size={18} /></button></div>
      </header>

      <main className="workspace">
        <section className="workspace-intro">
          <div><p className="eyebrow">Your look, adapted</p><h1>Teach Mimic the mood you love.</h1><p className="intro-copy">Give it a few reference photos, then make your own images feel like they belong together.</p></div>
          <div className="workflow-legend"><span><b>01</b> Learn a look</span><span><b>02</b> Adapt your photos</span><span><b>03</b> Download</span></div>
        </section>

        <div className="editor-grid">
          <aside className="side-panel reference-panel">
            <div className="panel-heading"><div><span className="panel-kicker">01 · Reference look</span><h2>Teach Mimic</h2></div><span className="count-badge">{references.length}/20</span></div>
            <p className="panel-copy">Use photos that already have the feeling you want. More examples make the match more personal.</p>
            <UploadZone label="Add reference photos" hint="JPG, PNG, or WebP · up to 20" onFiles={addReferences} />
            {references.length > 0 && <div className="thumb-grid">{references.map((reference) => <div className="thumb-card" key={reference.id}><img src={reference.url} alt={reference.name} /><button className="thumb-remove" onClick={() => removeReference(reference.id)} aria-label={`Remove ${reference.name}`}><X size={13} /></button></div>)}</div>}
            <div className={`fingerprint-card ${styleReady ? 'is-ready' : ''}`}>
              <div className="fingerprint-header"><span className="fingerprint-icon"><Sparkles size={15} /></span><span>{isAnalyzing ? 'Reading your references…' : styleReady ? 'Your visual fingerprint' : 'Your fingerprint will appear here'}</span>{isAnalyzing && <LoaderCircle className="spin" size={15} />}</div>
              {styleReady ? <><div className="fingerprint-metrics"><div><strong>{Math.round((fingerprint.brightness || 0.5) * 100)}</strong><span>light</span></div><div><strong>{Math.round((fingerprint.saturation || 0.2) * 100)}</strong><span>color</span></div><div><strong>{Math.round((fingerprint.contrast || 0.2) * 100)}</strong><span>contrast</span></div></div><div className="tag-list">{styleTags.map((tag) => <span key={tag}><Check size={12} /> {tag}</span>)}</div></> : <p>Add at least one reference image to extract the tone, color, contrast, and texture your photos share.</p>}
            </div>
            <div className="privacy-note"><LockKeyhole size={14} /><span>Photos never leave this device. Mimic uses conventional pixel analysis — no generated content.</span></div>
          </aside>

          <section className="preview-panel">
            <div className="preview-toolbar"><div className="toolbar-label"><span className="panel-kicker">Preview</span><span className="preview-status">{selectedTarget ? selectedTarget.name : 'Add a target photo to begin'}</span></div><div className="mode-switch" role="group" aria-label="Preview mode">{(['original', 'mimic', 'stronger', 'softer'] as const).map((mode) => <button key={mode} className={previewMode === mode ? 'active' : ''} onClick={() => setMode(mode)}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}</div></div>
            <div className={`preview-stage ${!displayUrl ? 'is-empty' : ''}`}>
              {displayUrl ? <img src={displayUrl} alt="Mimic preview" /> : <div className="preview-empty"><div className="empty-orbit"><ImagePlus size={28} /></div><h3>Your preview will live here</h3><p>Start by adding a reference look and one photo to edit.</p></div>}
              {selectedTarget?.status === 'processing' && <div className="processing-overlay"><LoaderCircle className="spin" size={22} /><span>Adapting your look…</span></div>}
              {selectedTarget && <div className="preview-caption"><span><span className="status-dot" /> Same photo. Same scene. Your look.</span><button className={`compare-toggle ${compareOriginal ? 'active' : ''}`} onClick={() => setCompareOriginal((value) => !value)}>{compareOriginal ? 'Showing original' : 'Compare original'}</button></div>}
            </div>
            <div className="preview-footer"><div className="match-control"><div className="control-title"><span><WandSparkles size={15} /> Match strength</span><strong>{controls.strength}%</strong></div><input type="range" min="0" max="100" value={controls.strength} onChange={(event) => { updateControl('strength', Number(event.target.value)); setPreviewMode('mimic') }} /><div className="control-scale"><span>Natural</span><span>Exact look</span></div></div><div className="preview-size"><span>Preview</span><b>{selectedTarget ? '2,400 px max' : 'Waiting for photo'}</b></div></div>
          </section>

          <aside className="side-panel target-panel">
            <div className="panel-heading"><div><span className="panel-kicker">02 · Your photos</span><h2>Make them match</h2></div><span className="count-badge">{targets.length}</span></div>
            <p className="panel-copy">Mimic adapts each image separately, so a bright outdoor shot and a dark indoor shot still feel like the same set.</p>
            <UploadZone label="Add photos to edit" hint="Drop one or many images here" onFiles={addTargets} />
            {targets.length > 0 && <div className="target-list">{targets.map((target, index) => <button className={`target-item ${selectedTarget?.id === target.id ? 'selected' : ''}`} key={target.id} onClick={() => setSelectedTargetId(target.id)}><img src={target.url} alt="" /><span className="target-info"><strong>{target.name}</strong><small>{target.status === 'processing' ? 'Adapting…' : target.status === 'done' ? 'Ready to download' : target.status === 'error' ? 'Could not process' : `Photo ${String(index + 1).padStart(2, '0')}`}</small></span>{target.status === 'processing' ? <LoaderCircle className="spin target-state" size={16} /> : target.status === 'done' ? <Check className="target-state done" size={16} /> : <button className="remove-target" onClick={(event) => { event.stopPropagation(); removeTarget(target.id) }} aria-label={`Remove ${target.name}`}><Trash2 size={15} /></button>}</button>)}</div>}
            {targets.length > 0 && <button className="download-all" onClick={downloadAll} disabled={!targets.some((target) => target.processedUrl)}><ArrowDownToLine size={17} /> Download all edited photos</button>}
            <div className="batch-note"><Layers3 size={15} /><span>Batch mode keeps each photo’s lighting natural while carrying over the look.</span></div>
          </aside>
        </div>

        <section className="fine-tune-section">
          <div className="fine-tune-heading"><div><span className="panel-kicker">03 · Friendly controls</span><h2>Make it feel more like you</h2></div><span className="fine-tune-hint"><SunMedium size={15} /> Gentle by default</span></div>
          <div className="slider-grid"><Slider label="Warmer" left="Cool" right="Golden" value={controls.warmer + 50} onChange={(value) => updateControl('warmer', value - 50)} tone="warm" /><Slider label="Softer" left="Crisp" right="Dreamy" value={controls.softer + 50} onChange={(value) => updateControl('softer', value - 50)} tone="soft" /><Slider label="More film" left="Clean" right="Textured" value={controls.film} onChange={(value) => updateControl('film', value)} tone="film" /><Slider label="More color" left="Quiet" right="Rich" value={controls.color + 50} onChange={(value) => updateControl('color', value - 50)} tone="color" /></div>
        </section>

        <footer className="app-footer"><span><Aperture size={14} /> Mimic keeps the identity of your photo intact.</span><span>Built for looks, not generated scenes.</span></footer>
      </main>
      {notice && <div className="toast"><Download size={15} /> {notice}</div>}
    </div>
  )
}

export default App
