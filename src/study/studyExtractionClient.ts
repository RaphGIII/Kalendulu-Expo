import { buildAuthenticatedJsonHeaders } from '../lib/apiAuth';
import type { UserStudyTier } from '../billing';
import type { DetectedStudySection } from './types';

const API_URL = process.env.EXPO_PUBLIC_STUDY_EXTRACTOR_API_URL || process.env.EXPO_PUBLIC_PLANNER_API_URL;

export type StudyExtractionResult = {
  jobId: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  progress: {
    currentPage: number;
    totalPages: number;
    percent: number;
    stage: string;
  };
  warnings: string[];
  result?: {
    pageCount: number;
    sections: DetectedStudySection[];
    compactText?: string;
  };
  error?: string;
};

export async function startStudyExtraction(input: {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  tier: UserStudyTier;
}): Promise<StudyExtractionResult> {
  if (!API_URL) {
    throw new Error('Study extractor API missing.');
  }

  const form = new FormData();
  form.append('tier', input.tier);
  form.append('fileName', input.name);
  form.append('fileSize', String(input.size ?? 0));
  form.append('file', {
    uri: input.uri,
    name: input.name,
    type: input.mimeType || 'application/octet-stream',
  } as any);

  const authHeaders = await buildAuthenticatedJsonHeaders();
  const res = await fetch(`${API_URL}/study/extractions`, {
    method: 'POST',
    headers: {
      Authorization: authHeaders.Authorization,
    },
    body: form,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'Study extraction failed.');
  }
  return data as StudyExtractionResult;
}

export async function getStudyExtractionJob(jobId: string): Promise<StudyExtractionResult> {
  const headers = await buildAuthenticatedJsonHeaders();
  const res = await fetch(`${API_URL}/study/extractions/${jobId}`, {
    headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? 'Extraction job not found.');
  return data as StudyExtractionResult;
}

export async function deleteStudyExtractionJob(jobId: string) {
  const headers = await buildAuthenticatedJsonHeaders();
  await fetch(`${API_URL}/study/extractions/${jobId}`, {
    method: 'DELETE',
    headers,
  });
}
