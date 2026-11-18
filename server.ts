import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const GEMINI_MODEL = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = /429|500|502|503|504|ECONNRESET|ETIMEDOUT/i.test(msg);
      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

const PREFERRED_GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-120b',
  'qwen/qwen3-32b',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b',
  'gemma2-9b-it',
];

let cachedGroqModel: { model: string; available: string[]; fetchedAt: number } | null = null;

async function resolveGroqModel(groqKey: string, forceRefresh = false): Promise<{ model: string; available: string[] }> {
  const envModel = process.env.GROQ_MODEL?.trim();
  if (
    !forceRefresh &&
    cachedGroqModel &&
    Date.now() - cachedGroqModel.fetchedAt < 10 * 60 * 1000
  ) {
    return { model: cachedGroqModel.model, available: cachedGroqModel.available };
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${groqKey}` },
    });
    if (res.ok) {
      const data = await res.json();
      const allIds: string[] = Array.isArray(data?.data)
        ? data.data
            .filter((m: { id?: string; active?: boolean }) => m?.id && m.active !== false)
            .map((m: { id: string }) => m.id)
        : [];
      const chatIds = allIds.filter(
        (id) => !/whisper|tts|guard|safeguard|orpheus|embed|rerank|vision-preview/i.test(id)
      );
      const picked =
        (envModel && allIds.includes(envModel) ? envModel : undefined) ||
        PREFERRED_GROQ_MODELS.find((m) => chatIds.includes(m)) ||
        chatIds[0] ||
        envModel ||
        'llama-3.1-8b-instant';

      cachedGroqModel = { model: picked, available: chatIds, fetchedAt: Date.now() };
      return { model: picked, available: chatIds };
    }
  } catch {
    // Fallback to configured or default model if model listing fails transiently
  }

  const fallback = envModel || 'llama-3.1-8b-instant';
  return { model: fallback, available: [fallback] };
}

async function callGroqChat(
  systemInstruction: string,
  userPrompt: string,
  stream = false,
  jsonMode = false
) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error('GROQ_API_KEY is not configured in server environment secrets.');
  }

  const attemptRequest = async (model: string) => {
    const body: Record<string, unknown> = {
      model,
      stream,
      temperature: jsonMode ? 0.3 : 0.6,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt },
      ],
    };
    if (jsonMode && !stream) {
      body.response_format = { type: 'json_object' };
    }

    return fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify(body),
    });
  };

  let resolved = await resolveGroqModel(groqKey);
  let response = await attemptRequest(resolved.model);

  if (response.status === 404 || response.status === 400) {
    const errPreview = await response.clone().text();
    if (/model_not_found|does not exist|decommissioned/i.test(errPreview)) {
      cachedGroqModel = null;
      resolved = await resolveGroqModel(groqKey, true);
      const fallbackCandidate =
        resolved.available.find((m) => m !== resolved.model) || resolved.model;
      response = await attemptRequest(fallbackCandidate);
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }
  return response;
}

function extractErrorStatus(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (/API_KEY_INVALID|400/i.test(msg)) return { status: 400, message: msg };
  if (/401|Unauthorized|Invalid API Key/i.test(msg)) return { status: 401, message: msg };
  if (/PERMISSION_DENIED|403/i.test(msg)) return { status: 403, message: msg };
  if (/RESOURCE_EXHAUSTED|429/i.test(msg)) return { status: 429, message: msg };
  return { status: 500, message: msg };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', async (_req: Request, res: Response) => {
    const groqKey = process.env.GROQ_API_KEY;
    const groqInfo = groqKey ? await resolveGroqModel(groqKey) : null;
    res.json({
      status: 'ok',
      env: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.round(process.uptime()),
      providers: {
        groq: Boolean(groqKey),
        gemini: Boolean(process.env.GEMINI_API_KEY),
      },
      activeGroqModel: groqInfo?.model ?? null,
      availableGroqModelsCount: groqInfo?.available.length ?? 0,
      defaultProvider:
        process.env.AI_PROVIDER === 'gemini' && process.env.GEMINI_API_KEY ? 'gemini' : 'groq',
    });
  });

  // 1. Streaming Virtual Patient Interview (SSE)
  app.post('/api/ai/patient-chat', async (req: Request, res: Response) => {
    const {
      question,
      history,
      patientSummary,
      clinicalTruth,
      language = 'ar',
      mode = 'practice',
      provider = 'groq',
    } = req.body ?? {};

    if (!question || !patientSummary || !clinicalTruth) {
      res.status(400).json({ error: 'Missing required simulation payload.' });
      return;
    }

    const langInstruction =
      language === 'ar'
        ? 'Respond naturally as the patient in clear Arabic, keeping standard English medical terms when naming medications or tests if mentioned by the patient.'
        : 'Respond naturally as the patient in clear English.';

    const systemInstruction = `You are roleplaying as a virtual hospital patient inside an educational clinical simulator (MAMO CLINICAL SIMULATOR AI).
STRICT MEDICAL CONSISTENCY RULES:
1. Never contradict the patient profile or clinical truth below.
2. Only reveal facts relevant to the doctor's specific question—do NOT volunteer the hidden diagnosis or dump the entire history unasked.
3. Express realistic emotion, pain level, or anxiety matching the patient's condition and vital signs.
4. ${langInstruction}
5. ${mode === 'beginner' ? 'Keep answers structured and clear for a medical student.' : 'Answer realistically as a real patient in clinic/ER.'}

PATIENT PROFILE:
${JSON.stringify(patientSummary)}

GROUND TRUTH HISTORY (DO NOT REVEAL ALL AT ONCE):
- HPI: ${clinicalTruth.hpiEn} | ${clinicalTruth.hpiAr}
- PMH: ${clinicalTruth.pmhEn} | ${clinicalTruth.pmhAr}
- PSH: ${clinicalTruth.pshEn} | ${clinicalTruth.pshAr}
- Medications: ${clinicalTruth.medicationsEn} | ${clinicalTruth.medicationsAr}
- Allergies: ${clinicalTruth.allergiesEn} | ${clinicalTruth.allergiesAr}
- Family History: ${clinicalTruth.familyHistoryEn} | ${clinicalTruth.familyHistoryAr}
- Social History: ${clinicalTruth.socialHistoryEn} | ${clinicalTruth.socialHistoryAr}
- Hidden True Diagnosis (NEVER say this directly): ${clinicalTruth.correctDiagnosisEn}`;

    const recentDialogue = Array.isArray(history)
      ? history
          .slice(-10)
          .map((m: { role: string; text: string }) => `${m.role === 'doctor' ? 'Doctor' : 'Patient'}: ${m.text}`)
          .join('\n')
      : '';

    const fullPrompt = `${recentDialogue ? `Prior Conversation:\n${recentDialogue}\n\n` : ''}Doctor asks: ${question}\nPatient reply:`;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    try {
      if (provider === 'groq') {
        const groqRes = await withRetry(() => callGroqChat(systemInstruction, fullPrompt, true));
        const reader = groqRes.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const payload = trimmed.slice(6);
              if (payload === '[DONE]') continue;
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
                }
              } catch {
                // ignore malformed SSE fragment
              }
            }
          }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }

      const ai = getGeminiClient();
      const stream = await withRetry(() =>
        ai.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: fullPrompt,
          config: { systemInstruction },
        })
      );

      for await (const chunk of stream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ chunk: chunk.text })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err) {
      const { status, message } = extractErrorStatus(err);
      res.write(`data: ${JSON.stringify({ error: message, status })}\n\n`);
      res.end();
    }
  });

  // 1b. Streaming AI Medical Assistant (Clinical Mentor during Interview & Exam)
  app.post('/api/ai/medical-assistant', async (req: Request, res: Response) => {
    const {
      question,
      history,
      patientSummary,
      clinicalTruth,
      sessionProgress,
      language = 'ar',
      mode = 'practice',
      provider = 'groq',
    } = req.body ?? {};

    if (!question || !patientSummary || !clinicalTruth) {
      res.status(400).json({ error: 'Missing required clinical assistant payload.' });
      return;
    }

    const langInstruction =
      language === 'ar'
        ? 'Respond in clear, structured Arabic while keeping standard English clinical terms, exam signs, and lab/drug names.'
        : 'Respond in clear, structured clinical English.';

    const systemInstruction = `You are a senior attending physician acting as an interactive AI Medical Assistant inside MAMO CLINICAL SIMULATOR AI.
STRICT TEACHING RULES:
1. Guide the doctor/medical student during their patient interrogation and examination WITHOUT bluntly revealing the final diagnosis unless they are only asking to verify their already-stated hypothesis or are in beginner mode needing a strong nudge.
2. Use the patient's actual clinical truth and current session progress (what they already asked, examined, or ordered) to give accurate, high-yield, non-contradictory clinical coaching.
3. Recommend specific follow-up history questions (e.g., OPQRST, red flags), focused bedside physical exam systems, or appropriate diagnostic investigations when asked.
4. Keep responses concise, scannable (use short bullet points), and clinically sharp—like a ChatGPT medical mentor.
5. ${langInstruction}
6. Mode: ${mode}.

PATIENT PRESENTATION:
${JSON.stringify(patientSummary)}

CURRENT SESSION PROGRESS:
${JSON.stringify(sessionProgress || {})}

CLINICAL GROUND TRUTH (USE TO GUIDE ACCURATELY—DO NOT SPOIL DIAGNOSIS OUTRIGHT):
- Correct Diagnosis: ${clinicalTruth.correctDiagnosisEn}
- Key Clues: ${(clinicalTruth.keyCluesEn || []).join('; ')}
- Essential Differentials: ${(clinicalTruth.essentialDifferentials || []).join(', ')}
- Necessary Tests: ${(clinicalTruth.necessaryTests || []).join(', ')}`;

    const recentDialogue = Array.isArray(history)
      ? history
          .slice(-12)
          .map((m: { role: string; text: string }) => {
            const label =
              m.role === 'doctor' ? 'Doctor' : m.role === 'coach' ? 'AI Medical Assistant' : 'Patient';
            return `${label}: ${m.text}`;
          })
          .join('\n')
      : '';

    const fullPrompt = `${recentDialogue ? `Encounter Conversation So Far:\n${recentDialogue}\n\n` : ''}Doctor asks AI Medical Assistant: ${question}\nAI Medical Assistant guidance:`;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    try {
      if (provider === 'groq') {
        const groqRes = await withRetry(() => callGroqChat(systemInstruction, fullPrompt, true));
        const reader = groqRes.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const payload = trimmed.slice(6);
              if (payload === '[DONE]') continue;
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
                }
              } catch {
                // ignore malformed SSE fragment
              }
            }
          }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }

      const ai = getGeminiClient();
      const stream = await withRetry(() =>
        ai.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: fullPrompt,
          config: { systemInstruction },
        })
      );
      for await (const chunk of stream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ chunk: chunk.text })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err) {
      const { status, message } = extractErrorStatus(err);
      res.write(`data: ${JSON.stringify({ error: message, status })}\n\n`);
      res.end();
    }
  });

  // 1c. Streaming Post-Evaluation AI Examiner Debrief
  app.post('/api/ai/examiner-debrief', async (req: Request, res: Response) => {
    const {
      question,
      debriefHistory,
      sessionSummary,
      evaluationReport,
      language = 'ar',
      provider = 'groq',
    } = req.body ?? {};

    if (!question || !evaluationReport) {
      res.status(400).json({ error: 'Missing examiner debrief payload.' });
      return;
    }

    const langInstruction =
      language === 'ar'
        ? 'Answer in clear Arabic with standard English clinical terms.'
        : 'Answer in clear, concise clinical English.';

    const systemInstruction = `You are the senior OSCE Medical Examiner reviewing a completed clinical simulation with the learner.
Explain why points were awarded or deducted, clarify clinical reasoning, discuss red flags and guideline-based management, and answer follow-up questions constructively.
${langInstruction}

COMPLETED EVALUATION REPORT:
${JSON.stringify(evaluationReport)}

SESSION SUMMARY:
${JSON.stringify(sessionSummary || {})}`;

    const prior = Array.isArray(debriefHistory)
      ? debriefHistory
          .slice(-8)
          .map((m: { role: string; text: string }) => `${m.role === 'doctor' ? 'Learner' : 'Examiner'}: ${m.text}`)
          .join('\n')
      : '';

    const fullPrompt = `${prior ? `Prior Debrief:\n${prior}\n\n` : ''}Learner asks Examiner: ${question}\nExaminer response:`;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    try {
      if (provider === 'groq') {
        const groqRes = await withRetry(() => callGroqChat(systemInstruction, fullPrompt, true));
        const reader = groqRes.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const payload = trimmed.slice(6);
              if (payload === '[DONE]') continue;
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) {
                  res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
                }
              } catch {
                // ignore
              }
            }
          }
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }

      const ai = getGeminiClient();
      const stream = await withRetry(() =>
        ai.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: fullPrompt,
          config: { systemInstruction },
        })
      );
      for await (const chunk of stream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ chunk: chunk.text })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err) {
      const { status, message } = extractErrorStatus(err);
      res.write(`data: ${JSON.stringify({ error: message, status })}\n\n`);
      res.end();
    }
  });

  // 2. Educational Test / ECG / Imaging Interpretation
  app.post('/api/ai/interpret-test', async (req: Request, res: Response) => {
    const {
      modality,
      findings,
      patientSummary,
      language = 'ar',
      provider = 'groq',
    } = req.body ?? {};

    if (!modality || !findings) {
      res.status(400).json({ error: 'Missing test modality or findings.' });
      return;
    }

    const systemInstruction = `You are a senior medical educator providing concise educational interpretation of a diagnostic test inside an educational simulator.
Rules:
1. Focus strictly on interpreting the provided objective test findings in context of the chief complaint and vitals.
2. Do NOT leak the final diagnosis outright—guide clinical reasoning and point out key abnormal patterns (e.g., ST segment morphology, metabolic acidosis compensation, infiltrate pattern).
3. ${language === 'ar' ? 'Write explanation in clear Arabic while preserving standard English medical terms, units, and ECG/radiology terminology.' : 'Write explanation in concise clinical English.'}
4. Begin or end clearly noting this is an AI-generated educational interpretation.`;

    const prompt = `Patient: ${JSON.stringify(patientSummary)}
Modality: ${modality}
Results/Findings: ${JSON.stringify(findings)}`;

    try {
      if (provider === 'groq') {
        const groqRes = await withRetry(() => callGroqChat(systemInstruction, prompt, false));
        const data = await groqRes.json();
        const text = data.choices?.[0]?.message?.content ?? '';
        res.json({ interpretation: text, provider: 'groq' });
        return;
      }

      const ai = getGeminiClient();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: { systemInstruction },
        })
      );
      res.json({ interpretation: response.text ?? '', provider: 'gemini' });
    } catch (err) {
      const { status, message } = extractErrorStatus(err);
      res.status(status).json({ error: message });
    }
  });

  // 3. Dynamic Clinical Case Generator (Structured JSON)
  app.post('/api/ai/generate-case', async (req: Request, res: Response) => {
    const {
      specialty = 'internal_medicine',
      difficulty = 'medium',
      archetype = 'common',
      language = 'ar',
      provider = 'groq',
    } = req.body ?? {};

    const systemInstruction = `You are a board-certified medical curriculum author generating a realistic, synthetic, medically cohesive clinical simulation case for MAMO CLINICAL SIMULATOR AI.
Rules:
1. Patient must be 100% synthetic (no real PII).
2. Vitals, HPI, Physical Exam, Labs, and ECG/Imaging MUST be internally consistent with the pathology.
3. Provide real, authentic major medical guideline names (e.g., ESC, ACC/AHA, ADA, IDSA, KDIGO, GOLD, NICE) without fabricating fake journal citations or fake DOIs.
4. ${language === 'ar' ? 'Provide rich natural Arabic in *Ar fields and crisp clinical English in *En fields.' : 'Provide accurate bilingual *En and *Ar clinical fields.'}`;

    const prompt = `Create a complete clinical simulation case for:
- Specialty: ${specialty}
- Difficulty: ${difficulty}
- Archetype: ${archetype}
Include realistic vital signs, progressive history, targeted abnormal physical exam findings, key abnormal labs (CBC, renal/electrolytes/abg/cardiac_markers as appropriate), imaging/ECG summary, differential diagnoses, treatment plan, and beginner hint.`;

    const groqCaseSchemaHint = `
Return ONLY a valid JSON object with these exact keys:
{
  "titleEn": string, "titleAr": string,
  "patientNameEn": string, "patientNameAr": string,
  "age": integer, "gender": "male" | "female",
  "chiefComplaintEn": string, "chiefComplaintAr": string,
  "settingEn": string, "settingAr": string,
  "isUrgent": boolean,
  "vitals": { "hr": integer, "bp": string, "rr": integer, "spo2": integer, "temp": number, "gcs": integer },
  "hpiEn": string, "hpiAr": string,
  "pmhEn": string, "pmhAr": string,
  "medicationsEn": string, "medicationsAr": string,
  "allergiesEn": string, "allergiesAr": string,
  "cardiovascularExamEn": string, "cardiovascularExamAr": string,
  "respiratoryExamEn": string, "respiratoryExamAr": string,
  "abdominalExamEn": string, "abdominalExamAr": string,
  "neurologicalExamEn": string, "neurologicalExamAr": string,
  "keyLabPanel": "cbc"|"crp_esr"|"renal"|"liver"|"electrolytes"|"glucose"|"thyroid"|"coagulation"|"urinalysis"|"abg"|"cardiac_markers"|"microbiology"|"hormonal",
  "keyLabItems": [{ "name": string, "value": string, "unit": string, "referenceRange": string, "flag": "normal"|"high"|"low"|"critical" }],
  "ecgFindingsEn": string, "ecgFindingsAr": string,
  "ecgPattern": "normal"|"stemi"|"afib"|"vtach"|"pe_s1q3t3",
  "correctDiagnosisEn": string, "correctDiagnosisAr": string,
  "essentialDifferentials": string[],
  "necessaryTests": string[],
  "keyCluesEn": string[], "keyCluesAr": string[],
  "correctTreatmentEn": string, "correctTreatmentAr": string,
  "beginnerHintEn": string, "beginnerHintAr": string,
  "guidelineRefs": string[]
}`;

    try {
      if (provider === 'groq') {
        const groqRes = await withRetry(() =>
          callGroqChat(systemInstruction + groqCaseSchemaHint, prompt, false, true)
        );
        const data = await groqRes.json();
        const raw = data.choices?.[0]?.message?.content ?? '{}';
        const cleaned = raw.replace(/```json|```/g, '').trim();
        res.json({ generatedCase: JSON.parse(cleaned), provider: 'groq' });
        return;
      }

      const ai = getGeminiClient();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                titleEn: { type: Type.STRING },
                titleAr: { type: Type.STRING },
                patientNameEn: { type: Type.STRING },
                patientNameAr: { type: Type.STRING },
                age: { type: Type.INTEGER },
                gender: { type: Type.STRING },
                chiefComplaintEn: { type: Type.STRING },
                chiefComplaintAr: { type: Type.STRING },
                settingEn: { type: Type.STRING },
                settingAr: { type: Type.STRING },
                isUrgent: { type: Type.BOOLEAN },
                vitals: {
                  type: Type.OBJECT,
                  properties: {
                    hr: { type: Type.INTEGER },
                    bp: { type: Type.STRING },
                    rr: { type: Type.INTEGER },
                    spo2: { type: Type.INTEGER },
                    temp: { type: Type.NUMBER },
                    gcs: { type: Type.INTEGER },
                  },
                },
                hpiEn: { type: Type.STRING },
                hpiAr: { type: Type.STRING },
                pmhEn: { type: Type.STRING },
                pmhAr: { type: Type.STRING },
                medicationsEn: { type: Type.STRING },
                medicationsAr: { type: Type.STRING },
                allergiesEn: { type: Type.STRING },
                allergiesAr: { type: Type.STRING },
                cardiovascularExamEn: { type: Type.STRING },
                cardiovascularExamAr: { type: Type.STRING },
                respiratoryExamEn: { type: Type.STRING },
                respiratoryExamAr: { type: Type.STRING },
                abdominalExamEn: { type: Type.STRING },
                abdominalExamAr: { type: Type.STRING },
                neurologicalExamEn: { type: Type.STRING },
                neurologicalExamAr: { type: Type.STRING },
                keyLabPanel: { type: Type.STRING },
                keyLabItems: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      value: { type: Type.STRING },
                      unit: { type: Type.STRING },
                      referenceRange: { type: Type.STRING },
                      flag: { type: Type.STRING },
                    },
                  },
                },
                ecgFindingsEn: { type: Type.STRING },
                ecgFindingsAr: { type: Type.STRING },
                ecgPattern: { type: Type.STRING },
                correctDiagnosisEn: { type: Type.STRING },
                correctDiagnosisAr: { type: Type.STRING },
                essentialDifferentials: { type: Type.ARRAY, items: { type: Type.STRING } },
                necessaryTests: { type: Type.ARRAY, items: { type: Type.STRING } },
                keyCluesEn: { type: Type.ARRAY, items: { type: Type.STRING } },
                keyCluesAr: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctTreatmentEn: { type: Type.STRING },
                correctTreatmentAr: { type: Type.STRING },
                beginnerHintEn: { type: Type.STRING },
                beginnerHintAr: { type: Type.STRING },
                guidelineRefs: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ generatedCase: parsed, provider: 'gemini' });
    } catch (err) {
      const { status, message } = extractErrorStatus(err);
      res.status(status).json({ error: message });
    }
  });

  // 4. 100-Point Clinical Decision Rubric Evaluator
  app.post('/api/ai/evaluate-case', async (req: Request, res: Response) => {
    const {
      clinicalCase,
      sessionData,
      language = 'ar',
      provider = 'groq',
    } = req.body ?? {};

    if (!clinicalCase || !sessionData) {
      res.status(400).json({ error: 'Missing clinicalCase or sessionData for evaluation.' });
      return;
    }

    const systemInstruction = `You are a senior OSCE medical examiner grading a learner's clinical simulation encounter on a strict 100-point rubric:
- History Taking & Patient Interrogation: max 15 points (evaluate both the quality/depth of direct questions asked to the patient in the transcript and unlocked history sections)
- Physical Exam: max 15 points
- Investigation Selection (reward necessary tests, penalize unnecessary tests): max 15 points
- Differential Diagnosis: max 20 points
- Final Diagnosis: max 15 points
- Treatment Plan (safety, dosing/priority, contraindications): max 20 points

Rules:
1. Grade objectively and fairly based on the learner's actual actions (questions asked to the patient, unlocked history sections, examined systems, ordered tests, differential list, final diagnosis, treatment plan).
2. Explicitly comment in stepByStepRationale on the learner's patient interrogation technique, clinical examination coverage, and diagnostic/therapeutic reasoning.
3. Identify potential medical errors (e.g., missed ABCDE stabilization, delayed antibiotics, contraindicated drugs, insufficient history/exam, or diagnostic anchoring).
4. ${language === 'ar' ? 'Write feedback, rationale, clues, and errors in clear Arabic while preserving English clinical medical terms.' : 'Write feedback in clear clinical English.'}
5. Never fabricate medical references; use only the case's verified guidelines or well-established international societies.`;

    const prompt = `GROUND TRUTH CASE:
${JSON.stringify({
  titleEn: clinicalCase.titleEn,
  specialty: clinicalCase.specialty,
  correctDiagnosisEn: clinicalCase.clinicalTruth.correctDiagnosisEn,
  correctDiagnosisAr: clinicalCase.clinicalTruth.correctDiagnosisAr,
  acceptableDiagnoses: clinicalCase.clinicalTruth.acceptableDiagnoses,
  essentialDifferentials: clinicalCase.clinicalTruth.essentialDifferentials,
  necessaryTests: clinicalCase.clinicalTruth.necessaryTests,
  unnecessaryTests: clinicalCase.clinicalTruth.unnecessaryTests,
  correctTreatmentEn: clinicalCase.clinicalTruth.correctTreatmentEn,
  correctTreatmentAr: clinicalCase.clinicalTruth.correctTreatmentAr,
  keyCluesEn: clinicalCase.clinicalTruth.keyCluesEn,
  keyCluesAr: clinicalCase.clinicalTruth.keyCluesAr,
  guidelineRefs: clinicalCase.guidelineRefs,
})}

LEARNER PERFORMANCE:
${JSON.stringify({
  mode: sessionData.mode,
  elapsedSeconds: sessionData.elapsedSeconds,
  unlockedHistorySections: sessionData.unlockedHistorySections,
  unlockedExamSystems: sessionData.unlockedExamSystems,
  orderedLabs: sessionData.orderedLabs,
  orderedImaging: sessionData.orderedImaging,
  questionsAskedCount: Array.isArray(sessionData.chatMessages)
    ? sessionData.chatMessages.filter((m: { role: string }) => m.role === 'doctor').length
    : 0,
  chatTranscriptSample: Array.isArray(sessionData.chatMessages)
    ? sessionData.chatMessages.slice(-14)
    : [],
  differentialList: sessionData.differentialList,
  finalDiagnosis: sessionData.finalDiagnosis,
  treatmentPlan: sessionData.treatmentPlan,
})}`;

    try {
      if (provider === 'groq') {
        const groqRes = await withRetry(() =>
          callGroqChat(
            systemInstruction +
              '\nReturn ONLY valid JSON object with exact keys: { "scoreBreakdown": { "history": int, "exam": int, "tests": int, "ddx": int, "diagnosis": int, "treatment": int }, "totalScore": int, "correctDiagnosis": string, "keyDifferentials": string[], "keyClues": string[], "necessaryTestsOrdered": string[], "necessaryTestsMissed": string[], "unnecessaryTestsOrdered": string[], "potentialErrors": string[], "correctTreatment": string, "stepByStepRationale": string, "whatShouldHaveBeenDiscovered": string[], "guidelineReferences": string[] }',
            prompt,
            false,
            true
          )
        );
        const data = await groqRes.json();
        const raw = data.choices?.[0]?.message?.content ?? '{}';
        const cleaned = raw.replace(/```json|```/g, '').trim();
        res.json({ evaluation: JSON.parse(cleaned), provider: 'groq' });
        return;
      }

      const ai = getGeminiClient();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                scoreBreakdown: {
                  type: Type.OBJECT,
                  properties: {
                    history: { type: Type.INTEGER },
                    exam: { type: Type.INTEGER },
                    tests: { type: Type.INTEGER },
                    ddx: { type: Type.INTEGER },
                    diagnosis: { type: Type.INTEGER },
                    treatment: { type: Type.INTEGER },
                  },
                },
                totalScore: { type: Type.INTEGER },
                correctDiagnosis: { type: Type.STRING },
                keyDifferentials: { type: Type.ARRAY, items: { type: Type.STRING } },
                keyClues: { type: Type.ARRAY, items: { type: Type.STRING } },
                necessaryTestsOrdered: { type: Type.ARRAY, items: { type: Type.STRING } },
                necessaryTestsMissed: { type: Type.ARRAY, items: { type: Type.STRING } },
                unnecessaryTestsOrdered: { type: Type.ARRAY, items: { type: Type.STRING } },
                potentialErrors: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctTreatment: { type: Type.STRING },
                stepByStepRationale: { type: Type.STRING },
                whatShouldHaveBeenDiscovered: { type: Type.ARRAY, items: { type: Type.STRING } },
                guidelineReferences: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({ evaluation: parsed, provider: 'gemini' });
    } catch (err) {
      const { status, message } = extractErrorStatus(err);
      res.status(status).json({ error: message });
    }
  });

  const httpServer = http.createServer(app);

  // Vite middleware in development or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.all('/api/*', (_req: Request, res: Response) => {
      res.status(404).json({ error: 'API route not found.' });
    });

    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(
        express.static(distPath, {
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
              res.setHeader('Cache-Control', 'no-cache');
            } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
          },
        })
      );
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MAMO CLINICAL SIMULATOR AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
