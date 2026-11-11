import type { Field } from './liquify'
import type { Segment } from '../services/segment'
import { LEG_GAIN, MAX_LIP, PRESETS, WARP_COUNT, orientedSize, outputSize, warpSet, type Body, type Features, type Recipe } from './recipe'

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = vec2((p.x+1.)*.5, 1.-(p.y+1.)*.5); gl_Position = vec4(p,0,1); }`

// Preview và export dùng chung thứ tự xử lý ảnh.
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D img; uniform sampler2D mask; uniform sampler2D img0; uniform sampler2D disp; uniform sampler2D bmask;
uniform vec4 crop; uniform int rot; uniform vec2 flip;
uniform vec4 adj; uniform vec4 pre; uniform vec4 preX; uniform float preAmt;
uniform float smoothAmt; uniform vec2 rad; uniform float white;
uniform sampler2D makeupMask; uniform vec3 makeup; uniform float sharp;
uniform float denoise; uniform float vignette; uniform vec2 tonal;
uniform sampler2D personMask; uniform vec4 background; uniform bool replaceBackground; uniform bool hasPersonMask;
uniform sampler2D hairMask; uniform float hairSmooth;
uniform float sunlight; uniform vec4 colorMatch; uniform float matchAmount;
uniform vec4 sunRay; uniform vec2 sunAspect;
uniform sampler2D blurMask; uniform float backgroundBlur;
uniform vec4 wc[${WARP_COUNT}]; uniform vec2 wk[${WARP_COUNT}]; uniform vec2 wax[${WARP_COUNT}]; uniform vec2 asp;
uniform vec2 legO; uniform vec2 legV; uniform float legL; uniform float legK;
uniform float split; uniform int orig; uniform float lod;
float luma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
// Đổi sắc độ nhưng giữ độ sáng và giảm lượng màu nếu kênh RGB sắp bị cắt.
vec3 tintMakeup(vec3 color, vec3 tint, float amount){
  vec3 shift = (tint - vec3(luma(tint)))*amount;
  vec3 room = mix(color, vec3(1.)-color, step(vec3(0.),shift));
  vec3 limit = room/max(abs(shift),vec3(.0001));
  return color + shift*min(1., min(limit.r,min(limit.g,limit.b)));
}
vec3 grade(vec3 c, vec4 a, vec3 tint, float fade){
  c = pow(max(c,0.), vec3(exp2(-a.x*.85)));
  c = (c-.5)*(1.+a.y*.6)+.5;
  float l = luma(c); c = mix(vec3(l), c, 1.+a.z);
  c += vec3(a.w*.09, a.w*.012, -a.w*.09);
  c += tint; c = mix(c, vec3(.5), fade);
  return clamp(c,0.,1.);
}
vec2 toSrc(vec2 q){
  vec2 r = crop.xy + q*crop.zw;
  if(flip.x>.5) r.x = 1.-r.x;
  if(flip.y>.5) r.y = 1.-r.y;
  if(rot==1) return vec2(r.y, 1.-r.x);
  if(rot==2) return vec2(1.-r.x, 1.-r.y);
  if(rot==3) return vec2(1.-r.y, r.x);
  return r;
}
// mắt to / mũi thon / miệng nhỏ: co giãn cục bộ quanh từng nét, tắt dần về 0 ở mép vùng ảnh hưởng
vec2 warp(vec2 s){
  vec2 q = s*asp;
  if(legK!=0.){
    // chân dài: phần dưới hông được kéo giãn dọc trục thân
    float h = dot(q - legO*asp, legV);
    if(h>0.){ float h2 = h < legL*(1.+legK) ? h/(1.+legK) : h - legL*legK; q += legV*(h2-h); }
  }
  vec2 r = q;
  for(int i=0;i<${WARP_COUNT};i++){
    if(wk[i]==vec2(0.)) continue;
    vec2 d = q - wc[i].xy*asp;
    vec2 axis = wax[i];
    float along = dot(d,axis);
    float cross = dot(d,vec2(-axis.y,axis.x))/wc[i].w;
    float distance = wc[i].w == 1. ? dot(d,d) : along*along + cross*cross;
    float t = distance/(wc[i].z*wc[i].z);
    if(t<1.){ float f = (1.-t)*(1.-t); r += d*wk[i].x*f + axis*along*wk[i].y*f; }
  }
  return r/asp;
}
float skin(vec3 c){
  float y = luma(c);
  float cb = .5 + (-.1146*c.r - .3854*c.g + .5*c.b);
  float cr = .5 + (.5*c.r - .4542*c.g - .0458*c.b);
  float m = smoothstep(.28,.33,cb)*(1.-smoothstep(.49,.53,cb))*smoothstep(.51,.55,cr)*(1.-smoothstep(.67,.71,cr));
  return m*smoothstep(.1,.24,y);
}
void main(){
  vec2 s = toSrc(uv);
  bool showOriginal = orig==1 || (split>=0. && uv.x<split);
  if(!showOriginal){ s += texture(disp, s).xy; s = warp(s); }
  vec4 base = showOriginal ? textureLod(img0, s, lod) : textureLod(img, s, lod);
  vec3 c = base.rgb;
  if(!showOriginal){
    float m = texture(mask, s).r;
    if(denoise>0.){
      vec2 pixel = max(.6*rad,exp2(lod)/vec2(textureSize(img,0)));
      vec3 sum = c;
      float weights = 1.;
      for(int i=0;i<8;i++){
        float angle = float(i)*.785398;
        vec4 n = textureLod(img,s+vec2(cos(angle),sin(angle))*pixel,lod);
        float w = n.a*exp(-pow(length(n.rgb-c)*7.,2.));
        sum += n.rgb*w;
        weights += w;
      }
      c = mix(c,sum/weights,denoise*.88);
    }
    // mịn da tự động theo mặt nạ khuôn mặt, cộng với vùng tô bằng cọ làm mịn
    float sw = max(smoothAmt*m, texture(bmask, s).r);
    if(sw>.004){
      vec3 acc = c; float w = 1.;
      for(int i=-3;i<=3;i++) for(int j=-3;j<=3;j++){
        if(i==0&&j==0) continue;
        vec2 d = vec2(float(i),float(j));
        vec3 n = textureLod(img, s + d*rad, lod).rgb;
        float wt = exp(-dot(d,d)/8.) * exp(-pow(length(n-c)*9., 2.));
        acc += n*wt; w += wt;
      }
      c = mix(c, acc/w, sw);
    }
    if(white>0.){
      // trắng da: nâng sáng vùng mặt và mọi vùng có màu da, giảm nhẹ độ đậm màu
      float ww = white*max(m, .9*skin(c));
      c = pow(max(c,0.), vec3(1./(1.+.55*ww)));
      c = mix(c, vec3(luma(c)), .14*ww);
    }
    if(sharp>0.){
      vec2 d = max(rad*.65, exp2(lod)/vec2(textureSize(img, 0)));
      vec4 a = textureLod(img, s + vec2(d.x, 0.), lod);
      vec4 b = textureLod(img, s - vec2(d.x, 0.), lod);
      vec4 e = textureLod(img, s + vec2(0., d.y), lod);
      vec4 f = textureLod(img, s - vec2(0., d.y), lod);
      float weight = a.a+b.a+e.a+f.a;
      float detail = luma(base.rgb) - luma((a.rgb*a.a+b.rgb*b.a+e.rgb*e.a+f.rgb*f.a)/max(weight,.001));
      c = clamp(c + clamp(detail,-.15,.15)*sharp*(1.-.8*sw)*step(.001,weight),0.,1.);
    }
    if(any(greaterThan(makeup, vec3(0.)))){
      vec3 coverage = texture(makeupMask, s).rgb;
      float y = luma(base.rgb);
      float blush = coverage.g*m*makeup.y*makeup.y*smoothstep(.03,.25,y);
      c = tintMakeup(c, vec3(.105,-.032,.015), blush);
      if(coverage.r>0. && makeup.x>0.){
        // Làm mềm mép từ phía trong để màu vẫn nằm trong môi khi hé miệng.
        vec2 dx = vec2(rad.x*.75,0.);
        vec2 dy = vec2(0.,rad.y*.75);
        float inner = .25*(texture(makeupMask,s+dx).r + texture(makeupMask,s-dx).r
          + texture(makeupMask,s+dy).r + texture(makeupMask,s-dy).r);
        float gloss = 1.-.7*smoothstep(.5,.9,y);
        float lip = coverage.r*inner*makeup.x*gloss*smoothstep(.025,.14,y);
        c = tintMakeup(c, vec3(.20,-.065,.025), lip);
      }
      float shadow = coverage.b*makeup.z*smoothstep(.04,.3,y);
      c = tintMakeup(c, vec3(.055,-.029,.036), shadow);
    }
    if(hairSmooth>0.){
      float coverage = smoothstep(.34,.86,texture(hairMask,s).r);
      if(coverage>.001){
        vec2 dx = vec2(rad.x,0.);
        vec2 dy = vec2(0.,rad.y);
        vec4 weights = vec4(texture(hairMask,s+dx).r,texture(hairMask,s-dx).r,
          texture(hairMask,s+dy).r,texture(hairMask,s-dy).r);
        vec3 soft = c + textureLod(img,s+dx,lod).rgb*weights.x + textureLod(img,s-dx,lod).rgb*weights.y
          + textureLod(img,s+dy,lod).rgb*weights.z + textureLod(img,s-dy,lod).rgb*weights.w;
        c = mix(c,soft/(1.+dot(weights,vec4(1.))),coverage*hairSmooth*.5);
      }
    }
    float backgroundWeight = backgroundBlur>0. ? 1.-smoothstep(.12,.82,texture(personMask,s).r) : 0.;
    float brushWeight = smoothstep(0.,.65,texture(blurMask,s).r);
    float blur = max(backgroundWeight*backgroundBlur,brushWeight);
    if(blur>.001){
      vec3 sum = c;
      float weight = 1.;
      for(int i=0;i<12;i++){
        float angle = float(i)*2.399963;
        vec2 offset = vec2(cos(angle),sin(angle))*sqrt(float(i+1)/12.)*rad*blur*18.;
        vec4 sampleColor = textureLod(img,s+offset,lod);
        float sampleWeight = sampleColor.a;
        if(backgroundWeight>0. && brushWeight<.001)
          sampleWeight *= 1.-smoothstep(.12,.75,texture(personMask,s+offset).r);
        sum += sampleColor.rgb*sampleWeight;
        weight += sampleWeight;
      }
      c = mix(c,sum/weight,smoothstep(0.,.4,blur));
    }
    c = mix(c, grade(c, pre, preX.xyz, preX.w), preAmt);
    c = mix(c, clamp(c*colorMatch.a+colorMatch.rgb,0.,1.), matchAmount);
    c = grade(c, adj, vec3(0), 0.);
    if(sunlight>0.){
      vec2 delta = (sunRay.zw-sunRay.xy)*sunAspect;
      float reach = length(delta);
      vec2 axis = reach>.001 ? delta/reach : vec2(.7071,.7071);
      vec2 p = (uv-sunRay.xy)*sunAspect;
      float along = dot(p,axis);
      float cross = length(p-axis*along);
      // Nguồn sáng rộng và giảm dần theo cả hướng chiếu lẫn khoảng cách tới trục.
      float spread = .23+.32*max(along,0.);
      float feather = exp(-.5*pow(cross/spread,2.));
      float falloff = smoothstep(-.32,.12,along)*(1.-smoothstep(reach*.45,reach+.5,along));
      float light = feather*falloff*sunlight;
      float rim = 0.;
      if(hasPersonMask){
        float person = smoothstep(.20,.88,texture(personMask,s).r);
        vec2 sourceAxis = toSrc(sunRay.zw)-toSrc(sunRay.xy);
        vec2 towardLight = sourceAxis/max(length(sourceAxis),.001)*.022;
        float neighbor = smoothstep(.20,.88,texture(personMask,s-towardLight).r);
        rim = max(0.,person-neighbor)*light;
        light *= mix(.52,1.,person);
      }
      // Phản chiếu ánh ấm trên chi tiết có sẵn, với một viền sáng nhẹ phía hứng nắng.
      float y = luma(c);
      float detail = smoothstep(.015,.24,y)*(1.-smoothstep(.64,1.,y));
      vec3 linear = pow(c,vec3(2.2));
      vec3 exposure = exp2(vec3(.92,.68,.38)*light*detail);
      vec3 bounce = vec3(1.,.66,.34)*rim*.035*(1.-smoothstep(.55,1.,y));
      c = pow(clamp(linear*exposure+bounce,0.,1.),vec3(1./2.2));
    }
    if(tonal!=vec2(0.)){
      float y = luma(c);
      float shadows = tonal.x*(1.-smoothstep(.05,.62,y));
      float highlights = tonal.y*smoothstep(.38,.95,y);
      float gain = shadows+highlights;
      c += mix(c,1.-c,step(0.,gain))*gain*.6;
    }
    c *= 1.-vignette*.46*smoothstep(.26,.71,length(uv-.5));
  }
  float alpha = base.a;
  if(!showOriginal && replaceBackground){
    alpha *= smoothstep(.18,.82,texture(personMask,s).r);
    o = vec4(c*alpha + background.rgb*background.a*(1.-alpha), alpha + background.a*(1.-alpha));
  } else {
    o = vec4(c*alpha, alpha);
  }
}`

