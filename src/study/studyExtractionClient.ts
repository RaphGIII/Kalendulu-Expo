import { buildAuthenticatedJsonHeaders } from '../lib/apiAuth';
import { getStudyApiUrl } from '../config/env';
import type { UserStudyTier } from '../billing/types';
import type { DetectedStudySection } from './types';

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
  const apiUrl = getStudyApiUrl();
  if (!apiUrl) {
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
  const res = await fetch(`${apiUrl}/study/extractions`, {
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
  const apiUrl = getStudyApiUrl();
  if (!apiUrl) throw new Error('Study extractor API missing.');
  const headers = await buildAuthenticatedJsonHeaders();
  const res = await fetch(`${apiUrl}/study/extractions/${jobId}`, {
    headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? 'Extraction job not found.');
  return data as StudyExtractionResult;
}

export async function deleteStudyExtractionJob(jobId: string) {
  const apiUrl = getStudyApiUrl();
  if (!apiUrl) throw new Error('Study extractor API missing.');
  const headers = await buildAuthenticatedJsonHeaders();
  await fetch(`${apiUrl}/study/extractions/${jobId}`, {
    method: 'DELETE',
    headers,
  });
}
