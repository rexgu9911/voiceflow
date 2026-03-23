import * as https from 'https'
import { GPT_MODEL } from '../shared/constants'
import { getSetting } from './settings-store'
import type { AppContext } from './active-app'

// Context-specific instructions — minimal, focused on WHAT to change
const CONTEXT_HINTS: Record<AppContext, string> = {
  email: 'EMAIL: Professional tone. Complete sentences. If speaker includes a greeting or sign-off, put them on separate lines with blank lines between greeting, body, and sign-off — like a real email.',
  chat: 'CHAT: Casual, brief. No greetings or sign-offs. Like texting.',
  code: 'CODE: Preserve all technical terms, variable names, casing exactly. Concise.',
  document: 'DOCUMENT: Formal, structured. Use paragraphs. Professional writing.',
  notes: 'NOTES: If the speaker enumerates 2+ items (in any language, any format — commas, conjunctions, numbering, etc.), ALWAYS format as a bulleted list (- item), one per line. Drop any preamble like "I need to buy..." — keep only the items. For non-list content, use short clear lines. Scannable and organized.',
  social: 'SOCIAL: Engaging, concise, natural.',
  browser: 'WEB: Clean, natural text.',
  general: 'Clean, natural written text matching the speaker\'s tone.'
}

function buildPrompt(context: AppContext, appName: string, detectedLang: string, rawText: string): string {
  const dictionary = getSetting('customDictionary')

  // Detect scripts actually present in the text (not from detectedLang label,
  // which can be wrong). This drives punctuation and spacing rules.
  const hasCJK = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(rawText)
  const hasLatin = /[a-zA-Z]{2,}/.test(rawText)
  const isMultiScript = hasCJK && hasLatin

  // Build language-mixing rules ONLY when multiple scripts are actually
  // present in the text. Previously this fired for all CJK-detected languages
  // even with mono-script text, which caused GPT to aggressively "restore"
  // words to English that were never loanwords.
  let mixingRules = ''
  if (isMultiScript) {
    mixingRules = `
Language mixing rules (the text contains multiple scripts — this is code-switching):
- Every word is intentional. NEVER translate any word to another language.
- Keep each word in the language the speaker used.
- If a clearly English loanword was mistranscribed into another language by STT, restore it to English.
- Do NOT insert spaces between CJK characters and Latin words/numbers (e.g., "用feature来实现" not "用 feature 来实现").
`
  }

  // Custom dictionary
  let dictRules = ''
  if (dictionary.length > 0) {
    dictRules = `\nCustom terms (ALWAYS preserve exact spelling/casing): ${dictionary.slice(0, 30).join(', ')}\n`
  }

  // Determine punctuation style from the actual text content, not the
  // detectedLang label. This is more reliable when Whisper misdetects.
  let punctuationRules: string
  if (hasCJK && !hasLatin) {
    // Pure CJK text
    punctuationRules = `- Use fullwidth punctuation marks (，。！？、：；「」). NEVER use halfwidth (, . ! ?).
- End every sentence with 。(or ！？ for exclamations/questions).`
  } else if (hasCJK && hasLatin) {
    // Mixed CJK + Latin
    punctuationRules = `- For CJK portions: use fullwidth marks (，。！？、：；).
- For Latin/English portions: use standard ASCII marks (, . ! ? : ;).
- At sentence boundaries, match the punctuation to the language of that sentence.`
  } else {
    // Latin / other scripts
    punctuationRules = `- Use standard ASCII punctuation marks (, . ! ? : ;).
- End every sentence with the correct terminal mark.`
  }

  return `Voice-to-text cleanup. App: ${appName}.

CRITICAL RULE — NEVER TRANSLATE:
- Output MUST be in the SAME language(s) as the input text.
- If input is Spanish, output Spanish. If Japanese, output Japanese. Etc.
- If input mixes languages, preserve each word in its original language.
- The STT label says "${detectedLang}" but may be wrong. Trust the actual text.

OUTPUT FORMAT:
${CONTEXT_HINTS[context]}

Punctuation:
${punctuationRules}
- Add commas at natural clause boundaries.
- For questions, always end with ? or ？.
- Preserve existing correct punctuation; only fix what's wrong or missing.

Spacing:
- No random extra spaces.
- For CJK text: no spaces between CJK characters; no spaces between CJK and adjacent Latin/numbers.
- For Latin text: single space between words.

Do:
- Remove speech fillers in ANY language (um, uh, 嗯, 啊, 那个, えーと, あの, 음, euh, pues, etc.)
- Keep only the final version when speaker self-corrects ("I mean X" → keep X)
- Fix obvious STT recognition errors
- When the speaker enumerates multiple items, format as a bulleted list (- item), one per line
${mixingRules}${dictRules}
Don't:
- Add content the speaker didn't say
- Add generic greetings/closings the speaker didn't express
- Change the speaker's intent or meaning
- Translate between languages
- Wrap output in quotes or add explanations

Output only the cleaned text.`
}

function post(apiKey: string, body: object): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString()
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve(body)
          else reject(new Error(`GPT ${res.statusCode}: ${body}`))
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('GPT timeout')) })
    req.write(data)
    req.end()
  })
}

export async function processTranscription(
  rawText: string,
  context: AppContext = 'general',
  appName = 'Unknown',
  detectedLang = 'en'
): Promise<string> {
  if (!rawText?.trim()) return ''

  const apiKey = getSetting('openaiApiKey')
  if (!apiKey) return rawText

  const resp = await post(apiKey, {
    model: GPT_MODEL,
    max_tokens: 2048,
    temperature: 0.1,
    messages: [
      { role: 'system', content: buildPrompt(context, appName, detectedLang, rawText) },
      { role: 'user', content: rawText }
    ]
  })

  return JSON.parse(resp).choices?.[0]?.message?.content?.trim() || rawText
}
