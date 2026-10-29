// 안내문 사진 클라이언트 전처리 — docs/수행평가-상세-명세.md §8.8.
//
// §8.8이 클라이언트에 요구하는 것은 두 가지다.
//   · 허용 형식(PNG/JPG/WEBP)만 고르게 하고 **HEIC는 지정 문구로 거부**한다.
//   · **장변 2000px 초과 시 canvas 리사이즈 + EXIF 회전 보정.**
//     회전 보정 없이 리사이즈하면 세로로 찍은 사진이 눕는다 — 두 처리는 한 세트다.
//
// ⚠️ 여기 있는 상한 검사는 전부 **왕복 절감용 1차 필터**다. 정본은 서버
// (`api/performance/upload-url.js`)와 버킷 정책(sql/54_performance_app.sql (6))이다.
// 이 파일의 값을 고칠 일이 생기면 그 두 곳을 먼저 고쳐야 한다.
//
// ── EXIF 회전을 누가 적용하는가 (구현 결정)
//    최신 브라우저는 <img> 렌더와 `createImageBitmap`이 기본으로 EXIF 방향을 반영한다
//    (CSS `image-orientation: from-image`가 기본값, createImageBitmap도 같은 기본).
//    그래서 여기서는 **디코더에 명시적으로 `from-image`를 요청**해 이미 보정된
//    픽셀을 받는 것을 1차 경로로 삼는다 — 그 위에 회전 행렬을 또 얹으면 두 번 돌아간다.
//
//    다만 그 가정이 틀린 디코더가 섞일 수 있으므로, JPEG 헤더에서 **원본 SOF 치수와
//    EXIF orientation을 직접 읽어** 검증한다. orientation이 5~8(축이 뒤바뀌는 회전)인데
//    디코딩 결과 치수가 원본 그대로라면 디코더가 보정하지 않았다는 뜻이므로, 그때만
//    canvas 변환을 직접 적용한다.
//    · 2·3·4(좌우 반전·180°)는 치수가 변하지 않아 이 방식으로 판별할 수 없다.
//      해당 값은 디코더 보정에 맡긴다(현행 브라우저는 전부 적용한다).
//    · **정사각(width === height) 원본도 마찬가지다.** 5~8로 돌려도 치수가 그대로라
//      "치수가 안 바뀌었으니 디코더가 안 돌렸다"는 판정이 항상 참이 되어, 이미 올바로
//      회전된 픽셀에 90°를 한 번 더 얹어 결과물을 눕혀 버린다. SNS 업로드용 크롭이나
//      일부 스캐너 출력은 실제로 정사각이므로 예외로 빼고 디코더 보정에 맡긴다.
//    · JPEG이 아닌 입력(PNG/WEBP)은 EXIF 방향 태그가 사실상 쓰이지 않아 검사하지 않는다.

const PDF_MIME_TYPE = "application/pdf";

// PDF는 이미지가 아니지만 같은 업로드 경로를 탄다. 리사이즈, EXIF 처리는 건너뛴다.
const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  PDF_MIME_TYPE,
];

// §8.8 「HEIC」 — 외부 앱은 `accept="image/*"`(suhaengpyeong/index.html:1540)라 HEIC가
// 파일 선택기에 그대로 노출됐다. 목록을 좁혀 애초에 고를 수 없게 한다.
export const IMAGE_ACCEPT_ATTR = ALLOWED_IMAGE_MIME_TYPES.join(",");

export const MAX_PHOTOS = 5; // §8.8 「최대 장수」
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // §8.8 「파일당」
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // §8.8 「합계」
const MAX_LONG_EDGE = 2000; // §8.8 「클라이언트 전처리」

// §8.8 지정 문구. 토스트 문구를 임의로 바꾸지 말 것 — 해결 방법을 알려주는 것이 이 문구의 요점이다.
export const HEIC_REJECT_MESSAGE =
  "HEIC 형식은 지원하지 않아요. 사진 앱에서 JPG로 저장한 뒤 올려주세요.";

