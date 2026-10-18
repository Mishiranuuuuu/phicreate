// Runs Phira-style screen shaders (GLSL ES 1.00, `screenTexture` + `uv`) over a canvas region.

export interface ShaderPass {
  source: string;
  // Uniform values by name (float or vecN components).
  uniforms: Record<string, number[]>;
}

const VERTEX_100 = `#version 100
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const VERTEX_300 = `#version 300 es
in vec2 position;
out vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// ESSL 3.00 lifts WebGL 1's loop limits (e.g. circleBlur's uniform-bounded loops).
function toEssl300(source: string) {
  const body = source
    .replace(/^\s*#\s*version[^\n]*\n?/m, '')
    .replace(/\bvarying\b/g, 'in')
    .replace(/\btexture2D\s*\(/g, 'texture(')
    .replace(/\bgl_FragColor\b/g, 'fragColor_');
  return `#version 300 es\nprecision highp float;\nout vec4 fragColor_;\n${body}`;
}

interface Program {
  program: WebGLProgram;
  uniforms: Map<string, { location: WebGLUniformLocation; type: number }>;
}

type Compiled = Program | { error: string };

class Pipeline {
  readonly canvas = document.createElement('canvas');
  private gl: WebGL2RenderingContext | null;
  private programs = new Map<string, Compiled>();
  private grab = document.createElement('canvas');
  private targets: { texture: WebGLTexture; fbo: WebGLFramebuffer }[] = [];
  private input: WebGLTexture | null = null;
  private size = { w: 0, h: 0 };
  // Component count by uniform type.
  private sizes: Record<number, number> = {};

  constructor() {
    this.gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
    });
    const gl = this.gl;
    if (!gl) return;
    this.sizes = { [gl.FLOAT]: 1, [gl.FLOAT_VEC2]: 2, [gl.FLOAT_VEC3]: 3, [gl.FLOAT_VEC4]: 4 };
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.input = this.texture();
    for (let i = 0; i < 2; i++) {
      const texture = this.texture();
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      this.targets.push({ texture, fbo });
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  get supported() {
    return !!this.gl;
  }

  private texture() {
    const gl = this.gl!;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  // The shader, or its error log.
  private shader(type: number, source: string): WebGLShader | string {
    const gl = this.gl!;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    const error = gl.getShaderInfoLog(shader) || 'Compile error';
    gl.deleteShader(shader);
    return error;
  }

  private link(vertex: string, fragment: string): Compiled {
    const gl = this.gl!;
    const vs = this.shader(gl.VERTEX_SHADER, vertex);
    const fs = this.shader(gl.FRAGMENT_SHADER, fragment);
    if (typeof vs === 'string' || typeof fs === 'string') {
      for (const s of [vs, fs]) if (typeof s !== 'string') gl.deleteShader(s);
      return { error: typeof fs === 'string' ? fs : (vs as string) };
    }
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'position');
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program) ?? 'Link error';
      gl.deleteProgram(program);
      return { error };
    }
    const uniforms: Program['uniforms'] = new Map();
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i);
      const location = info && gl.getUniformLocation(program, info.name);
      if (info && location) uniforms.set(info.name, { location, type: info.type });
    }
    return { program, uniforms };
  }

  compile(source: string): Compiled {
    let compiled = this.programs.get(source);
    if (compiled) return compiled;
    if (!this.gl) return { error: 'WebGL 2 is not available.' };
    compiled = this.link(VERTEX_100, source);
    if ('error' in compiled) {
      const retry = this.link(VERTEX_300, toEssl300(source));
      if (!('error' in retry)) compiled = retry;
    }
    this.programs.set(source, compiled);
    return compiled;
  }

  private resize(w: number, h: number) {
    if (this.size.w === w && this.size.h === h) return;
    const gl = this.gl!;
    this.size = { w, h };
    this.canvas.width = w;
    this.canvas.height = h;
    for (const { texture } of this.targets) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
  }

  // Shades the region of `source` (device pixels) in place.
  apply(
    source: HTMLCanvasElement,
    rect: { x: number; y: number; w: number; h: number },
    passes: ShaderPass[],
    time: number,
  ) {
    const gl = this.gl;
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const w = Math.round(rect.w);
    const h = Math.round(rect.h);
    const programs = passes.flatMap((p) => {
      const c = this.compile(p.source);
      return 'error' in c ? [] : [{ ...c, values: p.uniforms }];
    });
    if (!gl || !programs.length || w <= 0 || h <= 0) return;
    this.resize(w, h);

    if (this.grab.width !== w || this.grab.height !== h) {
      this.grab.width = w;
      this.grab.height = h;
    }
    const g = this.grab.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    g.drawImage(source, x, y, w, h, 0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.input);
    // uv (0, 0) = bottom left, as in GL.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.grab);

    gl.viewport(0, 0, w, h);
    let input = this.input!;
    programs.forEach(({ program, uniforms, values }, i) => {
      const last = i === programs.length - 1;
      const target = this.targets[i % 2];
      gl.bindFramebuffer(gl.FRAMEBUFFER, last ? null : target.fbo);
      // Shaders may leave alpha unset; keep it opaque.
      gl.colorMask(true, true, true, true);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.colorMask(true, true, true, false);
      gl.useProgram(program);
      gl.bindTexture(gl.TEXTURE_2D, input);
      const all: Record<string, number[]> = {
        ...values,
        time: [time],
        screenSize: [w, h],
        UVScale: [1, 1],
      };
      for (const [name, { location, type }] of uniforms) {
        if (type === gl.SAMPLER_2D) gl.uniform1i(location, 0);
        const v = all[name];
        const size = this.sizes[type];
        if (!v || !size) continue;
        const data = Array.from({ length: size }, (_, k) => v[k] ?? 0);
        if (size === 1) gl.uniform1f(location, data[0]);
        else if (size === 2) gl.uniform2fv(location, data);
        else if (size === 3) gl.uniform3fv(location, data);
        else gl.uniform4fv(location, data);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      input = target.texture;
    });
    gl.colorMask(true, true, true, true);

    const ctx = source.getContext('2d')!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.canvas, x, y);
    ctx.restore();
  }
}

let pipeline: Pipeline | null = null;
const getPipeline = () => (pipeline ??= new Pipeline());

export const applyShaders: Pipeline['apply'] = (...args) => getPipeline().apply(...args);

// Null when the source compiles.
export function shaderError(source: string): string | null {
  const compiled = getPipeline().compile(source);
  return 'error' in compiled ? compiled.error : null;
}