export type DrawOptions = {
  /** Kích thước canvas đầu ra; mặc định theo vùng cắt ở độ phân giải texture. */
  outW?: number
  outH?: number
  /** Hiện toàn bộ ảnh đã xoay/lật, bỏ qua vùng cắt (dùng khi đang cắt). */
  fullFrame?: boolean
  orig?: boolean
  /** Vị trí thanh chia đôi 0–1, hoặc bỏ trống. */
  split?: number
}

export type Renderer = ReturnType<typeof createRenderer>

export function createRenderer(canvas: HTMLCanvasElement, attrs: WebGLContextAttributes = {}) {
  const glOrNull = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, ...attrs })
  if (!glOrNull) throw new Error('webgl2')
  const gl = glOrNull
  const sh = (type: number, src: string) => {
    const x = gl.createShader(type)!
    gl.shaderSource(x, src)
    gl.compileShader(x)
    if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) || 'shader')
    return x
  }
  const pr = gl.createProgram()!
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS))
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(pr)
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) || 'link')
  gl.useProgram(pr)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(pr, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

  const makeTex = (unit: number) => {
    const t = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }
  const tex = makeTex(0)
  const maskTex = makeTex(1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)

  const cache = new Map<string, WebGLUniformLocation | null>()
  const U = (n: string) => {
    if (!cache.has(n)) cache.set(n, gl.getUniformLocation(pr, n))
    return cache.get(n)!
  }
  gl.uniform1i(U('img'), 0)
  gl.uniform1i(U('mask'), 1)
  gl.uniform1i(U('img0'), 2)
  gl.uniform1i(U('bmask'), 4)
  const brushTex = makeTex(4)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
  gl.uniform1i(U('disp'), 3)
  const dispTex = makeTex(3)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, 1, 1, 0, gl.RG, gl.FLOAT, new Float32Array(2))
  const origTex = makeTex(2)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  const makeupTex = makeTex(5)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
  gl.uniform1i(U('makeupMask'), 5)
  const personTex = makeTex(6)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
  gl.uniform1i(U('personMask'), 6)
  const hairTex = makeTex(7)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
  gl.uniform1i(U('hairMask'), 7)
  const blurTex = makeTex(8)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
  gl.uniform1i(U('blurMask'), 8)

  let tw = 1
  let th = 1
  // mipmap + lọc ba chiều: ảnh lớn hiển thị nhỏ vẫn mịn, không răng cưa hay nhoè
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
  const mip = () => {
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4)
  }
  let hasMask = false
  let hasPerson = false
  let hair: Segment | null = null
  let feat: Features | null = null
  let body: Body | null = null

  return {
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    get lost() {
      return gl.isContextLost()
    },
    /** img: ảnh làm việc (đã xoá mụn nếu có). original: ảnh gốc để so sánh, chỉ cần khi khác img. */
    setImage(img: TexImageSource, w: number, h: number, original?: TexImageSource) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      mip()
      gl.activeTexture(gl.TEXTURE2)
      if (original) {
        gl.bindTexture(gl.TEXTURE_2D, origTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, original)
        mip()
      } else gl.bindTexture(gl.TEXTURE_2D, tex)
      tw = w
      th = h
    },
    setMask(m: HTMLCanvasElement | null) {
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, maskTex)
      if (m) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m)
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
      hasMask = !!m
    },
    setPersonMask(mask: HTMLCanvasElement | null) {
      hasPerson = !!mask
      if (!mask) return
      gl.activeTexture(gl.TEXTURE6)
      gl.bindTexture(gl.TEXTURE_2D, personTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask)
    },
    setHair(segment: Segment | null) {
      hair = segment
      if (!hair) return
      gl.activeTexture(gl.TEXTURE7)
      gl.bindTexture(gl.TEXTURE_2D, hairTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hair.mask)
    },
    setFeatures(f: Features | null, b: Body | null) {
      if (f?.makeupMask && f.makeupMask !== feat?.makeupMask) {
        gl.activeTexture(gl.TEXTURE5)
        gl.bindTexture(gl.TEXTURE_2D, makeupTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, f.makeupMask)
      }
      feat = f
      body = b
    },
    /** Mặt nạ của cọ làm mịn; null = chưa tô gì. */
    setBrushMask(m: HTMLCanvasElement | null) {
      gl.activeTexture(gl.TEXTURE4)
      gl.bindTexture(gl.TEXTURE_2D, brushTex)
      if (m) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m)
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
    },
    setBlurMask(mask: HTMLCanvasElement | null) {
      gl.activeTexture(gl.TEXTURE8)
      gl.bindTexture(gl.TEXTURE_2D, blurTex)
      if (mask) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask)
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
    },
    /** Trường dịch chuyển của công cụ kéo nắn; null = không nắn. */
    setField(f: Field | null) {
      gl.activeTexture(gl.TEXTURE3)
      gl.bindTexture(gl.TEXTURE_2D, dispTex)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      if (f) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, f.gw, f.gh, 0, gl.RG, gl.FLOAT, f.data)
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, 1, 1, 0, gl.RG, gl.FLOAT, new Float32Array(2))
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    },
    draw(st: Recipe, o: DrawOptions = {}) {
      const geo = st.geo
      const rect = o.fullFrame ? { x: 0, y: 0, w: 1, h: 1 } : geo.rect
      const { W, H } = orientedSize(geo, tw, th)
      const size = o.fullFrame ? { w: W, h: H } : outputSize(geo, tw, th)
      const cw = o.outW ?? size.w
      const ch = o.outH ?? size.h
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
      }
      gl.viewport(0, 0, cw, ch)
      gl.uniform4f(U('crop'), rect.x, rect.y, rect.w, rect.h)
      gl.uniform1i(U('rot'), geo.rot)
      gl.uniform2f(U('flip'), +geo.fx, +geo.fy)
      const a = st.adj
      gl.uniform4f(U('adj'), a.b / 100, a.c / 100, a.s / 100, a.t / 100)
      const p = PRESETS.find((x) => x.id === st.preset.id)
      gl.uniform4f(U('pre'), p?.b ?? 0, p?.c ?? 0, p?.s ?? 0, p?.t ?? 0)
      gl.uniform4f(U('preX'), p?.tint[0] ?? 0, p?.tint[1] ?? 0, p?.tint[2] ?? 0, p?.fade ?? 0)
      gl.uniform1f(U('preAmt'), p ? st.preset.amt / 100 : 0)
      // bán kính làm mịn tính theo cạnh dài của ảnh nên preview và export cho kết quả tương đương
      const r = Math.max(tw, th) * 0.0022
      gl.uniform1f(U('smoothAmt'), hasMask ? st.smooth / 100 : 0)
      gl.uniform2f(U('rad'), r / tw, r / th)
      gl.uniform1f(U('white'), st.white / 100)
      gl.uniform1f(U('sunlight'), st.sunlight / 100)
      const ray = st.sunRay
      gl.uniform4f(U('sunRay'), ray.source.x, ray.source.y, ray.target.x, ray.target.y)
      gl.uniform2f(U('sunAspect'), cw / Math.max(cw, ch), ch / Math.max(cw, ch))
      const match = st.colorMatch
      gl.uniform4f(U('colorMatch'), ...(match?.offset ?? [0, 0, 0] as const), match?.gain ?? 1)
      gl.uniform1f(U('matchAmount'), (match?.strength ?? 0) / 100)
      gl.uniform1f(U('sharp'), st.adj.sharp / 100)
      gl.uniform2f(U('tonal'), st.adj.shadows / 100, st.adj.highlights / 100)
      gl.uniform1f(U('denoise'), st.adj.denoise / 100)
      gl.uniform1f(U('vignette'), st.adj.vignette / 100)
      gl.uniform3f(U('makeup'), feat?.makeupMask ? Math.min(MAX_LIP, st.makeup.lip) / 100 : 0,
        feat?.makeupMask ? st.makeup.blush / 100 : 0, feat?.makeupMask ? st.makeup.shadow / 100 : 0)
      const long = Math.max(tw, th)
      gl.uniform2f(U('asp'), tw / long, th / long)
      const ws = warpSet(st, feat, body)
      gl.uniform4fv(U('wc'), new Float32Array(ws.flatMap((w) => [w.c.x, w.c.y, w.c.r, w.vertical ?? 1])))
      gl.uniform2fv(U('wk'), new Float32Array(ws.flatMap((w) => [w.iso, w.axis])))
      gl.uniform2fv(U('wax'), new Float32Array(ws.flatMap((w) => [w.ux, w.uy])))
      gl.uniform2f(U('legO'), body?.hip.x ?? 0, body?.hip.y ?? 0)
      gl.uniform2f(U('legV'), body?.vx ?? 0, body?.vy ?? 1)
      gl.uniform1f(U('legL'), body?.legL ?? 1)
      gl.uniform1f(U('legK'), body ? (st.body.legs / 100) * LEG_GAIN : 0)
      // số điểm ảnh nguồn ứng với một điểm ảnh đầu ra → chọn mức mipmap phù hợp
      gl.uniform1f(U('lod'), Math.max(0, Math.log2(Math.max((rect.w * W) / cw, (rect.h * H) / ch))))
      gl.uniform1f(U('split'), o.split ?? -1)
      gl.uniform1i(U('orig'), o.orig ? 1 : 0)
      const replacement = st.background.startsWith('#')
      const rgb = replacement ? Number.parseInt(st.background.slice(1), 16) : 0
      gl.uniform1i(U('replaceBackground'), hasPerson && st.background !== 'original' ? 1 : 0)
      gl.uniform1i(U('hasPersonMask'), +hasPerson)
      gl.uniform1f(U('backgroundBlur'), hasPerson && st.background === 'original' ? st.backgroundBlur / 100 : 0)
      gl.uniform4f(U('background'), ((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, +replacement)
      gl.uniform1f(U('hairSmooth'), hair ? st.hair.smooth / 100 : 0)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    dispose() {
      gl.deleteTexture(tex)
      gl.deleteTexture(maskTex)
      gl.deleteTexture(origTex)
      gl.deleteTexture(dispTex)
      gl.deleteTexture(brushTex)
      gl.deleteTexture(makeupTex)
      gl.deleteTexture(personTex)
      gl.deleteTexture(hairTex)
      gl.deleteTexture(blurTex)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
