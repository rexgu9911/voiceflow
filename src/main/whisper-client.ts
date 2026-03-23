import * as https from 'https'
import { WHISPER_MODEL } from '../shared/constants'
import { getSetting } from './settings-store'
import { log } from './logger'

function httpsPost(url: string, headers: Record<string, string>, body: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'POST',
        headers: { ...headers, 'Content-Length': body.length }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf-8')
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseBody)
          } else {
            reject(new Error(`Whisper API ${res.statusCode}: ${responseBody}`))
          }
        })
      }
    )
    req.on('error', (err) => reject(err))
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Whisper timeout (30s)')) })
    req.write(body)
    req.end()
  })
}

function buildMultipartBody(audioBuffer: Buffer, fields: Record<string, string>): { body: Buffer; boundary: string } {
  const boundary = '----VoiceFlowBoundary' + Date.now()
  const parts: Buffer[] = []

  for (const [key, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`))
  }

  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`))
  parts.push(audioBuffer)
  parts.push(Buffer.from('\r\n'))
  parts.push(Buffer.from(`--${boundary}--\r\n`))

  return { body: Buffer.concat(parts), boundary }
}

export interface WhisperResult {
  text: string
  noSpeech: boolean            // true if Whisper thinks there's no speech
  detectedLanguage: string     // ISO 639-1 code detected by Whisper (e.g., 'zh', 'en', 'ja')
  retried: boolean             // true if a retry was needed due to translation mismatch
}

// Threshold: if avg no_speech_prob across all segments exceeds this, treat as silence
const NO_SPEECH_THRESHOLD = 0.7

// --- Translation mismatch detection ---
// Languages whose scripts are clearly distinguishable from Latin/English.
// If Whisper detects one of these but outputs mostly ASCII, it likely translated.
const NON_LATIN_LANGS = new Set([
  'zh', 'ja', 'ko',                          // CJK
  'ar', 'fa', 'ur', 'he',                    // RTL
  'ru', 'uk', 'bg', 'sr', 'mk', 'be',       // Cyrillic
  'th', 'hi', 'bn', 'ta', 'te', 'ka',        // South Asian + Georgian
  'el',                                        // Greek
])

// Latin-script languages that typically contain diacritical marks.
// If Whisper detects one of these but the output has zero diacriticals
// in a non-trivial text, it probably translated to English.
const LATIN_LANG_DIACRITICS: Record<string, RegExp> = {
  es: /[áéíóúñ¿¡ü]/i,
  fr: /[àâæçéèêëïîôœùûüÿ]/i,
  de: /[äöüß]/i,
  pt: /[àáâãçéêíóôõú]/i,
  it: /[àèéìíîòóùú]/i,
  pl: /[ąćęłńóśźż]/i,
  tr: /[çğışöü]/i,
  sv: /[åäö]/i,
  da: /[æøå]/i,
  no: /[æøå]/i,
  ro: /[ăâîșț]/i,
  cs: /[áčďéěíňóřšťúůýž]/i,
  hu: /[áéíóöőúüű]/i,
  vi: /[àáạảãăắằặẳẵâấầậẩẫèéẹẻẽêếềệểễìíịỉĩòóọỏõôốồộổỗơớờợởỡùúụủũưứừựửữỳýỵỷỹđ]/i,
}

/**
 * Detect if Whisper likely translated the audio to English instead of
 * transcribing in the original language. This is a known Whisper bug.
 */
function looksTranslatedToEnglish(text: string, detectedLang: string): boolean {
  if (!detectedLang || detectedLang === 'en' || text.length < 5) return false

  // Non-Latin-script language detected but output is >90% ASCII → translated
  if (NON_LATIN_LANGS.has(detectedLang)) {
    const nonAsciiCount = text.replace(/[\x00-\x7F]/g, '').length
    return nonAsciiCount / text.length < 0.1
  }

  // Latin-script language detected but output has zero diacritical marks
  // (only check on longer texts — short phrases may not have them)
  const diacriticPattern = LATIN_LANG_DIACRITICS[detectedLang]
  if (diacriticPattern && text.length > 20) {
    return !diacriticPattern.test(text)
  }

  return false
}

interface WhisperRawResponse {
  text: string
  language: string
  segments: Array<{ no_speech_prob?: number }>
}