/**
 * HEIC/HEIF 여부. MIME이 비어 오는 경우(파일 선택기 필터를 우회했거나 OS가 타입을
 * 못 붙인 경우)를 위해 확장자도 함께 본다.
 */
export function isHeicFile(file: File | null | undefined) {
  const type = String(file?.type || "").toLowerCase();
  if (type.startsWith("image/heic") || type.startsWith("image/heif"))
    return true;
  return /\.(heic|heif)$/i.test(String(file?.name || ""));
}

export function isAllowedImageFile(file: File | null | undefined) {
  return ALLOWED_IMAGE_MIME_TYPES.includes(
    String(file?.type || "").toLowerCase(),
  );
}

export function isPdfFile(file: File | null | undefined) {
  return String(file?.type || "").toLowerCase() === PDF_MIME_TYPE;
}

type JpegMeta = {
  orientation: number;
  width: number | null;
  height: number | null;
};

/** JPEG 마커를 훑어 EXIF orientation과 원본(SOF) 치수를 읽는다. 실패하면 전부 null/1이다. */
async function readJpegMeta(file: File): Promise<JpegMeta> {
  const fallback: JpegMeta = { orientation: 1, width: null, height: null };

  try {
    // EXIF는 파일 앞쪽 APP1에, SOF는 그보다 뒤지만 보통 수십 KB 안이다.
    // 전체를 읽지 않기 위해 앞 256KB만 본다(못 찾으면 fallback).
    const head = await file.slice(0, 256 * 1024).arrayBuffer();
    const view = new DataView(head);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return fallback;

    let orientation = 1;
    let width: number | null = null;
    let height: number | null = null;
    let offset = 2;

    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00) break;
      const size = view.getUint16(offset + 2);
      if (size < 2) break;

      // APP1 — Exif\0\0 + TIFF 헤더 + IFD0
      if (marker === 0xffe1 && offset + 10 <= view.byteLength) {
        const exifStart = offset + 4;
        if (view.getUint32(exifStart) === 0x45786966) {
          const tiff = exifStart + 6;
          const little = view.getUint16(tiff) === 0x4949;
          const ifd = tiff + view.getUint32(tiff + 4, little);

          if (ifd + 2 <= view.byteLength) {
            const count = view.getUint16(ifd, little);
            for (let i = 0; i < count; i += 1) {
              const entry = ifd + 2 + i * 12;
              if (entry + 12 > view.byteLength) break;
              if (view.getUint16(entry, little) === 0x0112) {
                orientation = view.getUint16(entry + 8, little) || 1;
                break;
              }
            }
          }
        }
      }

      // SOF0~SOF15(DHT 0xC4 / JPG 0xC8 / DAC 0xCC 제외) — 원본 픽셀 치수
      const low = marker & 0xff;
      if (
        low >= 0xc0 &&
        low <= 0xcf &&
        low !== 0xc4 &&
        low !== 0xc8 &&
        low !== 0xcc
      ) {
        if (offset + 9 <= view.byteLength) {
          height = view.getUint16(offset + 5);
          width = view.getUint16(offset + 7);
        }
        break;
      }

      offset += 2 + size;
    }

    return { orientation, width, height };
  } catch {
    return fallback;
  }
}

function loadImageElement(
  file: File,
): Promise<{ image: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽을 수 없습니다."));
    };
    image.src = url;
  });
}

type DecodedImage = {
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  release: () => void;
};

/** EXIF 방향이 반영된 상태로 디코딩한다(파일 상단 주석의 1차 경로). */
async function decodeOriented(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close?.(),
      };
    } catch {
      // 옵션 미지원 등 — <img> 경로로 내려간다.
    }
  }

  const { image, url } = await loadImageElement(file);
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: () => URL.revokeObjectURL(url),
  };
}

