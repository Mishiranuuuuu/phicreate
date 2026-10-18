import { create } from 'zustand';

// Preset shaders mirrored from Phira (prpr/src/core/shaders), keyed by Phira name.
const files = import.meta.glob<string>('./presets/*.glsl', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const PRESET_SHADERS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, source]) => [path.replace(/^.*\/|\.glsl$/g, ''), source]),
);

export const PRESET_NAMES = Object.keys(PRESET_SHADERS);

export const SHADER_ACCEPT = '.glsl,.frag,.txt';

// Custom shaders as referenced by effects: '/name.glsl'.
export const isCustomShader = (shader: string) => shader.startsWith('/');
export const customShaderPath = (fileName: string) => `/${fileName.replace(/^.*[\\/]/, '')}`;

// Custom shader sources of the open project, keyed by path ('/name.glsl').
export const useShaderLibrary = create<{ custom: Record<string, string> }>(() => ({ custom: {} }));

export const setCustomShaders = (custom: Record<string, string>) =>
  useShaderLibrary.setState({ custom });

export const putCustomShader = (path: string, source: string) =>
  useShaderLibrary.setState((s) => ({ custom: { ...s.custom, [path]: source } }));

export const removeCustomShader = (path: string) =>
  useShaderLibrary.setState((s) => {
    const custom = { ...s.custom };
    delete custom[path];
    return { custom };
  });

export const renameCustomShader = (from: string, to: string) =>
  useShaderLibrary.setState((s) => {
    if (!(from in s.custom)) return s;
    const custom = { ...s.custom, [to]: s.custom[from] };
    delete custom[from];
    return { custom };
  });

export const shaderSource = (shader: string): string | undefined =>
  isCustomShader(shader) ? useShaderLibrary.getState().custom[shader] : PRESET_SHADERS[shader];

export interface ShaderUniform {
  name: string;
  // 1 = float, 2–4 = vecN.
  size: number;
  // From the `// %a, b%` comment (Phira); zeros otherwise.
  value: number[];
}

// Set by the renderer.
export const BUILTIN_UNIFORMS = new Set(['time', 'screenSize', 'UVScale', 'screenTexture']);

const UNIFORM_RE =
  /uniform\s+(?:(?:lowp|mediump|highp)\s+)?(float|vec[234])\s+(\w+)\s*;([^\r\n]*)/g;

const uniformCache = new Map<string, ShaderUniform[]>();

// Editable uniforms of a shader source.
export function parseUniforms(source: string): ShaderUniform[] {
  let list = uniformCache.get(source);
  if (list) return list;
  list = [...source.matchAll(UNIFORM_RE)]
    .filter(([, , name]) => !BUILTIN_UNIFORMS.has(name))
    .map(([, type, name, comment]) => {
      const size = type === 'float' ? 1 : Number(type.slice(3));
      const parts = comment
        .match(/%([^%]+)%/)?.[1]
        .split(',')
        .map(Number);
      const value =
        parts?.length === size && parts.every(Number.isFinite) ? parts : Array(size).fill(0);
      return { name, size, value };
    });
  uniformCache.set(source, list);
  return list;
}

// vec4 is a color (as in Phira); other vectors use xyz.
export const componentNames = (size: number) =>
  size === 1 ? [''] : size === 4 ? ['r', 'g', 'b', 'a'] : ['x', 'y', 'z'].slice(0, size);

// Var keys of a uniform: 'power', or 'offset.x', 'offset.y'.
export const uniformKeys = (u: Pick<ShaderUniform, 'name' | 'size'>) =>
  componentNames(u.size).map((c) => (c ? `${u.name}.${c}` : u.name));

export const shaderUniforms = (shader: string) => {
  const source = shaderSource(shader);
  return source ? parseUniforms(source) : [];
};

// Default value per var key.
export function varDefaults(shader: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of shaderUniforms(shader)) uniformKeys(u).forEach((k, i) => (out[k] = u.value[i]));
  return out;
}
