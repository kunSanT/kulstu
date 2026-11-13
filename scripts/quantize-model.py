# Nén trọng số model ONNX để tải nhanh hơn. Chỉ cần numpy (không cần gói onnx).
#   python scripts/quantize-model.py public/models/migan.onnx public/models/migan-int8.onnx [int8|fp16]
# int8: trọng số Conv lưu dạng int8 kèm tỉ lệ từng kênh ra, dựng lại bằng Cast + Mul đầu đồ thị.
# fp16: trọng số lưu nửa độ chính xác, dựng lại bằng Cast. ONNX Runtime gộp sẵn các phép này lúc nạp,
# nên tốc độ chạy không đổi. Chỉ dùng phép có từ opset 6, hợp với MI-GAN (opset 12).
import sys, numpy as np

# --- đọc/ghi protobuf tối giản (đủ cho ONNX), giữ nguyên các trường không đụng tới ---
def varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1; r |= (c & 0x7f) << s; s += 7
        if c < 0x80: return r, i
def parse(b):
    out = []; i = 0
    while i < len(b):
        key, i = varint(b, i); f, w = key >> 3, key & 7
        if w == 0: v, i = varint(b, i)
        elif w == 1: v = b[i:i+8]; i += 8
        elif w == 5: v = b[i:i+4]; i += 4
        elif w == 2:
            n, i = varint(b, i); v = b[i:i+n]; i += n
        else: raise ValueError(w)
        out.append([f, w, v])
    return out
def enc_varint(n):
    o = bytearray()
    while True:
        c = n & 0x7f; n >>= 7
        if n: o.append(c | 0x80)
        else: o.append(c); return bytes(o)
def ser(fields):
    o = bytearray()
    for f, w, v in fields:
        o += enc_varint((f << 3) | w)
        if w == 0: o += enc_varint(v)
        elif w == 2: o += enc_varint(len(v)); o += v
        else: o += v
    return bytes(o)

# --- nén ---
src, dst = sys.argv[1], sys.argv[2]
mode = sys.argv[3] if len(sys.argv) > 3 else 'int8'  # int8 | fp16
m = parse(open(src, 'rb').read())
gi = [k for k, (f, w, v) in enumerate(m) if f == 7][0]
g = parse(m[gi][2])

def tensor(name, dt, dims, raw):
    return ser([[1, 0, d] for d in dims] + [[2, 0, dt], [8, 2, name.encode()], [9, 2, raw]])
def node(op, ins, outs, attrs=()):
    f = [[1, 2, x.encode()] for x in ins] + [[2, 2, x.encode()] for x in outs] + [[3, 2, (outs[0] + '__' + op).encode()], [4, 2, op.encode()]]
    for name, val in attrs:
        f.append([5, 2, ser([[1, 2, name.encode()], [3, 0, val], [20, 0, 2]])])  # AttributeProto INT
    return ser(f)

new_nodes, kept = [], []
for f, w, v in g:
    if f != 5:
        kept.append([f, w, v]); continue
    t = parse(v)
    dims = [vv for ff, ww, vv in t if ff == 1 and ww == 0]
    dt = [vv for ff, ww, vv in t if ff == 2][0]
    name = [vv for ff, ww, vv in t if ff == 8][0].decode()
    raws = [vv for ff, ww, vv in t if ff == 9]
    floats = [vv for ff, ww, vv in t if ff == 4]
    if dt != 1 or len(dims) < 2 or int(np.prod(dims)) < 4096:
        kept.append([f, w, v]); continue
    if raws: arr = np.frombuffer(raws[0], dtype='<f4').reshape(dims)
    else: arr = np.frombuffer(b''.join(floats), dtype='<f4').reshape(dims)
    if mode == 'fp16':
        kept.append([5, 2, tensor(name + '__h', 10, dims, arr.astype('<f2').tobytes())])
        new_nodes.append(node('Cast', [name + '__h'], [name], [('to', 1)]))
    else:
        flat = arr.reshape(dims[0], -1)
        scale = np.abs(flat).max(axis=1) / 127.0
        scale[scale == 0] = 1.0
        q = np.clip(np.round(flat / scale[:, None]), -127, 127).astype(np.int8).reshape(dims)
        sdims = [dims[0]] + [1] * (len(dims) - 1)
        kept.append([5, 2, tensor(name + '__q', 3, dims, q.tobytes())])
        kept.append([5, 2, tensor(name + '__s', 1, sdims, scale.astype('<f4').tobytes())])
        new_nodes.append(node('Cast', [name + '__q'], [name + '__f'], [('to', 1)]))
        new_nodes.append(node('Mul', [name + '__f', name + '__s'], [name]))

# nút dựng lại trọng số đặt trước mọi nút khác (đồ thị phải theo thứ tự tô-pô)
first = next(k for k, (f, w, v) in enumerate(kept) if f == 1)
m[gi][2] = ser(kept[:first] + [[1, 2, n] for n in new_nodes] + kept[first:])
out = ser(m)
open(dst, 'wb').write(out)
print(f'{mode}: {len(new_nodes)} nút mới, tệp {len(out)/1e6:.1f} MB')