/**
 * Single Whisper API call. Extracted so we can call it twice (retry) when needed.
 */
async function callWhisper(
  audioBuffer: Buffer,
  apiKey: string,
  languageOverride?: string
): Promise<WhisperRawResponse> {
  const dictionary = getSetting('customDictionary')

  const fields: Record<string, string> = {
    model: WHISPER_MODEL,
    response_format: 'verbose_json',
    temperature: '0'
  }

  // If a specific language is requested, tell Whisper explicitly.
  // This prevents Whisper from guessing wrong and translating.
  if (languageOverride) {
    fields.language = languageOverride
  }

  // Prompt: only custom dictionary terms, NO demo sentences.
  // Demo sentences bias Whisper's language detection and cause it to
  // "translate" audio into the demo's language.
  if (dictionary.length > 0) {
    const terms = dictionary.slice(0, 30).join(', ')
    fields.prompt = terms + '.'
  }

  const { body, boundary } = buildMultipartBody(audioBuffer, fields)

  const responseText = await httpsPost(
    'https://api.openai.com/v1/audio/transcriptions',
    { Authorization: `Bearer ${apiKey}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body
  )

  const response = JSON.parse(responseText)
  return {
    text: response.text || '',
    language: response.language || '',
    segments: response.segments || []
  }
}

function parseNoSpeech(segments: Array<{ no_speech_prob?: number }>): boolean {
  if (segments.length === 0) return false
  const avg = segments.reduce((sum, s) => sum + (s.no_speech_prob ?? 0), 0) / segments.length
  return avg > NO_SPEECH_THRESHOLD
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<WhisperResult> {
  const apiKey = getSetting('openaiApiKey')
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const preferred = getSetting('preferredLanguages')
  // Normalize: undefined/empty/['auto'] all mean "full auto-detect"
  const langs = preferred?.length && preferred[0] !== 'auto' ? preferred : null

  // --- Strategy based on how many languages the user selected ---
  //
  // 1 language  → pass `language` directly to Whisper (no guessing, 100% accurate)
  // 2+ languages → auto-detect first, validate result is in the user's list,
  //                retry with best-guess language if Whisper picked wrong or translated
  // auto (null) → pure auto-detect with translation mismatch retry

  if (langs && langs.length === 1) {
    // Single language — tell Whisper exactly what to expect
    const result = await callWhisper(audioBuffer, apiKey, langs[0])
    return {
      text: result.text,
      noSpeech: parseNoSpeech(result.segments),
      detectedLanguage: result.language || langs[0],
      retried: false
    }
  }

  // Auto-detect (first pass)
  const result = await callWhisper(audioBuffer, apiKey)
  let { text, language: detectedLanguage, segments } = result
  let retried = false

  if (text && detectedLanguage) {
    let shouldRetryWithLang: string | null = null

    if (langs && langs.length > 1) {
      // Multi-language list: if Whisper detected a language NOT in the user's
      // list, retry with the first preferred language as a fallback.
      // Also retry if it looks like Whisper translated instead of transcribed.
      if (!langs.includes(detectedLanguage)) {
        shouldRetryWithLang = langs[0]
        log('Language mismatch: detected ' + detectedLanguage + ' not in preferred [' + langs.join(',') + '], retrying with ' + shouldRetryWithLang)
      } else if (looksTranslatedToEnglish(text, detectedLanguage)) {
        shouldRetryWithLang = detectedLanguage
        log('Translation detected: lang=' + detectedLanguage + ' but text looks English, retrying with explicit language')
      }
    } else {
      // Full auto mode: only retry if translation mismatch detected
      if (looksTranslatedToEnglish(text, detectedLanguage)) {
        shouldRetryWithLang = detectedLanguage
        log('Translation detected: lang=' + detectedLanguage + ' but text looks English, retrying with explicit language')
      }
    }

    if (shouldRetryWithLang) {
      const retry = await callWhisper(audioBuffer, apiKey, shouldRetryWithLang)
      text = retry.text
      detectedLanguage = retry.language || shouldRetryWithLang
      segments = retry.segments
      retried = true
    }
  }

  return {
    text,
    noSpeech: parseNoSpeech(segments),
    detectedLanguage,
    retried
  }
}
