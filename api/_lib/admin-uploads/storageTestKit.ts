// 스토리지 가짜. 테스트 파일에서만 import 한다.
// 버킷별 객체 이름 집합을 들고 있어 move, remove, exists 가 실제처럼 상태를 바꾸고, 호출 기록으로 단언한다.

export interface StorageCall {
  bucket: string;
  op: string;
  args: unknown[];
}

export interface FakeObject {
  name: string;
  /** list 가 돌려줄 생성 시각(없으면 폴더로 본다). */
  createdAt?: string;
}

type Failure = { bucket?: string; op: string };

export function createFakeStorage(
  initial: Record<string, (string | FakeObject)[]> = {},
) {
  const buckets = new Map<string, Map<string, FakeObject>>();
  const put = (bucket: string, item: string | FakeObject) => {
    const object = typeof item === "string" ? { name: item } : item;
    if (!buckets.has(bucket)) buckets.set(bucket, new Map());
    buckets.get(bucket)?.set(object.name, object);
  };
  for (const [bucket, items] of Object.entries(initial)) {
    buckets.set(bucket, new Map());
    for (const item of items) put(bucket, item);
  }

  const calls: StorageCall[] = [];
  /** op(와 선택적으로 버킷)이 맞는 호출은 이 오류로 실패한다. remove 는 names 가 있으면 그 이름이 낀 호출만 실패한다. */
  const failures: (Failure & { names?: string[] })[] = [];
  const failed = (bucket: string, op: string, names?: string[]) =>
    failures.some(
      (f) =>
        f.op === op &&
        (f.bucket === undefined || f.bucket === bucket) &&
        (f.names === undefined || names?.some((n) => f.names?.includes(n))),
    );
  const storageError = { message: "storage error" };

  const names = (bucket: string) => [...(buckets.get(bucket)?.keys() ?? [])];

  return {
    calls,
    failures,
    names,
    put,
    storage: {
      from(bucket: string) {
        const record = (op: string, ...args: unknown[]) =>
          calls.push({ bucket, op, args });
        return {
          async createSignedUploadUrl(path: string) {
            record("createSignedUploadUrl", path);
            if (failed(bucket, "createSignedUploadUrl")) {
              return { data: null, error: storageError };
            }
            return {
              data: {
                signedUrl: `https://storage.test/storage/v1/object/upload/sign/${bucket}/${path}?token=up`,
                token: "up",
                path,
              },
              error: null,
            };
          },
          async createSignedUrl(path: string, expiresIn: number) {
            record("createSignedUrl", path, expiresIn);
            if (
              failed(bucket, "createSignedUrl") ||
              !buckets.get(bucket)?.has(path)
            ) {
              return { data: null, error: storageError };
            }
            return {
              data: {
                signedUrl: `https://storage.test/storage/v1/object/sign/${bucket}/${path}?token=read`,
              },
              error: null,
            };
          },
          async exists(path: string) {
            record("exists", path);
            if (failed(bucket, "exists")) throw new Error("exists failed");
            return {
              data: Boolean(buckets.get(bucket)?.has(path)),
              error: null,
            };
          },
          async move(
            from: string,
            to: string,
            options?: { destinationBucket?: string },
          ) {
            record("move", from, to, options);
            const object = buckets.get(bucket)?.get(from);
            if (failed(bucket, "move") || !object) {
              return { data: null, error: storageError };
            }
            buckets.get(bucket)?.delete(from);
            put(options?.destinationBucket ?? bucket, { ...object, name: to });
            return { data: { message: "Successfully moved" }, error: null };
          },
          async remove(paths: string[]) {
            record("remove", paths);
            if (failed(bucket, "remove", paths)) {
              return { data: null, error: storageError };
            }
            const removed = paths.filter((p) => buckets.get(bucket)?.delete(p));
            return { data: removed.map((name) => ({ name })), error: null };
          },
          getPublicUrl(path: string) {
            record("getPublicUrl", path);
            return {
              data: {
                publicUrl: `https://storage.test/storage/v1/object/public/${bucket}/${path}`,
              },
            };
          },
          async list(
            path: string,
            options?: {
              limit?: number;
              offset?: number;
              sortBy?: { column?: string; order?: string };
            },
          ) {
            record("list", path, options);
            if (failed(bucket, "list"))
              return { data: null, error: storageError };
            const all = [...(buckets.get(bucket)?.values() ?? [])]
              .map((o) => ({
                name: o.name,
                id: o.createdAt ? `id-${o.name}` : null,
                created_at: o.createdAt ?? null,
              }))
              .sort((a, b) =>
                String(a.created_at).localeCompare(String(b.created_at)),
              );
            const offset = options?.offset ?? 0;
            return {
              data: all.slice(offset, offset + (options?.limit ?? 100)),
              error: null,
            };
          },
        };
      },
    },
  };
}
