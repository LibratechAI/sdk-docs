// Video pipeline: types, manifest loading and ffmpeg helpers. Two scene modes:
//   composed — built from validated stills in assets/images/sdk: cursor glides, zoom, captions.
//              Deterministic, needs no live app. The default.
//   live     — a short real recording on the playground for genuinely dynamic behaviour
//              (streaming). Every step asserts its target; a wrong selector fails loudly.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT, STORYBOARDS } from './paths.ts';

const require = createRequire(import.meta.url);
export const FFMPEG_PATH: string = require('ffmpeg-static');
export const FFPROBE_PATH: string = process.env.FFPROBE_PATH ?? require('@ffprobe-installer/ffprobe').path;
export const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export interface Viewport { width: number; height: number }
export interface ComposedBeat { image: string; caption?: string; cursor_to?: [number, number]; focus?: [number, number, number]; move_ms?: number; dwell_ms?: number }
export interface LiveStep {
  caption?: string; click?: string; hover?: string; fill?: { selector: string; text: string }; press?: { selector: string; key: string };
  wait_for?: string; wait_ms?: number; expect?: string; dwell_ms?: number; timeout?: number;
}
export interface ComposedScene { id: string; output: string; mode: 'composed'; page?: string; viewport?: Viewport; beats: ComposedBeat[] }
export interface LiveScene {
  id: string; output: string; mode: 'live'; page?: string; url: string; auth?: boolean; viewport?: Viewport;
  ready: string; expect: string; steps: LiveStep[]; playback_speed?: number; trim_end_ms?: number;
}
export type Scene = ComposedScene | LiveScene;

export async function loadStoryboards(path = STORYBOARDS): Promise<Scene[]> {
  const scenes = (parse(await readFile(path, 'utf8')) ?? []) as Scene[];
  const ids = new Set<string>();
  for (const s of scenes) {
    if (!s.id || !s.output || !s.mode) throw new Error(`storyboard missing id/output/mode: ${JSON.stringify(s)}`);
    if (ids.has(s.id)) throw new Error(`duplicate storyboard id: ${s.id}`);
    ids.add(s.id);
  }
  return scenes;
}

export function selectScenes(scenes: Scene[], argv: string[]): Scene[] {
  if (argv.includes('--all')) return scenes;
  if (argv.includes('--id')) return scenes.filter((s) => s.id === argv[argv.indexOf('--id') + 1]);
  if (argv.includes('--ids')) { const ids = argv[argv.indexOf('--ids') + 1].split(','); return scenes.filter((s) => ids.includes(s.id)); }
  return [];
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
export async function inlineImage(repoRelative: string): Promise<string> {
  const abs = join(REPO_ROOT, repoRelative);
  return `data:${MIME[extname(abs).toLowerCase()] ?? 'image/png'};base64,${(await readFile(abs)).toString('base64')}`;
}

export function probeDurationSec(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFPROBE_PATH, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path]);
    let out = '';
    p.stdout.on('data', (c) => (out += c));
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve(parseFloat(out.trim())) : reject(new Error(`ffprobe exit ${code}`))));
  });
}

/** Re-encode a raw recordVideo webm to the docs' VP9 profile, trimming a lead-in/tail and applying a speed factor. */
export function finalize(rawPath: string, outPath: string, opts: { trimStartMs?: number; keepSec?: number; speed?: number } = {}): Promise<void> {
  const { trimStartMs = 0, keepSec, speed = 1 } = opts;
  const args = ['-y', '-ss', (trimStartMs / 1000).toFixed(3), ...(keepSec !== undefined ? ['-t', keepSec.toFixed(3)] : []), '-i', rawPath,
    '-filter:v', `setpts=${(1 / speed).toFixed(4)}*PTS`, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-an', outPath];
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG_PATH, args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
  });
}