/**
 * canvas 좌표계에 EXIF 방향 변환을 얹는다. `dw`/`dh`는 **회전 전** 그려질 치수다
 * (5~8은 캔버스 쪽 가로·세로가 서로 바뀐다).
 */
function applyOrientationTransform(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  dw: number,
  dh: number,
) {
  switch (orientation) {
    case 2: // 좌우 반전
      ctx.transform(-1, 0, 0, 1, dw, 0);
      break;
    case 3: // 180°
      ctx.transform(-1, 0, 0, -1, dw, dh);
      break;
    case 4: // 상하 반전
      ctx.transform(1, 0, 0, -1, 0, dh);
      break;
    case 5: // 전치(90° CW + 좌우 반전)
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6: // 90° CW
      ctx.transform(0, 1, -1, 0, dh, 0);
      break;
    case 7: // 90° CCW + 좌우 반전
      ctx.transform(0, -1, -1, 0, dh, dw);
      break;
    case 8: // 90° CCW
      ctx.transform(0, -1, 1, 0, 0, dw);
      break;
    default:
      break;
  }
}

function canvasToFile(
  canvas: HTMLCanvasElement,
  file: File,
  mimeType: string,
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("이미지를 변환하지 못했습니다."));
          return;
        }
        resolve(
          new File([blob], file.name, {
            type: mimeType,
            lastModified: Date.now(),
          }),
        );
      },
      mimeType,
      // PNG는 quality 인자를 무시한다. JPEG/WEBP만 0.9로 재인코딩한다.
      mimeType === "image/png" ? undefined : 0.9,
    );
  });
}

/**
 * 업로드 직전 전처리. 장변이 2000px 이하이고 회전 보정도 필요 없으면 **원본 File을
 * 그대로 돌려준다** — 불필요한 재인코딩으로 화질을 깎거나 PNG 용량을 불리지 않기 위해서다.
 *
 * @param {File} file 사용자가 고른 원본
 * @returns {Promise<File>} 업로드할 파일(원본이거나 리사이즈·회전 보정본)
 */
export async function prepareGuideImage(file: File): Promise<File> {
  const mimeType = String(file?.type || "").toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType)) {
    throw new Error("지원하지 않는 이미지 형식입니다.");
  }
  if (mimeType === PDF_MIME_TYPE) return file;

  const meta =
    mimeType === "image/jpeg"
      ? await readJpegMeta(file)
      : { orientation: 1, width: null, height: null };
  const decoded = await decodeOriented(file);

  try {
    const { width, height } = decoded;
    if (!width || !height) throw new Error("이미지 크기를 읽을 수 없습니다.");

    // 디코더가 축 뒤바뀜(5~8)을 반영하지 않은 경우에만 우리가 직접 돌린다(파일 상단 주석).
    // `meta.width !== meta.height`가 이 판정의 전제다 — 정사각 원본은 회전해도 치수가
    // 그대로라 "치수가 안 바뀜 = 디코더가 안 돌림"이 성립하지 않는다(파일 상단 예외).
    const axisSwapped = meta.orientation >= 5 && meta.orientation <= 8;
    const decoderSkippedRotation =
      axisSwapped &&
      meta.width &&
      meta.height &&
      meta.width !== meta.height &&
      width === meta.width &&
      height === meta.height;
    const orientation = decoderSkippedRotation ? meta.orientation : 1;

    const longEdge = Math.max(width, height);
    const scale = longEdge > MAX_LONG_EDGE ? MAX_LONG_EDGE / longEdge : 1;

    if (scale === 1 && orientation === 1) return file;

    const dw = Math.max(1, Math.round(width * scale));
    const dh = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = orientation >= 5 ? dh : dw;
    canvas.height = orientation >= 5 ? dw : dh;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas를 사용할 수 없습니다.");

    applyOrientationTransform(ctx, orientation, dw, dh);
    ctx.drawImage(decoded.source, 0, 0, dw, dh);

    return await canvasToFile(canvas, file, mimeType);
  } finally {
    decoded.release?.();
  }
}
